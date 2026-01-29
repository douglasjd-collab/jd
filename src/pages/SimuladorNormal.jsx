import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.jsx';
import { Switch } from '@/components/ui/switch';
import { Calculator, Plus, Download, Loader2, TrendingUp, X, Copy, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';
import SelecionarPlanoCanopusModal from '@/components/simulador/SelecionarPlanoCanopusModal';

export default function SimuladorNormal() {
  const [currentUser, setCurrentUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [clienteNome, setClienteNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [tipoGrupo, setTipoGrupo] = useState('automovel');
  const [cartas, setCartas] = useState([{ credito: '', parcela: '', prazo: '', parcelaReduzida: '' }]);
  const [aplicarRegraCanopus, setAplicarRegraCanopus] = useState(false);
  const [parcelasCarencia, setParcelasCarencia] = useState(3);
  const [parcelaAtoContratacao, setParcelaAtoContratacao] = useState(1);
  const [usarLanceProprio, setUsarLanceProprio] = useState(false);
  const [lanceProprio, setLanceProprio] = useState('');
  const [resultado, setResultado] = useState(null);
  const [planoModalOpen, setPlanoModalOpen] = useState(false);
  const [cartaIndex, setCartaIndex] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const user = await base44.auth.me();
    setCurrentUser(user);
    
    // Buscar empresa_id do colaborador
    if (user) {
      const colabs = await base44.entities.Colaborador.filter(
        { user_id: user.id, status: 'ativo' },
        '-created_date',
        1
      );
      if (colabs?.length) {
        setEmpresaId(colabs[0].empresa_id);
      }
    }
  };

  const { data: etapas = [] } = useQuery({
    queryKey: ['etapas-funil'],
    queryFn: () => base44.entities.EtapaFunil.filter({ status: 'ativa' }, 'ordem')
  });

  const adicionarCarta = () => {
    setCartas([...cartas, { credito: '', parcela: '', prazo: '', parcelaReduzida: '' }]);
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
  const parcelaReduzidaTotal = cartas.reduce((acc, carta) => acc + (parseFloat(carta.parcelaReduzida) || 0), 0);
  const prazoOriginal = cartas.find(c => c.prazo)?.prazo || '';
  
  // Define qual parcela usar no ato: reduzida (se houver) ou normal
  const primeiraParcelaNoAto = parcelaReduzidaTotal > 0 ? parcelaReduzidaTotal : parcelaTotal;
  
  // Calcular percentual do lance próprio em cima do crédito
  const lanceProprioPercentual = lanceProprio && creditoTotal > 0 
    ? ((parseFloat(lanceProprio) / creditoTotal) * 100).toFixed(2) 
    : '0';

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

    const prazoNum = parseFloat(prazoOriginal);
    const totalPlano = prazoNum * parcelaTotal;
    
    let lanceProprioValor = 0;
    let saldoDevedorTotal = totalPlano;
    
    // Aplicar lance próprio se ativo
    if (usarLanceProprio && lanceProprio) {
      lanceProprioValor = parseFloat(lanceProprio);
      if (lanceProprioValor > totalPlano) {
        lanceProprioValor = totalPlano;
        toast.warning('Lance próprio ajustado para o valor máximo do plano');
      }
      saldoDevedorTotal = totalPlano - lanceProprioValor;
    }
    
    let mesesCobrados = prazoNum;
    let novoPrazo = prazoNum - 1;
    
    let novaParcelaCalculada = (saldoDevedorTotal - primeiraParcelaNoAto) / novoPrazo;

    // Aplicar regra Canopus se ativado
    if (aplicarRegraCanopus && (tipoGrupo === 'automovel' || tipoGrupo === 'imovel')) {
      const mesesNaoCobrados = parcelasCarencia + parcelaAtoContratacao;
      mesesCobrados = prazoNum - mesesNaoCobrados;
      if (mesesCobrados < 1) mesesCobrados = 1;
      
      novoPrazo = mesesCobrados;
      novaParcelaCalculada = (saldoDevedorTotal - primeiraParcelaNoAto) / mesesCobrados;
    }

    setResultado({
      creditoTotal,
      parcelaTotal,
      totalPlano,
      prazoOriginal: prazoNum,
      novoPrazo,
      novaParcela: novaParcelaCalculada,
      mesesCobrados,
      aplicarRegraCanopus: aplicarRegraCanopus && (tipoGrupo === 'automovel' || tipoGrupo === 'imovel'),
      usarLanceProprio,
      lanceProprio: lanceProprioValor,
      saldoDevedor: saldoDevedorTotal,
      parcelaReduzida: parcelaReduzidaTotal > 0,
      valorParcelaReduzida: primeiraParcelaNoAto
    });
  };

  const gerarSimulacaoMutation = useMutation({
    mutationFn: async () => {
      if (!resultado) throw new Error('Calcule a simulação primeiro');
      if (!currentUser) throw new Error('Usuário não autenticado');

      const colabs = await base44.entities.Colaborador.filter(
        { user_id: currentUser.id, status: 'ativo' },
        '-created_date'
      );
      
      const colab = colabs?.[0];
      if (!colab || !colab.empresa_id) throw new Error('Usuário não vinculado a empresa');

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
        empresa_id: colab.empresa_id,
        cliente_nome: clienteNome,
        telefone: telefone,
        tipo_grupo: tipoGrupo,
        cartas: JSON.stringify(cartas),
        credito_total: creditoTotal,
        parcela_total: parcelaTotal,
        prazo_original: resultado.prazoOriginal,
        novo_prazo: resultado.novoPrazo,
        nova_parcela: resultado.novaParcela,
        parcela_reduzida: primeira_parcela_reduzida_total > 0,
        primeira_parcela_reduzida_total: primeira_parcela_reduzida_total,
        primeira_parcela_no_ato: primeira_parcela_no_ato,
        saldo_apos_contemplacao: resultado.saldoDevedor - primeira_parcela_no_ato,
        lance_proprio_ativo: resultado.usarLanceProprio || false,
        lance_proprio_valor: resultado.usarLanceProprio ? resultado.lanceProprio : 0,
        lance_total: resultado.usarLanceProprio ? resultado.lanceProprio : 0,
        usuario_id: currentUser.id,
        usuario_nome: colab.nome || currentUser.full_name,
        status: 'ativa'
      });

      await base44.entities.Simulacao.update(simulacao.id, {
        pdf_url: `#simulacao-impressao-${simulacao.id}`
      });

      const etapaSimulacao = etapas.find(e => 
        e.nome.toLowerCase().includes('simulação') || 
        e.nome.toLowerCase().includes('simulacao')
      ) || etapas[0];

      const oportunidade = await base44.entities.Oportunidade.create({
        empresa_id: colab.empresa_id,
        titulo: clienteNome,
        cliente_nome: clienteNome,
        telefone_lead: telefone,
        valor_estimado: creditoTotal,
        etapa_id: etapaSimulacao.id,
        etapa_nome: etapaSimulacao.nome,
        vendedor_id: currentUser.id,
        vendedor_nome: colab.nome || currentUser.full_name,
        origem: 'Simulador com Recursos Próprios',
        status: 'aberta',
        data_ultima_movimentacao: new Date().toISOString()
      });

      await base44.entities.Simulacao.update(simulacao.id, {
        oportunidade_id: oportunidade.id
      });

      return { simulacao };
    },
    onSuccess: ({ simulacao }) => {
      toast.success('Simulação gerada com sucesso!');
      setTimeout(() => {
        window.location.href = createPageUrl('ImprimirSimulacao') + `?id=${simulacao.id}`;
      }, 300);
    }
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  };

  const formatPhone = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 10) {
      return numbers.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  };

  const handleMoedaInput = (value) => {
    const numeros = value.replace(/\D/g, '');
    return parseFloat(numeros) / 100;
  };

  const formatarParaExibicao = (valor) => {
    if (!valor) return '';
    const num = parseFloat(valor);
    if (isNaN(num)) return '';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleAbrirPlanoModal = (index) => {
    setCartaIndex(index);
    setPlanoModalOpen(true);
  };

  const handleSelecionarPlano = (plano) => {
    if (cartaIndex !== null) {
      const novasCartas = [...cartas];
      novasCartas[cartaIndex] = {
        ...novasCartas[cartaIndex],
        credito: plano.credito.toString(),
        parcela: plano.parcela.toString(),
        prazo: plano.prazo.toString()
      };
      setCartas(novasCartas);
      toast.success(`Plano selecionado: ${plano.nome_bem}`);
    }
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
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Simulação com Recursos Próprios</h1>
        <p className="text-slate-500">Simulação simplificada sem lance embutido</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">📋 Dados do Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">💳 Cartas de Crédito</CardTitle>
                <div className="flex gap-2">
                  <Button onClick={() => handleAbrirPlanoModal(cartas.length - 1)} size="sm" variant="outline" className="gap-2">
                    <ShoppingBag className="w-4 h-4" />
                    Selecionar Plano
                  </Button>
                  <Button onClick={adicionarCarta} size="sm" variant="outline" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Adicionar Carta
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {cartas.map((carta, index) => (
                <div key={index} className="relative p-4 bg-slate-50 rounded-lg border">
                  <div className="absolute top-2 right-2 flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => handleAbrirPlanoModal(index)} className="h-6 w-6 text-blue-600 hover:bg-blue-50" title="Selecionar Plano">
                      <ShoppingBag className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => duplicarCarta(index)} className="h-6 w-6 text-blue-600 hover:bg-blue-50">
                      <Copy className="w-4 h-4" />
                    </Button>
                    {cartas.length > 1 && (
                      <Button size="icon" variant="ghost" onClick={() => removerCarta(index)} className="h-6 w-6 text-red-600 hover:bg-red-50">
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs">Crédito (R$) *</Label>
                      <Input
                        type="text"
                        value={carta.credito ? formatarParaExibicao(carta.credito) : ''}
                        onChange={(e) => {
                          const val = handleMoedaInput(e.target.value);
                          atualizarCarta(index, 'credito', val > 0 ? val.toString() : '');
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
                          const val = handleMoedaInput(e.target.value);
                          atualizarCarta(index, 'parcela', val > 0 ? val.toString() : '');
                        }}
                        placeholder="0,00"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Prazo (meses) *</Label>
                      <Input type="number" value={carta.prazo} onChange={(e) => atualizarCarta(index, 'prazo', e.target.value)} placeholder="120" className="h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">1ª Parcela Reduzida</Label>
                      <Input
                        type="text"
                        value={carta.parcelaReduzida ? formatarParaExibicao(carta.parcelaReduzida) : ''}
                        onChange={(e) => {
                          const val = handleMoedaInput(e.target.value);
                          atualizarCarta(index, 'parcelaReduzida', val > 0 ? val.toString() : '');
                        }}
                        placeholder="0,00"
                        className="h-9"
                      />
                    </div>
                  </div>
                  {carta.credito && carta.parcela && carta.prazo && (
                    <div className="mt-2 text-xs text-slate-600 pt-2 border-t">
                      <span className="font-semibold">
                        {formatCurrency(parseFloat(carta.credito))} • {formatCurrency(parseFloat(carta.parcela))}/mês • {carta.prazo} meses
                        {carta.parcelaReduzida && ` • 1ª Parc. Reduzida: ${formatCurrency(parseFloat(carta.parcelaReduzida))}`}
                      </span>
                    </div>
                  )}
                </div>
              ))}
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-blue-700">💰 Crédito Total</p>
                    <p className="text-xl font-bold text-blue-900">{formatCurrency(creditoTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-700">📅 Parcela Total/mês</p>
                    <p className="text-xl font-bold text-blue-900">{formatCurrency(parcelaTotal)}</p>
                  </div>
                  {parcelaReduzidaTotal > 0 && (
                    <div>
                      <p className="text-xs text-orange-700">📉 1ª Parc. Reduzida</p>
                      <p className="text-xl font-bold text-orange-900">{formatCurrency(parcelaReduzidaTotal)}</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">💰 Lance Próprio (Opcional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <Label className="text-sm font-medium">Deseja ofertar Recurso Próprio?</Label>
                  <p className="text-xs text-slate-500 mt-1">Oferece um valor adicional para reduzir as parcelas</p>
                </div>
                <Switch checked={usarLanceProprio} onCheckedChange={setUsarLanceProprio} />
              </div>

              {usarLanceProprio && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
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
                    </div>
                    <div>
                      <Label className="text-xs">Percentual (%)</Label>
                      <Input
                        type="text"
                        value={lanceProprioPercentual + '%'}
                        disabled
                        className="bg-slate-100 text-slate-700 font-semibold"
                      />
                    </div>
                  </div>
                  {lanceProprio && parseFloat(lanceProprio) > 0 && (
                    <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <p className="text-xs text-purple-700">💎 Lance Próprio</p>
                      <p className="text-xl font-bold text-purple-900">{formatCurrency(parseFloat(lanceProprio))}</p>
                      <p className="text-xs text-purple-700 mt-1">
                        {lanceProprioPercentual}% do total do plano
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">⚙️ Opções de Pagamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(tipoGrupo === 'automovel' || tipoGrupo === 'imovel') && (
                <>
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div>
                      <Label className="text-sm font-medium">Aplicar regra Canopus?</Label>
                      <p className="text-xs text-blue-600 mt-1">Carência de 3 parcelas + 1 parcela no ato</p>
                    </div>
                    <Switch checked={aplicarRegraCanopus} onCheckedChange={setAplicarRegraCanopus} />
                  </div>

                  {aplicarRegraCanopus && (
                    <div className="grid grid-cols-2 gap-3">
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

              {tipoGrupo !== 'automovel' && tipoGrupo !== 'imovel' && (
                <p className="text-xs text-slate-500 text-center py-2">
                  Regra Canopus disponível apenas para Automóvel e Imóvel
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">📊 Calcular</CardTitle>
            </CardHeader>
            <CardContent>
              <Button onClick={calcularSimulacao} className="w-full bg-blue-600 hover:bg-blue-700 gap-2">
                <Calculator className="w-4 h-4" />
                Calcular Simulação
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="border-0 shadow-sm sticky top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Resultado
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!resultado ? (
                <div className="text-center py-12 text-slate-500">
                  <Calculator className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="text-sm">Calcule a simulação</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Informações do Cliente */}
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-600 font-semibold mb-2">👤 Cliente</p>
                    <p className="text-sm font-medium text-slate-900">{clienteNome}</p>
                    <p className="text-xs text-slate-600">{telefone}</p>
                    <p className="text-xs text-slate-600 capitalize mt-1">
                      {tipoGrupo === 'automovel' ? 'Automóvel' : tipoGrupo === 'imovel' ? 'Imóvel' : tipoGrupo === 'motocicleta' ? 'Motocicleta' : tipoGrupo}
                    </p>
                  </div>

                  {/* Informações do Plano */}
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-700 font-semibold mb-2">📋 Plano</p>
                    <p className="text-sm font-medium text-blue-900">
                      Crédito Total {formatCurrency(creditoTotal)}
                    </p>
                    <p className="text-xs text-blue-800 mt-1">
                      {prazoOriginal} Meses de {formatCurrency(parcelaTotal)}
                    </p>
                  </div>

                  <div className="p-4 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg text-white">
                    <p className="text-xs font-semibold mb-1">💰 Valor a Receber</p>
                    <p className="text-3xl font-bold">{formatCurrency(resultado.creditoTotal)}</p>
                  </div>

                  {resultado.usarLanceProprio && (
                    <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                      <p className="text-xs text-purple-700 font-semibold mb-2">💎 Lance Próprio</p>
                      <p className="text-2xl font-bold text-purple-900">{formatCurrency(resultado.lanceProprio)}</p>
                      <p className="text-xs text-purple-700 mt-1">
                        {lanceProprioPercentual}% do total do plano
                      </p>
                    </div>
                  )}

                  {(resultado.aplicarRegraCanopus || resultado.usarLanceProprio) && (
                   <div className="p-3 bg-slate-50 rounded-lg space-y-2 text-sm">
                     <div className="flex justify-between">
                       <span className="text-slate-600">Total do Plano:</span>
                       <span className="font-semibold">{formatCurrency(resultado.totalPlano)}</span>
                     </div>
                     {resultado.usarLanceProprio && (
                       <div className="flex justify-between">
                         <span className="text-slate-600">Saldo Devedor após Lance:</span>
                         <span className="font-semibold">{formatCurrency(resultado.saldoDevedor)}</span>
                       </div>
                     )}
                     {resultado.parcelaReduzida && (
                       <div className="flex justify-between">
                         <span className="text-slate-600">1ª Parcela Reduzida:</span>
                         <span className="font-semibold">{formatCurrency(resultado.valorParcelaReduzida)}</span>
                       </div>
                     )}
                     {resultado.aplicarRegraCanopus && (
                       <div className="flex justify-between">
                         <span className="text-slate-600">Meses Cobrados:</span>
                         <span className="font-semibold">
                           {resultado.mesesCobrados} (prazo - 1 no ato - 3 carência)
                         </span>
                       </div>
                     )}
                   </div>
                  )}

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
                    </div>
                  </div>
                  <Button
                    onClick={() => gerarSimulacaoMutation.mutate()}
                    disabled={gerarSimulacaoMutation.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700 gap-2"
                  >
                    {gerarSimulacaoMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Gerando...</>
                    ) : (
                      <><Download className="w-4 h-4" />Gerar e Enviar ao Funil</>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal Seleção de Plano */}
      <SelecionarPlanoCanopusModal
        open={planoModalOpen}
        onOpenChange={setPlanoModalOpen}
        onSelectPlano={handleSelecionarPlano}
        empresaId={empresaId}
      />
    </div>
  );
}