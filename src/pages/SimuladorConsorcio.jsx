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
  const [cartas, setCartas] = useState([
    { credito: '', parcela: '', quantidade: 1 }
  ]);
  const [lanceEmbutidoAtivo, setLanceEmbutidoAtivo] = useState(false);
  const [lanceEmbutidoPercentual, setLanceEmbutidoPercentual] = useState(25);
  const [lanceProprioAtivo, setLanceProprioAtivo] = useState(false);
  const [lanceProprio, setLanceProprio] = useState('');
  const [prazoOriginal, setPrazoOriginal] = useState('');
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

  const adicionarCarta = () => {
    setCartas([...cartas, { credito: '', parcela: '', quantidade: 1 }]);
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
    const qtd = parseInt(carta.quantidade) || 1;
    return acc + (credito * qtd);
  }, 0);

  const parcelaTotal = cartas.reduce((acc, carta) => {
    const parcela = parseFloat(carta.parcela) || 0;
    const qtd = parseInt(carta.quantidade) || 1;
    return acc + (parcela * qtd);
  }, 0);

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

    const saldoAposLance = creditoTotal - lanceTotal;

    let novoPrazo = null;
    let novaParcela = null;

    if (opcaoPos === 'prazo') {
      // Reduzir prazo, manter parcela
      novoPrazo = Math.ceil(saldoAposLance / parcelaTotal);
    } else {
      // Reduzir parcela, manter prazo
      novaParcela = saldoAposLance / parseFloat(prazoOriginal);
    }

    setResultado({
      creditoTotal,
      parcelaTotal,
      lanceTotal,
      saldoAposLance,
      prazoOriginal: parseFloat(prazoOriginal),
      opcaoPos,
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
        cartas: JSON.stringify(cartas),
        credito_total: creditoTotal,
        parcela_total: parcelaTotal,
        lance_embutido_ativo: lanceEmbutidoAtivo,
        lance_embutido_percentual: lanceEmbutidoAtivo ? lanceEmbutidoPercentual : null,
        lance_embutido_valor: lanceEmbutidoValor,
        lance_proprio_ativo: lanceProprioAtivo,
        lance_proprio_valor: lanceProprioValor,
        lance_total: lanceTotal,
        opcao_pos_contemplacao: opcaoPos,
        prazo_original: resultado.prazoOriginal,
        novo_prazo: resultado.novoPrazo,
        nova_parcela: resultado.novaParcela,
        saldo_apos_contemplacao: resultado.saldoAposLance,
        usuario_id: user.id,
        usuario_nome: user.full_name,
        status: 'ativa'
      });

      // 2. Gerar PDF
      const pdfContent = gerarConteudoPDF(simulacao);
      
      // Upload do PDF (simulando - quando backend functions estiver ativo, usará HTML2PDF)
      // Por enquanto, apenas marca como gerado
      await base44.entities.Simulacao.update(simulacao.id, {
        pdf_url: `#simulacao-${simulacao.id}` // Placeholder
      });

      // 3. Criar oportunidade no funil
      const etapaSimulacao = etapas.find(e => 
        e.nome.toLowerCase().includes('simulação') || 
        e.nome.toLowerCase().includes('simulacao')
      ) || etapas[0];

      const oportunidade = await base44.entities.Oportunidade.create({
        titulo: `Simulação - ${clienteNome}`,
        cliente_nome: clienteNome,
        cliente_telefone: telefone,
        valor_estimado: creditoTotal,
        etapa_id: etapaSimulacao?.id,
        etapa_nome: etapaSimulacao?.nome,
        vendedor_id: user.id,
        vendedor_nome: user.full_name,
        gerente_id: user.perfil === 'vendedor' ? user.gerente_id : user.id,
        origem: 'Simulador',
        observacoes: `Simulação gerada automaticamente.\n\nCrédito: ${formatCurrency(creditoTotal)}\nParcela: ${formatCurrency(parcelaTotal)}\nLance: ${formatCurrency(lanceTotal)}`,
        status: 'aberta',
        data_ultima_movimentacao: new Date().toISOString()
      });

      // Vincular oportunidade à simulação
      await base44.entities.Simulacao.update(simulacao.id, {
        oportunidade_id: oportunidade.id
      });

      // Registrar movimentação no funil
      await base44.entities.MovimentacaoFunil.create({
        oportunidade_id: oportunidade.id,
        etapa_destino_id: etapaSimulacao?.id,
        etapa_destino_nome: etapaSimulacao?.nome,
        usuario_id: user.id,
        usuario_nome: user.full_name,
        observacao: 'Simulação gerada e enviada ao cliente'
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
    onSuccess: ({ oportunidade }) => {
      toast.success('Simulação gerada e enviada ao funil!');
      
      // Limpar formulário
      setClienteNome('');
      setTelefone('');
      setCartas([{ credito: '', parcela: '', quantidade: 1 }]);
      setLanceEmbutidoAtivo(false);
      setLanceProprioAtivo(false);
      setLanceProprio('');
      setPrazoOriginal('');
      setResultado(null);

      // Mostrar link para oportunidade
      const url = window.location.origin + `/oportunidade-detalhes?id=${oportunidade.id}`;
      window.open(url, '_blank');
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao gerar simulação');
    }
  });

  const gerarConteudoPDF = (simulacao) => {
    // Placeholder - quando backend functions estiver ativo, gerará PDF real
    return {
      titulo: 'Simulação de Consórcio',
      cliente: simulacao.cliente_nome,
      data: new Date().toLocaleDateString('pt-BR')
    };
  };

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
      <PageHeader
        title="Simulador de Consórcio"
        subtitle="Simule contemplação com multi-cotas e lances"
      />

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
                      <Label className="text-xs">Quantidade</Label>
                      <Input
                        type="number"
                        min="1"
                        value={carta.quantidade}
                        onChange={(e) => atualizarCarta(index, 'quantidade', e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>

                  {carta.credito && carta.parcela && (
                    <div className="mt-2 text-xs text-slate-600 pt-2 border-t">
                      Subtotal: <span className="font-semibold">
                        {formatCurrency(parseFloat(carta.credito) * parseInt(carta.quantidade))} 
                        {' • '}
                        {formatCurrency(parseFloat(carta.parcela) * parseInt(carta.quantidade))}/mês
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
                      <Label className="text-xs">Percentual (%)</Label>
                      <Select
                        value={lanceEmbutidoPercentual.toString()}
                        onValueChange={(value) => setLanceEmbutidoPercentual(parseFloat(value))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="25">25%</SelectItem>
                          <SelectItem value="30">30%</SelectItem>
                          <SelectItem value="35">35%</SelectItem>
                          <SelectItem value="40">40%</SelectItem>
                          <SelectItem value="45">45%</SelectItem>
                          <SelectItem value="50">50%</SelectItem>
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
                <Label htmlFor="prazo_original">Prazo Original (meses) *</Label>
                <Input
                  id="prazo_original"
                  type="number"
                  value={prazoOriginal}
                  onChange={(e) => setPrazoOriginal(e.target.value)}
                  placeholder="Ex: 120"
                />
              </div>

              <div>
                <Label className="mb-3 block">Escolha uma opção:</Label>
                <RadioGroup value={opcaoPos} onValueChange={setOpcaoPos}>
                  <div className="flex items-center space-x-2 p-3 bg-slate-50 rounded-lg border cursor-pointer hover:bg-slate-100">
                    <RadioGroupItem value="prazo" id="opcao_prazo" />
                    <Label htmlFor="opcao_prazo" className="cursor-pointer flex-1">
                      <span className="font-semibold">Reduzir Prazo</span>
                      <p className="text-xs text-slate-600 mt-1">Mantém a parcela e reduz o tempo</p>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 bg-slate-50 rounded-lg border cursor-pointer hover:bg-slate-100">
                    <RadioGroupItem value="parcela" id="opcao_parcela" />
                    <Label htmlFor="opcao_parcela" className="cursor-pointer flex-1">
                      <span className="font-semibold">Reduzir Parcela</span>
                      <p className="text-xs text-slate-600 mt-1">Mantém o prazo e reduz o valor mensal</p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <Button
                onClick={calcularSimulacao}
                className="w-full bg-blue-600 hover:bg-blue-700 gap-2"
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
                    <p className="text-xs text-slate-600 font-semibold mb-2">Antes da Contemplação</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Crédito:</span>
                        <span className="font-semibold">{formatCurrency(resultado.creditoTotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Parcela:</span>
                        <span className="font-semibold">{formatCurrency(resultado.parcelaTotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Prazo:</span>
                        <span className="font-semibold">{resultado.prazoOriginal} meses</span>
                      </div>
                    </div>
                  </div>

                  {/* Lance */}
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <p className="text-xs text-emerald-700 font-semibold mb-2">Lance Aplicado</p>
                    <p className="text-2xl font-bold text-emerald-900">{formatCurrency(resultado.lanceTotal)}</p>
                  </div>

                  {/* Saldo Após Lance */}
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-700 font-semibold mb-2">Saldo Após Lance</p>
                    <p className="text-2xl font-bold text-blue-900">{formatCurrency(resultado.saldoAposLance)}</p>
                  </div>

                  {/* Depois da Contemplação */}
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-xs text-purple-700 font-semibold mb-2">Depois da Contemplação</p>
                    <div className="space-y-1 text-sm">
                      {resultado.opcaoPos === 'prazo' ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-purple-700">Novo Prazo:</span>
                            <span className="font-bold text-purple-900 text-lg">{resultado.novoPrazo} meses</span>
                          </div>
                          <div className="flex justify-between text-xs text-purple-600">
                            <span>Parcela:</span>
                            <span>{formatCurrency(resultado.parcelaTotal)} (mantida)</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between">
                            <span className="text-purple-700">Nova Parcela:</span>
                            <span className="font-bold text-purple-900 text-lg">{formatCurrency(resultado.novaParcela)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-purple-600">
                            <span>Prazo:</span>
                            <span>{resultado.prazoOriginal} meses (mantido)</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Ação */}
                  <Button
                    onClick={() => gerarSimulacaoMutation.mutate()}
                    disabled={gerarSimulacaoMutation.isPending}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2"
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
                    Será gerado PDF e criada oportunidade no funil automaticamente
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