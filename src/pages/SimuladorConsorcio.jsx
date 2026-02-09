import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calculator, Plus, Trash2, Download, Loader2, TrendingUp, X, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';
import LancesDoGrupoPanel from '@/components/simulador/LancesDoGrupoPanel';
import RelogioContemplacao from '@/components/simulador/RelogioContemplacao';
import { calcularRelogioContemplacao } from '@/components/utils/calcularRelogioContemplacao';

export default function SimuladorConsorcio() {
  const [currentUser, setCurrentUser] = useState(null);
  const [clienteNome, setClienteNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [tipoGrupo, setTipoGrupo] = useState('automovel');
  const [grupo, setGrupo] = useState('');
  const [cartas, setCartas] = useState([{ credito: '', parcela: '', prazo: '' }]);
  const [administradora, setAdministradora] = useState('');
  const [lanceEmbutidoPercentual, setLanceEmbutidoPercentual] = useState(30);
  const [usarLanceProprio, setUsarLanceProprio] = useState(false);
  const [lanceProprio, setLanceProprio] = useState('');
  const [aplicarRegraCanopus, setAplicarRegraCanopus] = useState(true);
  const [parcelasCarencia, setParcelasCarencia] = useState(3);
  const [parcelaAtoContratacao, setParcelaAtoContratacao] = useState(1);
  const [resultado, setResultado] = useState(null);
  const [relogio, setRelogio] = useState(null);
  const [menorLanceLivre, setMenorLanceLivre] = useState(null);
  const [maiorLanceLivre, setMaiorLanceLivre] = useState(null);
  const [menorLanceLimitado, setMenorLanceLimitado] = useState(null);
  const [maiorLanceLimitado, setMaiorLanceLimitado] = useState(null);

  useEffect(() => {
    loadUser();
    carregarPlanoSelecionado();
  }, []);

  const carregarPlanoSelecionado = () => {
    const dadosPlano = localStorage.getItem('planoSelecionado');
    if (dadosPlano) {
      try {
        const plano = JSON.parse(dadosPlano);
        console.log('Plano carregado:', plano);
        console.log('Grupo do plano:', plano.grupo);
        
        setCartas([{
          credito: plano.credito?.toString() || plano.valor_credito?.toString() || '',
          parcela: plano.parcela?.toString() || '',
          prazo: plano.prazo?.toString() || ''
        }]);
        
        // Preencher grupo automaticamente se vir do plano
        if (plano.grupo) {
          console.log('Setando grupo:', plano.grupo);
          setGrupo(plano.grupo);
        }
        
        localStorage.removeItem('planoSelecionado');
      } catch (e) {
        console.error('Erro ao carregar plano selecionado:', e);
      }
    }
  };

  const loadUser = async () => {
    const user = await base44.auth.me();
    setCurrentUser(user);
  };

  const { data: etapas = [] } = useQuery({
    queryKey: ['etapas-funil'],
    queryFn: () => base44.entities.EtapaFunil.filter({ status: 'ativa' }, 'ordem')
  });

  useEffect(() => {
    if (administradora === 'canopus' && ![30, 50].includes(lanceEmbutidoPercentual)) {
      setLanceEmbutidoPercentual(30);
    }
  }, [administradora, lanceEmbutidoPercentual]);

  const adicionarCarta = () => {
    setCartas([...cartas, { credito: '', parcela: '', prazo: '' }]);
  };

  const duplicarCarta = (index) => {
    const cartaOriginal = cartas[index];
    setCartas([...cartas, { ...cartaOriginal }]);
    toast.success('Carta duplicada!');
  };

  const removerCarta = (index) => {
    if (cartas.length === 1) {
      toast.error('Deve haver pelo menos uma carta');
      return;
    }
    setCartas(cartas.filter((_, i) => i !== index));
  };

  const atualizarCarta = (index, field, value) => {
    const novasCartas = [...cartas];
    novasCartas[index][field] = value;
    setCartas(novasCartas);
  };

  const creditoTotal = cartas.reduce((acc, carta) => acc + (parseFloat(carta.credito) || 0), 0);
  const parcelaTotal = cartas.reduce((acc, carta) => acc + (parseFloat(carta.parcela) || 0), 0);
  const prazoOriginal = cartas.find(c => c.prazo)?.prazo || '';
  const lanceEmbutidoValor = creditoTotal * (lanceEmbutidoPercentual / 100);
  const creditoAReceber = creditoTotal - lanceEmbutidoValor;
  
  // Calcular percentual do lance próprio em cima do crédito
  const lanceProprioPercentual = lanceProprio && creditoTotal > 0 
    ? ((parseFloat(lanceProprio) / creditoTotal) * 100).toFixed(2) 
    : '0';
  
  // Calcular percentual total ofertado (lance embutido + lance próprio)
  const percentualTotalOfertado = creditoTotal > 0
    ? (((lanceEmbutidoValor + (usarLanceProprio ? parseFloat(lanceProprio || 0) : 0)) / creditoTotal) * 100).toFixed(2)
    : '0';

  // Calcular o lance total para o resultado (embutido + próprio)
  const lanceTotal = React.useMemo(() => {
    // Se tem lance próprio E está ativo o switch, soma embutido + próprio
    if (usarLanceProprio && lanceProprio && parseFloat(lanceProprio) > 0) {
      return lanceEmbutidoValor + parseFloat(lanceProprio);
    }
    // Senão, usa apenas o lance embutido
    if (lanceEmbutidoPercentual > 0) {
      return lanceEmbutidoValor;
    }
    return 0;
  }, [usarLanceProprio, lanceProprio, lanceEmbutidoValor, lanceEmbutidoPercentual]);

  // Percentual do lance TOTAL (embutido + próprio se houver) para o relógio
  const lancePercentualTotal = React.useMemo(() => {
    if (creditoTotal <= 0 || lanceTotal <= 0) return 0;
    return (lanceTotal / creditoTotal) * 100;
  }, [lanceTotal, creditoTotal]);

  // Atualizar o relógio automaticamente quando o lance muda
  useEffect(() => {
    // Se não tem lance, limpa o relógio
    if (lancePercentualTotal <= 0) {
      setRelogio(null);
      return;
    }

    let menorLanceAtivo = null;
    let maiorLanceAtivo = null;

    // REGRA: Se tem lance próprio ativo, usa histórico LIMITADO
    if (usarLanceProprio && lanceProprio && parseFloat(lanceProprio) > 0) {
      menorLanceAtivo = menorLanceLimitado;
      maiorLanceAtivo = maiorLanceLimitado;
    } else if (lanceEmbutidoPercentual > 0) {
      // Senão, se tem lance embutido, usa histórico LIVRE
      menorLanceAtivo = menorLanceLivre;
      maiorLanceAtivo = maiorLanceLivre;
    }

    // Se não tem histórico disponível, limpa o relógio
    if (!menorLanceAtivo || !maiorLanceAtivo) {
      setRelogio(null);
      return;
    }

    // Calcula e atualiza o relógio
    const resultado = calcularRelogioContemplacao({
      lanceCliente: lancePercentualTotal,
      menorLance: menorLanceAtivo,
      maiorLance: maiorLanceAtivo
    });

    setRelogio(resultado);
  }, [
    lanceTotal, 
    lancePercentualTotal, 
    usarLanceProprio, 
    lanceProprio,
    lanceEmbutidoPercentual,
    menorLanceLivre,
    maiorLanceLivre,
    menorLanceLimitado,
    maiorLanceLimitado
  ]);

  const calcularSimulacao = () => {
    if (!clienteNome || !telefone) {
      toast.error('Preencha nome e telefone do cliente');
      return;
    }

    if (creditoTotal === 0 || parcelaTotal === 0) {
      toast.error('Informe pelo menos uma carta válida');
      return;
    }

    if (!prazoOriginal || parseFloat(prazoOriginal) <= 0) {
      toast.error('Informe o prazo original');
      return;
    }

    if (!administradora) {
      toast.error('Selecione a administradora');
      return;
    }

    if (usarLanceProprio && (!lanceProprio || parseFloat(lanceProprio) <= 0)) {
      toast.error('Informe o valor do lance próprio');
      return;
    }

    const prazoNum = parseFloat(prazoOriginal);
    const totalPlano = prazoNum * parcelaTotal;

    let novaParcelaCalculada = parcelaTotal;
    let mesesCobrados = prazoNum;
    let saldoDevedorTotal = totalPlano;
    let lanceProprioValor = 0;

    if (usarLanceProprio) {
      lanceProprioValor = parseFloat(lanceProprio);
      
      // Validar se lance próprio não é maior que o total do plano
      if (lanceProprioValor > totalPlano) {
        lanceProprioValor = totalPlano;
        toast.warning('Lance próprio ajustado para o valor máximo do plano');
      }

      // Calcular saldo devedor correto:
      // Total a pagar - 1ª parcela no ato - Lance total (embutido + próprio)
      const lanceTotalCompleto = lanceEmbutidoValor + lanceProprioValor;
      saldoDevedorTotal = totalPlano - parcelaTotal - lanceTotalCompleto;

      // Calcular meses cobrados
      if (aplicarRegraCanopus && administradora === 'canopus') {
        const mesesNaoCobrados = parcelasCarencia + parcelaAtoContratacao;
        mesesCobrados = prazoNum - mesesNaoCobrados;
        if (mesesCobrados < 1) mesesCobrados = 1;
      }

      // Calcular nova parcela
      novaParcelaCalculada = saldoDevedorTotal / mesesCobrados;
    }

    setResultado({
      creditoTotal: creditoTotal,
      creditoAReceber: creditoAReceber,
      parcelaTotal,
      totalPlano,
      lanceEmbutidoValor,
      administradora,
      lanceEmbutidoPercentual,
      prazoOriginal: prazoNum,
      novaParcela: novaParcelaCalculada,
      saldoDevedor: saldoDevedorTotal,
      usarLanceProprio,
      lanceProprio: lanceProprioValor,
      mesesCobrados,
      aplicarRegraCanopus: aplicarRegraCanopus && administradora === 'canopus'
    });
  };

  const gerarSimulacaoMutation = useMutation({
    mutationFn: async () => {
      try {
        if (!resultado) {
          throw new Error('Calcule a simulação primeiro');
        }

        if (!currentUser) {
          throw new Error('Usuário não autenticado');
        }

        // Buscar colaborador do usuário
        const colabs = await base44.entities.Colaborador.filter(
          { user_id: currentUser.id, status: 'ativo' },
          '-created_date'
        );
        
        const colab = colabs?.[0];
        
        if (!colab) {
          throw new Error('Colaborador não encontrado. Configure seu perfil primeiro.');
        }
        
        // Buscar empresa_id
        let empresaId = colab.empresa_id;
        
        // Se não tiver empresa_id, buscar primeira empresa disponível
        if (!empresaId) {
          const empresas = await base44.entities.Empresa.filter({ status: 'ativa' }, '-created_date', 1);
          if (empresas.length > 0) {
            empresaId = empresas[0].id;
          } else {
            throw new Error('Nenhuma empresa encontrada. Configure uma empresa primeiro.');
          }
        }

      // 1. Salvar simulação
      const lanceTotal = lanceEmbutidoValor + (resultado.usarLanceProprio ? resultado.lanceProprio : 0);
      
      // Calcula o total da primeira parcela reduzida somando todas as cartas
      const primeira_parcela_reduzida_total = cartas.reduce(
        (acc, c) => acc + Number(c.parcelaReduzida || 0), 
        0
      );

      // Se houver reduzida, o "no ato" deve ser a soma das reduzidas.
      // Senão, deve ser a parcela total cheia.
      const primeira_parcela_no_ato =
        primeira_parcela_reduzida_total > 0 ? primeira_parcela_reduzida_total : parcelaTotal;
      
      const simulacao = await base44.entities.Simulacao.create({
        empresa_id: empresaId,
        cliente_nome: clienteNome,
        telefone: telefone,
        tipo_grupo: tipoGrupo,
        cartas: JSON.stringify(cartas),
        credito_total: resultado.creditoTotal,
        parcela_total: parcelaTotal,
        lance_embutido_ativo: true,
        administradora: administradora,
        lance_embutido_percentual: lanceEmbutidoPercentual,
        lance_embutido_valor: lanceEmbutidoValor,
        lance_proprio_ativo: resultado.usarLanceProprio || false,
        lance_proprio_valor: resultado.usarLanceProprio ? resultado.lanceProprio : 0,
        lance_total: lanceTotal,
        prazo_original: resultado.prazoOriginal,
        novo_prazo: resultado.usarLanceProprio ? resultado.mesesCobrados : resultado.prazoOriginal,
        nova_parcela: resultado.novaParcela,
        parcela_reduzida: primeira_parcela_reduzida_total > 0,
        primeira_parcela_reduzida_total: primeira_parcela_reduzida_total,
        primeira_parcela_no_ato: primeira_parcela_no_ato,
        saldo_apos_contemplacao: resultado.saldoDevedor,
        usuario_id: currentUser.id,
        usuario_nome: colab.nome || currentUser.full_name,
        status: 'ativa'
      });

      // 2. Marcar simulação como gerada
      await base44.entities.Simulacao.update(simulacao.id, {
        pdf_url: `#simulacao-impressao-${simulacao.id}`
      });

      // 3. Verificar se já existe oportunidade para este cliente
      const telefoneLimpo = telefone.replace(/\D/g, '');
      const oportunidadesExistentes = await base44.entities.Oportunidade.list();
      
      const oportunidadeDuplicada = oportunidadesExistentes.find(op => {
        const nomeMatch = op.cliente_nome?.toLowerCase() === clienteNome.toLowerCase();
        const telefoneMatch = op.telefone_lead?.replace(/\D/g, '') === telefoneLimpo;
        return (nomeMatch || telefoneMatch) && op.status === 'aberta';
      });

      let oportunidade;

      if (oportunidadeDuplicada) {
        // Cliente já tem oportunidade aberta - atualizar
        const observacoesAtuais = oportunidadeDuplicada.observacoes || '';
        const novaSimulacaoInfo =
          `\n\n🔄 Nova Simulação (${new Date().toLocaleDateString('pt-BR')}):` +
          `\nCrédito: ${formatCurrency(resultado.creditoTotal)}` +
          `\nParcela: ${formatCurrency(resultado.usarLanceProprio ? resultado.novaParcela : parcelaTotal)}` +
          `\nLance Embutido: ${formatCurrency(lanceEmbutidoValor)}` +
          (resultado.usarLanceProprio ? `\nLance Próprio: ${formatCurrency(resultado.lanceProprio)}` : '') +
          `\nAdministradora: ${administradora}`;
        
        await base44.entities.Oportunidade.update(oportunidadeDuplicada.id, {
          empresa_id: oportunidadeDuplicada.empresa_id || empresaId,
          titulo: oportunidadeDuplicada.titulo,
          etapa_id: oportunidadeDuplicada.etapa_id,
          vendedor_id: oportunidadeDuplicada.vendedor_id,
          observacoes: observacoesAtuais + novaSimulacaoInfo,
          valor_estimado: resultado.creditoTotal,
          data_ultima_movimentacao: new Date().toISOString()
        });

        oportunidade = oportunidadeDuplicada;

        // Registrar movimentação
        await base44.entities.MovimentacaoFunil.create({
          oportunidade_id: oportunidadeDuplicada.id,
          etapa_destino_id: oportunidadeDuplicada.etapa_id,
          etapa_destino_nome: oportunidadeDuplicada.etapa_nome,
          usuario_id: currentUser.id,
          usuario_nome: colab.nome || currentUser.full_name,
          observacao: '🔄 Nova simulação adicionada'
        });

        toast.info('Cliente já possui oportunidade. Nova simulação adicionada.');
      } else {
        // Criar nova oportunidade
        const etapaSimulacao = etapas.find(e => 
          e.nome.toLowerCase().includes('simulação') || 
          e.nome.toLowerCase().includes('simulacao')
        ) || etapas[0];

        if (!etapaSimulacao) {
          throw new Error('Nenhuma etapa do funil cadastrada. Configure as etapas primeiro.');
        }

        oportunidade = await base44.entities.Oportunidade.create({
          empresa_id: empresaId,
          titulo: clienteNome,
          cliente_nome: clienteNome,
          cliente_telefone: telefone,
          telefone_lead: telefone,
          valor_estimado: resultado.creditoTotal,
          etapa_id: etapaSimulacao.id,
          etapa_nome: etapaSimulacao.nome,
          vendedor_id: currentUser.id,
          vendedor_nome: colab.nome || currentUser.full_name,
          gerente_id: colab.perfil === 'vendedor' ? colab.gerente_id : currentUser.id,
          origem: 'Simulador com Lance Embutido',
          observacoes:
            `Simulação gerada automaticamente.` +
            `\n\nCrédito a Receber: ${formatCurrency(resultado.creditoTotal)}` +
            `\nParcela: ${formatCurrency(resultado.usarLanceProprio ? resultado.novaParcela : parcelaTotal)}` +
            `\nLance Embutido: ${formatCurrency(lanceEmbutidoValor)}` +
            (resultado.usarLanceProprio ? `\nLance Próprio: ${formatCurrency(resultado.lanceProprio)}` : '') +
            `\nAdministradora: ${administradora}`,
          status: 'aberta',
          data_ultima_movimentacao: new Date().toISOString()
        });

        // Registrar movimentação no funil
        await base44.entities.MovimentacaoFunil.create({
          oportunidade_id: oportunidade.id,
          etapa_destino_id: etapaSimulacao.id,
          etapa_destino_nome: etapaSimulacao.nome,
          usuario_id: currentUser.id,
          usuario_nome: colab.nome || currentUser.full_name,
          observacao: 'Simulação gerada'
        });
      }

      // Vincular oportunidade à simulação (bidirecional)
      await base44.entities.Simulacao.update(simulacao.id, {
        oportunidade_id: oportunidade.id
      });

      // Vincular simulação à oportunidade
      await base44.entities.Oportunidade.update(oportunidade.id, {
        empresa_id: oportunidade.empresa_id,
        titulo: oportunidade.titulo,
        etapa_id: oportunidade.etapa_id,
        vendedor_id: oportunidade.vendedor_id,
        observacoes: (oportunidade.observacoes || '') + `\n\n📊 Simulação ID: ${simulacao.id}`
      });

      // Auditoria
      await base44.entities.LogAuditoria.create({
        usuario_id: currentUser.id,
        usuario_nome: colab.nome || currentUser.full_name,
        acao: `Simulação gerada para ${clienteNome}`,
        entidade: 'Simulacao',
        entidade_id: simulacao.id,
        tipo: 'criacao'
      });

      return { simulacao, oportunidade };
      } catch (error) {
        console.error('Erro detalhado:', error);
        throw error;
      }
    },
    onSuccess: ({ simulacao }) => {
      toast.success('Simulação gerada com sucesso!');
      
      // Navegar para página de impressão usando createPageUrl
      setTimeout(() => {
        window.location.href = createPageUrl('ImprimirSimulacao') + `?id=${simulacao.id}`;
      }, 300);
    },
    onError: (error) => {
      console.error('Erro ao gerar simulação:', error);
      toast.error(error?.message || 'Erro ao gerar simulação');
    }
  });



  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const formatPhone = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 10) {
      return numbers.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  };

  const handleMoedaInput = (value) => {
    // Remove tudo exceto números
    const numeros = value.replace(/\D/g, '');
    // Converte para número dividindo por 100 (centavos)
    const valorNumerico = parseFloat(numeros) / 100;
    return valorNumerico;
  };

  const formatarParaExibicao = (valor) => {
    if (!valor) return '';
    const num = parseFloat(valor);
    if (isNaN(num)) return '';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="space-y-3">
      <div className="text-center mb-3">
        <div className="flex justify-center mb-2">
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6950a9860c8af0e2ff10fc9e/1b5f2d0a1_JDPromotoraICON3.png" 
            alt="JD Promotora" 
            className="h-12 w-auto object-contain"
          />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Simulação com Lance Embutido</h1>
        <p className="text-slate-500">Simulação com lance embutido de administradoras</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Formulário - 2 colunas */}
        <div className="lg:col-span-2 space-y-3">
          {/* Dados do Cliente */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                📋 Dados do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <Label>Nome do Cliente *</Label>
                  <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Nome completo" />
                </div>
                <div>
                  <Label>Telefone *</Label>
                  <Input value={telefone} onChange={(e) => setTelefone(formatPhone(e.target.value))} placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Tipo do Consórcio *</Label>
                <Select value={tipoGrupo} onValueChange={setTipoGrupo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="automovel">Automóvel</SelectItem>
                    <SelectItem value="imovel">Imóvel</SelectItem>
                    <SelectItem value="motocicleta">Motocicleta</SelectItem>
                    <SelectItem value="servico">Serviço</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Número do Grupo</Label>
                <Input 
                  value={grupo} 
                  onChange={(e) => setGrupo(e.target.value)} 
                  placeholder="Ex: 8320"
                />
              </div>
            </CardContent>
          </Card>

          {/* Histórico de Lances do Grupo */}
          {grupo && (
            <LancesDoGrupoPanel 
              grupo={grupo}
              onMenorLanceLivreChange={setMenorLanceLivre}
              onMaiorLanceLivreChange={setMaiorLanceLivre}
              onMenorLanceLimitadoChange={setMenorLanceLimitado}
              onMaiorLanceLimitadoChange={setMaiorLanceLimitado}
            />
          )}

          {/* Cartas de Crédito */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  💳 Cartas de Crédito (Multi-Cotas)
                </CardTitle>
                <Button
                  onClick={adicionarCarta}
                  size="sm"
                  variant="outline"
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Carta
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {cartas.map((carta, index) => (
               <div key={index} className="relative p-2 bg-slate-50 rounded-lg border">
                  <div className="absolute top-1 right-1 flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => duplicarCarta(index)}
                      className="h-6 w-6 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      title="Duplicar carta"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    {cartas.length > 1 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removerCarta(index)}
                        className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Remover carta"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Crédito (R$) *</Label>
                      <Input
                        type="text"
                        value={carta.credito ? formatarParaExibicao(carta.credito) : ''}
                        onChange={(e) => {
                          const valorNumerico = handleMoedaInput(e.target.value);
                          atualizarCarta(index, 'credito', valorNumerico > 0 ? valorNumerico.toString() : '');
                        }}
                        placeholder="0,00"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Parcela (R$) *</Label>
                      <Input
                        type="text"
                        value={carta.parcela ? formatarParaExibicao(carta.parcela) : ''}
                        onChange={(e) => {
                          const valorNumerico = handleMoedaInput(e.target.value);
                          atualizarCarta(index, 'parcela', valorNumerico > 0 ? valorNumerico.toString() : '');
                        }}
                        placeholder="0,00"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Prazo (meses) *</Label>
                      <Input
                        type="number"
                        min="1"
                        value={carta.prazo}
                        onChange={(e) => atualizarCarta(index, 'prazo', e.target.value)}
                        placeholder="Ex: 120"
                        className="h-9"
                      />
                    </div>
                  </div>

                  {carta.credito && carta.parcela && carta.prazo && (
                    <div className="mt-1 text-xs text-slate-600 pt-1 border-t">
                      <span className="font-semibold">
                        {formatCurrency(parseFloat(carta.credito))} • 
                        {formatCurrency(parseFloat(carta.parcela))}/mês • 
                        {carta.prazo} meses
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {/* Totais */}
              <div className="p-2 bg-blue-50 rounded-lg border border-blue-200">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-blue-700">💰 Crédito Total</p>
                    <p className="text-xl font-bold text-blue-900">{formatCurrency(creditoTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-700">📅 Parcela Total/mês</p>
                    <p className="text-xl font-bold text-blue-900">{formatCurrency(parcelaTotal)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lance Embutido */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                🎯 Lance Embutido
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <Label className="text-xs">Administradora *</Label>
                <Select value={administradora} onValueChange={setAdministradora}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a administradora" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="canopus">Canopus</SelectItem>
                    <SelectItem value="itau">Itaú Consórcio</SelectItem>
                    <SelectItem value="outra">Outra</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Percentual do Lance (%)</Label>
                <Select
                  value={lanceEmbutidoPercentual.toString()}
                  onValueChange={(value) => setLanceEmbutidoPercentual(parseFloat(value))}
                  disabled={!administradora}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={!administradora ? "Selecione a administradora" : undefined} />
                  </SelectTrigger>
                  <SelectContent>
                    {administradora === 'canopus' ? (
                      <>
                        <SelectItem value="30">30%</SelectItem>
                        <SelectItem value="50">50%</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="25">25%</SelectItem>
                        <SelectItem value="30">30%</SelectItem>
                        <SelectItem value="35">35%</SelectItem>
                        <SelectItem value="40">40%</SelectItem>
                        <SelectItem value="45">45%</SelectItem>
                        <SelectItem value="50">50%</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {lanceEmbutidoValor > 0 && (
                <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                  <p className="text-xs text-emerald-700">🏆 Valor do Lance Embutido</p>
                  <p className="text-2xl font-bold text-emerald-900">{formatCurrency(lanceEmbutidoValor)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lance Próprio (Recurso Próprio) */}
          {lanceEmbutidoPercentual > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  💰 Lance Próprio (Recurso Próprio)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                  <div>
                    <Label className="text-sm font-medium">Deseja ofertar Recurso Próprio junto com o Lance Embutido?</Label>
                    <p className="text-xs text-slate-500 mt-1">Oferece um valor adicional para reduzir as parcelas</p>
                  </div>
                  <Switch checked={usarLanceProprio} onCheckedChange={setUsarLanceProprio} />
                </div>

                {usarLanceProprio && (
                  <>
                    {administradora === 'canopus' && (tipoGrupo === 'automovel' || tipoGrupo === 'imovel') && (
                      <>
                        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <div>
                            <Label className="text-sm font-medium">Aplicar regra Canopus?</Label>
                            <p className="text-xs text-blue-600 mt-1">Carência de 3 parcelas + 1 parcela no ato</p>
                          </div>
                          <Switch checked={aplicarRegraCanopus} onCheckedChange={setAplicarRegraCanopus} />
                        </div>

                        {aplicarRegraCanopus && (
                          <div className="grid grid-cols-2 gap-2">
                                   <div>
                                     <Label className="text-xs">Parcelas de Carência</Label>
                              <Input
                                type="number"
                                min="0"
                                value={parcelasCarencia}
                                onChange={(e) => setParcelasCarencia(parseInt(e.target.value) || 0)}
                                className="h-9"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Parcela no Ato</Label>
                              <Input
                                type="number"
                                min="0"
                                value={parcelaAtoContratacao}
                                onChange={(e) => setParcelaAtoContratacao(parseInt(e.target.value) || 0)}
                                className="h-9"
                              />
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                       <div>
                         <Label className="text-xs">Valor do Lance Próprio (R$) *</Label>
                        <Input
                          type="text"
                          value={lanceProprio ? formatarParaExibicao(lanceProprio) : ''}
                          onChange={(e) => {
                            const valorNumerico = handleMoedaInput(e.target.value);
                            setLanceProprio(valorNumerico > 0 ? valorNumerico.toString() : '');
                          }}
                          placeholder="0,00"
                        />
                        {lanceProprio && parseFloat(lanceProprio) > 0 && (
                          <div className="mt-1 p-2 bg-purple-50 rounded-lg border border-purple-200">
                            <p className="text-xs text-purple-700">💎 Lance Próprio</p>
                            <p className="text-2xl font-bold text-purple-900">{formatCurrency(parseFloat(lanceProprio))}</p>
                            <p className="text-xs text-purple-700 mt-1">
                              {lanceProprioPercentual}% do crédito total
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Relógio de Contemplação */}
                      {relogio && (
                        <RelogioContemplacao
                          relogio={relogio}
                          lanceOfertado={lancePercentualTotal}
                        />
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">📊 Calcular</CardTitle>
            </CardHeader>
            <CardContent>
              <Button onClick={calcularSimulacao} className="w-full bg-[#23BE84] hover:bg-[#1da570] gap-2">
                <Calculator className="w-4 h-4" />
                Calcular Simulação
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Resultado - 1 coluna */}
        <div className="lg:col-span-1">
          <Card className="border-0 shadow-sm sticky top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                Resultado
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!resultado ? (
                <div className="text-center py-12 text-slate-500">
                  <Calculator className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="text-sm">Preencha os dados e calcule a simulação</p>
                </div>
              ) : (
                <div className="space-y-2">
                    {/* Informações do Cliente */}
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-600 font-semibold mb-2">👤 Cliente</p>
                    <p className="text-sm font-medium text-slate-900">{clienteNome}</p>
                    <p className="text-xs text-slate-600">{telefone}</p>
                    <p className="text-xs text-slate-600 capitalize mt-1">
                      {tipoGrupo === 'automovel' ? 'Automóvel' : tipoGrupo === 'imovel' ? 'Imóvel' : tipoGrupo === 'motocicleta' ? 'Motocicleta' : tipoGrupo}
                    </p>
                  </div>

                  {/* Informações do Plano */}
                  <div className="p-2 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-700 font-semibold mb-1">📋 Plano</p>
                    <p className="text-sm font-medium text-blue-900">
                      Crédito Total {formatCurrency(creditoTotal)}
                    </p>
                    <p className="text-xs text-blue-800 mt-1">
                      {prazoOriginal} Meses de {formatCurrency(parcelaTotal)}
                    </p>
                  </div>

                  <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                    <p className="text-xs text-emerald-700 font-semibold mb-1">🎯 Lance Embutido</p>
                    <p className="text-lg font-bold text-emerald-900">{formatCurrency(resultado.lanceEmbutidoValor)}</p>
                    <p className="text-xs text-emerald-800 mt-1">
                      {resultado.lanceEmbutidoPercentual}% • {resultado.administradora}
                    </p>
                  </div>

                  <div className="p-2 bg-gradient-to-r from-[#23BE84] to-[#1da570] rounded-lg text-white">
                    <p className="text-xs font-semibold">💰 Valor a Receber</p>
                    <p className="text-2xl font-bold">{formatCurrency(resultado.creditoAReceber)}</p>
                    <p className="text-xs mt-0.5 opacity-90">
                      Crédito Total: {formatCurrency(resultado.creditoTotal)}
                    </p>
                  </div>

                  {resultado.usarLanceProprio && (
                    <>
                      <div className="p-2 bg-purple-50 rounded-lg border border-purple-200">
                        <p className="text-xs text-purple-700 font-semibold mb-1">💎 Lance Próprio</p>
                        <p className="text-lg font-bold text-purple-900">{formatCurrency(resultado.lanceProprio)}</p>
                        <p className="text-xs text-purple-700 mt-0.5">
                          {lanceProprioPercentual}% do crédito total
                        </p>
                      </div>

                      <div className="p-2 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg text-white">
                        <p className="text-xs font-semibold">🎯 Percentual Total Ofertado</p>
                        <p className="text-2xl font-bold">{percentualTotalOfertado}%</p>
                        <p className="text-xs mt-0.5 opacity-90">
                          Lance Embutido ({resultado.lanceEmbutidoPercentual}%) + Lance Próprio ({lanceProprioPercentual}%)
                        </p>
                      </div>

                      <div className="p-2 bg-slate-50 rounded-lg space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Total a pagar:</span>
                          <span className="font-semibold">{formatCurrency(resultado.totalPlano)}</span>
                        </div>
                        <div className="flex justify-between text-red-600">
                          <span>(-)Lance total:</span>
                          <span className="font-semibold">-{formatCurrency(resultado.lanceEmbutidoValor + resultado.lanceProprio)}</span>
                        </div>
                        <div className="flex justify-between text-red-600">
                          <span>(-)1ª parcela na contratação:</span>
                          <span className="font-semibold">-{formatCurrency(resultado.parcelaTotal)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-2">
                          <span className="text-slate-900 font-semibold">Saldo devedor:</span>
                          <span className="font-bold text-lg">{formatCurrency(resultado.totalPlano - resultado.parcelaTotal - (resultado.lanceEmbutidoValor + resultado.lanceProprio))}</span>
                        </div>
                        <div className="flex justify-between text-xs mt-2 pt-2 border-t">
                          <span className="text-slate-600">Meses Cobrados:</span>
                          <span className="font-semibold">
                            {resultado.mesesCobrados} 
                            {resultado.aplicarRegraCanopus && ' (prazo - 1 no ato - 3 carência)'}
                          </span>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="p-4 bg-purple-50 rounded-lg border-2 border-purple-300">
                    <p className="text-xs text-purple-700 font-semibold mb-3">✨ Resultado Final</p>
                    <div className="space-y-2">
                      {resultado.usarLanceProprio ? (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-purple-700 text-sm">Parcelas:</span>
                            <span className="font-bold text-purple-900 text-xl">{resultado.mesesCobrados}x</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-purple-700 text-sm">Nova Parcela:</span>
                            <span className="font-bold text-purple-900 text-xl">{formatCurrency(resultado.novaParcela)}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-purple-700 text-sm">Prazo:</span>
                            <span className="font-bold text-purple-900 text-xl">{resultado.prazoOriginal} meses</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-purple-700 text-sm">Parcela:</span>
                            <span className="font-bold text-purple-900 text-xl">{formatCurrency(resultado.parcelaTotal)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Ação */}
                  <Button
                    onClick={() => gerarSimulacaoMutation.mutate()}
                    disabled={gerarSimulacaoMutation.isPending}
                    className="w-full bg-[#23BE84] hover:bg-[#1da570] gap-2"
                  >
                    {gerarSimulacaoMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Gerando...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Gerar Simulação e Enviar ao Funil
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-slate-500 text-center">
                    Será aberta a página de impressão da simulação
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}