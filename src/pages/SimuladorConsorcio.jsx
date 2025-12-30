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
import { Calculator, Plus, Trash2, Download, Loader2, TrendingUp, X } from 'lucide-react';
import { toast } from 'sonner';

export default function SimuladorConsorcio() {
  const [currentUser, setCurrentUser] = useState(null);
  const [clienteNome, setClienteNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [tipoGrupo, setTipoGrupo] = useState('automovel');
  const [cartas, setCartas] = useState([{ credito: '', parcela: '', prazo: '' }]);

  const [lanceEmbutidoAtivo, setLanceEmbutidoAtivo] = useState(false);
  const [administradora, setAdministradora] = useState(''); // canopus | itau | outra
  const [lanceEmbutidoPercentual, setLanceEmbutidoPercentual] = useState(25);
  const [parcelaReduzida, setParcelaReduzida] = useState(false);

  const [lanceProprioAtivo, setLanceProprioAtivo] = useState(false);
  const [lanceProprio, setLanceProprio] = useState('');

  const [opcaoPos, setOpcaoPos] = useState('prazo');
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const user = await base44.auth.me();
    setCurrentUser(user);
  };

  // Buscar etapas do funil
  const { data: etapas = [] } = useQuery({
    queryKey: ['etapas-funil'],
    queryFn: () => base44.entities.EtapaFunil.filter({ status: 'ativa' }, 'ordem')
  });

  // Regras do embutido por administradora
  useEffect(() => {
    if (!lanceEmbutidoAtivo) {
      setAdministradora('');
      return;
    }

    // Canopus: apenas 30% ou 50%
    if (administradora === 'canopus' && ![30, 50].includes(lanceEmbutidoPercentual)) {
      setLanceEmbutidoPercentual(30);
    }
  }, [lanceEmbutidoAtivo, administradora, lanceEmbutidoPercentual]);

  // Regra: Motocicleta NÃO tem carência (força modelo simples)
  useEffect(() => {
    if (tipoGrupo === 'motocicleta') {
      setOpcaoPos('parcela');
    }
  }, [tipoGrupo]);

  // Regra: Itaú também não tem carência (força modelo simples)
  useEffect(() => {
    if (administradora === 'itau') {
      setOpcaoPos('parcela');
    }
  }, [administradora]);

  const adicionarCarta = () => {
    setCartas([...cartas, { credito: '', parcela: '', prazo: '' }]);
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

  // Cálculos automáticos
  const creditoTotal = cartas.reduce((acc, carta) => {
    const credito = parseFloat(carta.credito) || 0;
    return acc + credito;
  }, 0);

  const parcelaTotal = cartas.reduce((acc, carta) => {
    const parcela = parseFloat(carta.parcela) || 0;
    return acc + parcela;
  }, 0);

  // Prazo original é o da primeira carta com prazo preenchido
  const prazoOriginal = cartas.find(c => c.prazo)?.prazo || '';

  const lanceEmbutidoValor = lanceEmbutidoAtivo 
    ? creditoTotal * (lanceEmbutidoPercentual / 100) 
    : 0;

  const lanceProprioValor = lanceProprioAtivo 
    ? (parseFloat(lanceProprio) || 0) 
    : 0;

  const lanceTotal = lanceEmbutidoValor + lanceProprioValor;

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

    if (lanceEmbutidoAtivo && !administradora) {
      toast.error('Selecione a administradora do lance embutido');
      return;
    }

    // 🧮 CÁLCULO
    const prazoNum = parseFloat(prazoOriginal);
    const totalPlano = prazoNum * parcelaTotal;

    const usarRegraCanopusEmbutido = lanceEmbutidoAtivo && administradora === 'canopus';
    const semCarenciaPorAdm = administradora === 'itau';

    let saldoBase;
    let saldoAposAto;
    let saldoFinal;

    // ✅ REGRA ESPECIAL: Motocicleta + Canopus + Embutido + Parcela cheia
    // O embutido QUITA meses (reduz prazo), não reduz saldo
    const regraMotoCanopusEmbutidoParcelaCheia =
      tipoGrupo === 'motocicleta' &&
      administradora === 'canopus' &&
      lanceEmbutidoAtivo &&
      parcelaReduzida === false;

    if (regraMotoCanopusEmbutidoParcelaCheia) {
      const mesesQuitadosEmbutido = Math.max(
        0,
        Math.floor((lanceEmbutidoValor || 0) / (parcelaTotal || 1))
      );

      const valorQuitadoEmbutido = mesesQuitadosEmbutido * parcelaTotal;

      saldoFinal = totalPlano - parcelaTotal - lanceProprioValor - valorQuitadoEmbutido;
      saldoBase = totalPlano - (lanceProprioValor + valorQuitadoEmbutido);
      saldoAposAto = saldoFinal;

      const novoPrazoForcado = Math.max(1, prazoNum - 1 - mesesQuitadosEmbutido);
      const novaParcelaForcada = saldoFinal / novoPrazoForcado;

      setResultado({
        creditoTotal,
        parcelaTotal,
        totalPlano,
        administradora,
        tipoGrupo,
        parcelaReduzida,
        lanceEmbutidoValor,
        lanceProprioValor,
        lanceTotal,
        lanceConsideradoNoSaldo: lanceProprioValor,
        saldoBase,
        saldoAposAto,
        saldoFinal,
        prazoOriginal: prazoNum,
        opcaoPos: 'parcela',
        novoPrazo: novoPrazoForcado,
        novaParcela: novaParcelaForcada
      });
      return;
    }

    // ✅ REGRA GERAL
    if (!parcelaReduzida && lanceEmbutidoAtivo) {
      saldoFinal = totalPlano - lanceEmbutidoValor - lanceProprioValor - parcelaTotal;
      saldoBase = totalPlano - (lanceEmbutidoValor + lanceProprioValor);
      saldoAposAto = saldoFinal;
    } else {
      const lanceConsideradoNoSaldo = usarRegraCanopusEmbutido ? lanceProprioValor : lanceTotal;
      saldoBase = totalPlano - lanceConsideradoNoSaldo;
      saldoAposAto = saldoBase - parcelaTotal;
      saldoFinal = saldoAposAto;
    }

    let novoPrazo = null;
    let novaParcela = null;

    const semCarencia = tipoGrupo === 'motocicleta' || semCarenciaPorAdm;
    
    if (!semCarencia && opcaoPos === 'prazo') {
      novoPrazo = prazoNum - 4;
      saldoFinal = saldoAposAto;
      novaParcela = saldoFinal / novoPrazo;
    } else {
      novoPrazo = prazoNum - 1;
      saldoFinal = saldoAposAto;
      novaParcela = saldoFinal / novoPrazo;
    }

    setResultado({
      creditoTotal,
      parcelaTotal,
      totalPlano,
      tipoGrupo,
      administradora: lanceEmbutidoAtivo ? administradora : null,
      lanceTotal,
      lanceConsideradoNoSaldo: usarRegraCanopusEmbutido ? lanceProprioValor : lanceTotal,
      parcelaReduzida,
      lanceEmbutidoValor,
      lanceProprioValor,
      saldoBase,
      saldoAposAto,
      saldoFinal,
      prazoOriginal: prazoNum,
      opcaoPos: semCarencia ? 'parcela' : opcaoPos,
      novoPrazo,
      novaParcela
    });
  };

  const gerarSimulacaoMutation = useMutation({
    mutationFn: async () => {
      if (!resultado) {
        throw new Error('Calcule a simulação primeiro');
      }

      const user = await base44.auth.me();

      // 1. Salvar simulação
      const simulacao = await base44.entities.Simulacao.create({
        cliente_nome: clienteNome,
        telefone: telefone,
        tipo_grupo: tipoGrupo,
        cartas: JSON.stringify(cartas),
        credito_total: creditoTotal,
        parcela_total: parcelaTotal,

        lance_embutido_ativo: lanceEmbutidoAtivo,
        administradora: lanceEmbutidoAtivo ? administradora : null,
        lance_embutido_percentual: lanceEmbutidoAtivo ? lanceEmbutidoPercentual : null,
        lance_embutido_valor: lanceEmbutidoValor,

        lance_proprio_ativo: lanceProprioAtivo,
        lance_proprio_valor: lanceProprioValor,

        lance_total: lanceTotal,
        lance_considerado_no_saldo: resultado.lanceConsideradoNoSaldo,

        opcao_pos_contemplacao: opcaoPos,
        prazo_original: resultado.prazoOriginal,
        novo_prazo: resultado.novoPrazo,
        nova_parcela: resultado.novaParcela,
        saldo_apos_contemplacao: resultado.saldoFinal,

        usuario_id: user.id,
        usuario_nome: user.full_name,
        status: 'ativa'
      });

      // 2. Marcar simulação como gerada
      await base44.entities.Simulacao.update(simulacao.id, {
        pdf_url: `#simulacao-impressao-${simulacao.id}`
      });

      // 3. Verificar se já existe oportunidade para este cliente (por nome ou telefone)
      const telefoneLimpo = telefone.replace(/\D/g, '');
      const oportunidadesExistentes = await base44.entities.Oportunidade.list();
      
      const oportunidadeDuplicada = oportunidadesExistentes.find(op => {
        const nomeMatch = op.cliente_nome?.toLowerCase() === clienteNome.toLowerCase();
        const telefoneMatch = op.telefone_lead?.replace(/\D/g, '') === telefoneLimpo;
        return (nomeMatch || telefoneMatch) && op.status === 'aberta';
      });

      let oportunidade;

      if (oportunidadeDuplicada) {
        // Cliente já tem oportunidade aberta - atualizar com nova simulação
        const observacoesAtuais = oportunidadeDuplicada.observacoes || '';
        const novaSimulacaoInfo =
          `\n\n🔄 Nova Simulação (${new Date().toLocaleDateString('pt-BR')}):` +
          `\nCrédito: ${formatCurrency(creditoTotal)}` +
          `\nParcela: ${formatCurrency(parcelaTotal)}` +
          `\nLance: ${formatCurrency(lanceTotal)}` +
          (lanceEmbutidoAtivo ? `\nAdministradora: ${administradora}` : '');
        
        await base44.entities.Oportunidade.update(oportunidadeDuplicada.id, {
          observacoes: observacoesAtuais + novaSimulacaoInfo,
          valor_estimado: creditoTotal, // Atualiza com valor mais recente
          data_ultima_movimentacao: new Date().toISOString()
        });

        oportunidade = { ...oportunidadeDuplicada, observacoes: observacoesAtuais + novaSimulacaoInfo };

        // Registrar movimentação de atualização
        await base44.entities.MovimentacaoFunil.create({
          oportunidade_id: oportunidadeDuplicada.id,
          etapa_origem_id: oportunidadeDuplicada.etapa_id,
          etapa_origem_nome: oportunidadeDuplicada.etapa_nome,
          etapa_destino_id: oportunidadeDuplicada.etapa_id,
          etapa_destino_nome: oportunidadeDuplicada.etapa_nome,
          usuario_id: user.id,
          usuario_nome: user.full_name,
          observacao: '🔄 Nova simulação adicionada ao histórico do cliente'
        });

        toast.info('Cliente já possui oportunidade aberta. Nova simulação adicionada ao histórico.');
      } else {
        // Criar nova oportunidade
        const etapaSimulacao = etapas.find(e => 
          e.nome.toLowerCase().includes('simulação') || 
          e.nome.toLowerCase().includes('simulacao')
        ) || etapas[0];

        oportunidade = await base44.entities.Oportunidade.create({
          titulo: `Simulação - ${clienteNome}`,
          cliente_nome: clienteNome,
          cliente_telefone: telefone,
          telefone_lead: telefone,
          valor_estimado: creditoTotal,
          etapa_id: etapaSimulacao?.id,
          etapa_nome: etapaSimulacao?.nome,
          vendedor_id: user.id,
          vendedor_nome: user.full_name,
          gerente_id: user.perfil === 'vendedor' ? user.gerente_id : user.id,
          origem: 'Simulador',
          observacoes:
            `Simulação gerada automaticamente.` +
            `\n\nCrédito: ${formatCurrency(creditoTotal)}` +
            `\nParcela: ${formatCurrency(parcelaTotal)}` +
            `\nLance: ${formatCurrency(lanceTotal)}` +
            (lanceEmbutidoAtivo ? `\nAdministradora: ${administradora}` : ''),
          status: 'aberta',
          data_ultima_movimentacao: new Date().toISOString()
        });

        // Registrar movimentação no funil (apenas para nova oportunidade)
        await base44.entities.MovimentacaoFunil.create({
          oportunidade_id: oportunidade.id,
          etapa_destino_id: etapaSimulacao?.id,
          etapa_destino_nome: etapaSimulacao?.nome,
          usuario_id: user.id,
          usuario_nome: user.full_name,
          observacao: 'Simulação gerada e enviada ao cliente'
        });
      }

      // Vincular oportunidade à simulação
      await base44.entities.Simulacao.update(simulacao.id, {
        oportunidade_id: oportunidade.id
      });

      // Auditoria
      await base44.entities.LogAuditoria.create({
        usuario_id: user.id,
        usuario_nome: user.full_name,
        acao: `Simulação gerada para ${clienteNome}`,
        entidade: 'Simulacao',
        entidade_id: simulacao.id,
        tipo: 'criacao'
      });

      return { simulacao, oportunidade };
    },
    onSuccess: ({ simulacao }) => {
      toast.success('Simulação gerada com sucesso!');
      
      // Navegar para página de impressão na mesma aba
      setTimeout(() => {
        window.location.href = `/ImprimirSimulacao?id=${simulacao.id}`;
      }, 300);
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao gerar simulação');
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

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="flex justify-center mb-4">
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6950a9860c8af0e2ff10fc9e/1b5f2d0a1_JDPromotoraICON3.png" 
            alt="JD Promotora" 
            className="h-12 w-auto object-contain"
          />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Simulador de Consórcio</h1>
        <p className="text-slate-500">Simule contemplação com multi-cotas e lances</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulário - 2 colunas */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dados do Cliente */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                📋 Dados do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cliente_nome">Nome do Cliente *</Label>
                  <Input
                    id="cliente_nome"
                    value={clienteNome}
                    onChange={(e) => setClienteNome(e.target.value)}
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <Label htmlFor="telefone">Telefone *</Label>
                  <Input
                    id="telefone"
                    value={telefone}
                    onChange={(e) => setTelefone(formatPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Tipo do Grupo *</Label>
                <Select value={tipoGrupo} onValueChange={setTipoGrupo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="automovel">Automóvel</SelectItem>
                    <SelectItem value="imovel">Imóvel</SelectItem>
                    <SelectItem value="motocicleta">Motocicleta</SelectItem>
                  </SelectContent>
                </Select>
                {tipoGrupo === 'motocicleta' && (
                  <p className="text-xs text-slate-600 mt-1">
                    ⚠️ Motocicleta: sem carência de 3 meses (simulação simples).
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

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
                <div key={index} className="relative p-4 bg-slate-50 rounded-lg border">
                  {cartas.length > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removerCarta(index)}
                      className="absolute top-2 right-2 h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Crédito (R$) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={carta.credito}
                        onChange={(e) => atualizarCarta(index, 'credito', e.target.value)}
                        placeholder="0,00"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Parcela (R$) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={carta.parcela}
                        onChange={(e) => atualizarCarta(index, 'parcela', e.target.value)}
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
                    <div className="mt-2 text-xs text-slate-600 pt-2 border-t">
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
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="grid grid-cols-2 gap-4">
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

          {/* Lances */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                🎯 Lances
              </CardTitle>
              <p className="text-sm text-slate-600 mt-2">
                O cliente deseja usar lance na simulação?
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Lance Embutido */}
              <div className="p-4 bg-slate-50 rounded-lg border">
                <div className="flex items-center justify-between mb-3">
                  <Label htmlFor="lance_embutido" className="font-semibold">Lance Embutido</Label>
                  <Switch
                    id="lance_embutido"
                    checked={lanceEmbutidoAtivo}
                    onCheckedChange={setLanceEmbutidoAtivo}
                  />
                </div>

                {lanceEmbutidoAtivo && (
                  <div className="space-y-3">
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

                      {administradora === 'canopus' && (
                        <p className="text-xs text-slate-600 mt-1">
                          Na Canopus, a parcela já vem com o lance embutido descontado.
                        </p>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs">Percentual (%)</Label>
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

                    <div className="pt-2 border-t">
                      <p className="text-xs text-slate-600">Valor do Lance Embutido:</p>
                      <p className="text-lg font-bold text-emerald-600">{formatCurrency(lanceEmbutidoValor)}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Lance Próprio */}
              <div className="p-4 bg-slate-50 rounded-lg border">
                <div className="flex items-center justify-between mb-3">
                  <Label htmlFor="lance_proprio" className="font-semibold">Lance Próprio</Label>
                  <Switch
                    id="lance_proprio"
                    checked={lanceProprioAtivo}
                    onCheckedChange={setLanceProprioAtivo}
                  />
                </div>

                {lanceProprioAtivo && (
                  <div>
                    <Label className="text-xs">Valor (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={lanceProprio}
                      onChange={(e) => setLanceProprio(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                )}
              </div>

              {/* Total Lance */}
              {lanceTotal > 0 && (
                <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                  <p className="text-xs text-emerald-700">🏆 Lance Total</p>
                  <p className="text-2xl font-bold text-emerald-900">{formatCurrency(lanceTotal)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pós-Contemplação */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                📊 Simulação Pós-Contemplação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="mb-3 block">Escolha o modelo de cálculo:</Label>
                <RadioGroup value={opcaoPos} onValueChange={setOpcaoPos}>
                  <div className={`flex items-center space-x-2 p-3 bg-slate-50 rounded-lg border ${tipoGrupo === 'motocicleta' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-100'}`}>
                    <RadioGroupItem value="prazo" id="opcao_prazo" disabled={tipoGrupo === 'motocicleta'} />
                    <Label htmlFor="opcao_prazo" className={`flex-1 ${tipoGrupo === 'motocicleta' ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                      <span className="font-semibold">Modelo Canopus (Recomendado)</span>
                      <p className="text-xs text-slate-600 mt-1">1 parcela no ato + 3 de carência = novo prazo e parcela</p>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 bg-slate-50 rounded-lg border cursor-pointer hover:bg-slate-100">
                    <RadioGroupItem value="parcela" id="opcao_parcela" />
                    <Label htmlFor="opcao_parcela" className="cursor-pointer flex-1">
                      <span className="font-semibold">Modelo Simples</span>
                      <p className="text-xs text-slate-600 mt-1">Apenas 1 parcela no ato, sem carência</p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <Button
                onClick={calcularSimulacao}
                className="w-full bg-[#23BE84] hover:bg-[#1da570] gap-2"
              >
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
                <div className="space-y-4">
                  {/* Antes da Contemplação */}
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-600 font-semibold mb-2">Dados do Plano</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Prazo:</span>
                        <span className="font-semibold">{resultado.prazoOriginal} meses</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Parcela:</span>
                        <span className="font-semibold">{formatCurrency(resultado.parcelaTotal)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1">
                        <span className="text-slate-600">Total do Plano:</span>
                        <span className="font-bold">{formatCurrency(resultado.totalPlano)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Lance */}
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <p className="text-xs text-emerald-700 font-semibold mb-2">🎯 Lance Ofertado</p>
                    <p className="text-2xl font-bold text-emerald-900">{formatCurrency(resultado.lanceTotal)}</p>
                    {resultado.administradora && (
                      <p className="text-xs text-emerald-800 mt-1">
                        Administradora: <span className="font-semibold capitalize">{resultado.administradora}</span>
                      </p>
                    )}
                  </div>

                  {/* Cálculos Intermediários */}
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 space-y-2">
                    <p className="text-xs text-blue-700 font-semibold">Cálculos</p>
                    <div className="space-y-1 text-xs">
                     <div className="flex justify-between">
                       <span className="text-blue-700">Saldo Base:</span>
                       <span className="font-semibold">{formatCurrency(resultado.saldoBase)}</span>
                     </div>

                     <div className="flex justify-between">
                       <span className="text-blue-700">(-) Lance considerado:</span>
                       <span className="font-semibold">
                         -{formatCurrency(resultado.lanceConsideradoNoSaldo ?? resultado.lanceTotal)}
                       </span>
                     </div>

                     <div className="flex justify-between">
                       <span className="text-blue-700">(-) 1ª parcela (ato):</span>
                       <span className="font-semibold">-{formatCurrency(resultado.parcelaTotal)}</span>
                     </div>

                     <div className="flex justify-between border-t pt-1">
                       <span className="text-blue-900 font-semibold">Saldo Devedor:</span>
                       <span className="font-bold">{formatCurrency(resultado.saldoFinal)}</span>
                     </div>

                     {resultado.opcaoPos === 'prazo' && (
                       <div className="text-xs text-blue-600 pt-1 border-t">
                         ⏱️ Carência de 3 meses reduz apenas o prazo (não altera saldo)
                       </div>
                     )}
                    </div>
                  </div>

                  {/* Depois da Contemplação */}
                  <div className="p-4 bg-purple-50 rounded-lg border-2 border-purple-300">
                    <p className="text-xs text-purple-700 font-semibold mb-3">✨ Resultado Final</p>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-purple-700 text-sm">Novo Prazo:</span>
                        <span className="font-bold text-purple-900 text-xl">{resultado.novoPrazo} meses</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-purple-700 text-sm">Nova Parcela:</span>
                        <span className="font-bold text-purple-900 text-xl">{formatCurrency(resultado.novaParcela)}</span>
                      </div>
                      {resultado.opcaoPos === 'prazo' && (
                        <div className="text-xs text-purple-600 pt-2 border-t border-purple-200">
                          ✓ 1 parcela paga no ato<br />
                          ✓ 3 parcelas de carência descontadas
                        </div>
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