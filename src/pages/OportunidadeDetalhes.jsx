import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/card';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, User, DollarSign, Calendar, TrendingUp, History, Calculator, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';

export default function OportunidadeDetalhes() {
  const urlParams = new URLSearchParams(window.location.search);
  const oportunidadeId = urlParams.get('id');
  const [simulacaoSelecionada, setSimulacaoSelecionada] = useState(null);

  const { data: oportunidade, isLoading } = useQuery({
    queryKey: ['oportunidade', oportunidadeId],
    queryFn: async () => {
      const oports = await base44.entities.Oportunidade.filter({ id: oportunidadeId });
      return oports[0];
    },
  });

  const { data: movimentacoes = [], isLoading: loadingMovimentacoes } = useQuery({
    queryKey: ['movimentacoes', oportunidadeId],
    queryFn: () => base44.entities.MovimentacaoFunil.filter({ oportunidade_id: oportunidadeId }),
  });

  const { data: simulacoes = [], isLoading: loadingSimulacoes } = useQuery({
    queryKey: ['simulacoes', oportunidadeId],
    queryFn: () => base44.entities.Simulacao.filter({ oportunidade_id: oportunidadeId }),
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!oportunidade) {
    return <div className="p-8">Oportunidade não encontrada</div>;
  }

  const columns = [
    {
      header: 'Data/Hora',
      cell: (row) => format(new Date(row.created_date), 'dd/MM/yyyy HH:mm')
    },
    {
      header: 'De',
      cell: (row) => row.etapa_origem_nome || 'Início'
    },
    {
      header: 'Para',
      cell: (row) => row.etapa_destino_nome
    },
    {
      header: 'Usuário',
      cell: (row) => row.usuario_nome
    },
    {
      header: 'Observação',
      cell: (row) => row.observacao || '-'
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={oportunidade.titulo}
        subtitle={`Status: ${oportunidade.etapa_nome}`}
        backTo="FunilVendas"
      />

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Cliente</p>
              <p className="font-medium text-slate-900">{oportunidade.cliente_nome || 'Não vinculado'}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Valor Estimado</p>
              <p className="font-medium text-emerald-600">{formatCurrency(oportunidade.valor_estimado)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <User className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Vendedor</p>
              <p className="font-medium text-slate-900">{oportunidade.vendedor_nome}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Calendar className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Previsão Fechamento</p>
              <p className="font-medium text-slate-900">
                {oportunidade.data_fechamento_prevista 
                  ? format(new Date(oportunidade.data_fechamento_prevista), 'dd/MM/yyyy')
                  : 'Não definida'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Informações Detalhadas */}
      <Card className="p-6 border-0 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Informações</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-500">Origem:</p>
            <p className="font-medium">{oportunidade.origem || '-'}</p>
          </div>
          <div>
            <p className="text-slate-500">Telefone:</p>
            <p className="font-medium">{oportunidade.cliente_telefone || '-'}</p>
          </div>
          <div>
            <p className="text-slate-500">Data Criação:</p>
            <p className="font-medium">{format(new Date(oportunidade.created_date), 'dd/MM/yyyy HH:mm')}</p>
          </div>
          <div>
            <p className="text-slate-500">Última Movimentação:</p>
            <p className="font-medium">
              {oportunidade.data_ultima_movimentacao 
                ? format(new Date(oportunidade.data_ultima_movimentacao), 'dd/MM/yyyy HH:mm')
                : '-'}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-slate-500">Observações:</p>
            <p className="font-medium whitespace-pre-wrap">{oportunidade.observacoes || '-'}</p>
          </div>
        </div>
      </Card>

      {/* Histórico de Simulações */}
      {simulacoes.length > 0 && (
        <Card className="p-6 border-0 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="w-5 h-5 text-slate-600" />
            <h3 className="text-lg font-semibold">Histórico de Simulações</h3>
          </div>
          <div className="space-y-4">
            {simulacoes
              .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
              .map((sim, index) => (
                <div key={sim.id} className="p-4 bg-slate-50 rounded-lg border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-700">
                        Simulação #{simulacoes.length - index}
                      </Badge>
                      <span className="text-sm text-slate-600">
                        {format(new Date(sim.created_date), 'dd/MM/yyyy HH:mm')}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">
                      Por: {sim.usuario_nome}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500 text-xs">💰 Crédito Total</p>
                      <p className="font-semibold text-slate-900">{formatCurrency(sim.credito_total)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">📅 Parcela Original</p>
                      <p className="font-semibold text-slate-900">{formatCurrency(sim.parcela_total)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">🎯 Lance Total</p>
                      <p className="font-semibold text-emerald-600">{formatCurrency(sim.lance_total)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">⏱️ Prazo Original</p>
                      <p className="font-semibold text-slate-900">{sim.prazo_original} meses</p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-slate-500">✨ Após Contemplação:</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 h-7 text-xs"
                        onClick={() => setSimulacaoSelecionada(sim)}
                      >
                        <Printer className="w-3 h-3" />
                        Imprimir 2ª Via
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500 text-xs">💵 Nova Parcela</p>
                        <p className="font-bold text-purple-600">{formatCurrency(sim.nova_parcela)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">📆 Novo Prazo</p>
                        <p className="font-bold text-purple-600">{sim.novo_prazo} meses</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">💳 Saldo Devedor</p>
                        <p className="font-semibold text-slate-900">{formatCurrency(sim.saldo_apos_contemplacao)}</p>
                      </div>
                    </div>
                  </div>

                  {(sim.lance_embutido_ativo || sim.lance_proprio_ativo) && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <p className="text-xs text-slate-500 mb-2">🏆 Detalhes do Lance:</p>
                      <div className="flex flex-wrap gap-3 text-xs">
                        {sim.lance_embutido_ativo && (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            Lance Embutido: {sim.lance_embutido_percentual}% = {formatCurrency(sim.lance_embutido_valor)}
                          </Badge>
                        )}
                        {sim.lance_proprio_ativo && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            Lance Próprio: {formatCurrency(sim.lance_proprio_valor)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Histórico de Movimentações */}
      <Card className="p-6 border-0 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-semibold">Histórico de Movimentações</h3>
        </div>
        <DataTable
          columns={columns}
          data={movimentacoes.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))}
          isLoading={loadingMovimentacoes}
          emptyMessage="Nenhuma movimentação registrada"
        />
      </Card>

      {/* Modal de Impressão */}
      <Dialog open={!!simulacaoSelecionada} onOpenChange={() => setSimulacaoSelecionada(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Simulação de Consórcio</DialogTitle>
              {simulacaoSelecionada && (
                <Button 
                  onClick={() => {
                    const conteudo = document.getElementById('print-area').innerHTML;
                    const janelaImpressao = window.open('', '', 'width=800,height=600');
                    janelaImpressao.document.write(`
                      <html>
                        <head>
                          <title>Simulação de Consórcio</title>
                          <style>
                            body { 
                              font-family: system-ui, -apple-system, sans-serif; 
                              margin: 20px;
                              color: #1e293b;
                            }
                            .space-y-4 > * + * { margin-top: 1rem; }
                            .space-y-2 > * + * { margin-top: 0.5rem; }
                            .space-y-1 > * + * { margin-top: 0.25rem; }
                            .grid { display: grid; }
                            .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                            .gap-4 { gap: 1rem; }
                            .gap-2 { gap: 0.5rem; }
                            .flex { display: flex; }
                            .justify-between { justify-content: space-between; }
                            .items-center { align-items: center; }
                            .text-center { text-align: center; }
                            .font-bold { font-weight: 700; }
                            .font-semibold { font-weight: 600; }
                            .text-2xl { font-size: 1.5rem; line-height: 2rem; }
                            .text-3xl { font-size: 1.875rem; line-height: 2.25rem; }
                            .text-xl { font-size: 1.25rem; line-height: 1.75rem; }
                            .text-lg { font-size: 1.125rem; line-height: 1.75rem; }
                            .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
                            .text-xs { font-size: 0.75rem; line-height: 1rem; }
                            .mb-1 { margin-bottom: 0.25rem; }
                            .mb-2 { margin-bottom: 0.5rem; }
                            .mb-3 { margin-bottom: 0.75rem; }
                            .mb-4 { margin-bottom: 1rem; }
                            .mt-1 { margin-top: 0.25rem; }
                            .mt-2 { margin-top: 0.5rem; }
                            .p-2 { padding: 0.5rem; }
                            .p-3 { padding: 0.75rem; }
                            .p-4 { padding: 1rem; }
                            .pb-2 { padding-bottom: 0.5rem; }
                            .pb-4 { padding-bottom: 1rem; }
                            .pt-2 { padding-top: 0.5rem; }
                            .pt-3 { padding-top: 0.75rem; }
                            .rounded { border-radius: 0.25rem; }
                            .rounded-lg { border-radius: 0.5rem; }
                            .border { border-width: 1px; }
                            .border-2 { border-width: 2px; }
                            .border-b { border-bottom-width: 1px; }
                            .border-b-2 { border-bottom-width: 2px; }
                            .border-t { border-top-width: 1px; }
                            .border-slate-800 { border-color: #1e293b; }
                            .border-slate-300 { border-color: #cbd5e1; }
                            .border-blue-200 { border-color: #bfdbfe; }
                            .border-emerald-200 { border-color: #a7f3d0; }
                            .border-purple-200 { border-color: #e9d5ff; }
                            .border-purple-300 { border-color: #d8b4fe; }
                            .bg-slate-50 { background-color: #f8fafc; }
                            .bg-blue-50 { background-color: #eff6ff; }
                            .bg-emerald-50 { background-color: #ecfdf5; }
                            .bg-gradient-to-r { background-image: linear-gradient(to right, var(--tw-gradient-stops)); }
                            .from-blue-500 { --tw-gradient-from: #3b82f6; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to, rgba(59, 130, 246, 0)); }
                            .to-blue-600 { --tw-gradient-to: #2563eb; }
                            .from-purple-100 { --tw-gradient-from: #f3e8ff; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to, rgba(243, 232, 255, 0)); }
                            .to-purple-50 { --tw-gradient-to: #faf5ff; }
                            .text-slate-900 { color: #0f172a; }
                            .text-slate-600 { color: #475569; }
                            .text-slate-500 { color: #64748b; }
                            .text-blue-900 { color: #1e3a8a; }
                            .text-emerald-900 { color: #064e3b; }
                            .text-purple-900 { color: #581c87; }
                            .text-purple-800 { color: #6b21a8; }
                            .text-purple-700 { color: #7e22ce; }
                            .text-white { color: #ffffff; }
                            .opacity-90 { opacity: 0.9; }
                            img { height: 40px; width: auto; object-fit: contain; }
                            @media print {
                              @page { margin: 1cm; }
                            }
                          </style>
                        </head>
                        <body onload="window.print(); window.close();">
                          ${conteudo}
                        </body>
                      </html>
                    `);
                    janelaImpressao.document.close();
                  }}
                  className="gap-2 bg-[#23BE84] hover:bg-[#1da570]"
                  size="sm"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir
                </Button>
              )}
            </div>
          </DialogHeader>
          {simulacaoSelecionada && <ConteudoSimulacao simulacao={simulacaoSelecionada} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConteudoSimulacao({ simulacao }) {
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  let cartas = [];
  try {
    cartas = JSON.parse(simulacao.cartas || '[]');
  } catch (e) {
    cartas = [];
  }

  return (
    <div id="print-area" className="space-y-4">
      {/* Cabeçalho */}
      <div className="text-center pb-4 border-b-2 border-slate-800">
          <div className="flex justify-center mb-2">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6950a9860c8af0e2ff10fc9e/1b5f2d0a1_JDPromotoraICON3.png" 
              alt="JD Promotora" 
              className="h-10 w-auto object-contain"
            />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Simulação de Consórcio</h2>
          <p className="text-sm text-slate-600">
            {new Date(simulacao.created_date).toLocaleDateString('pt-BR')} às {new Date(simulacao.created_date).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}
          </p>
        </div>

        {/* Dados do Cliente */}
        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-2 pb-2 border-b border-slate-300">
            📋 Dados do Cliente
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="font-semibold">Nome:</span> {simulacao.cliente_nome}</div>
            <div><span className="font-semibold">Telefone:</span> {simulacao.telefone}</div>
          </div>
        </div>

        {/* Cartas de Crédito */}
        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-2 pb-2 border-b border-slate-300">
            💳 Cartas de Crédito
          </h3>
          <div className="space-y-2 mb-3">
            {cartas.map((carta, i) => (
              <div key={i} className="text-sm bg-slate-50 p-2 rounded">
                <strong>Carta {i + 1}:</strong> {formatCurrency(parseFloat(carta.credito))} • Parcela {formatCurrency(parseFloat(carta.parcela))} • {carta.prazo} Meses
              </div>
            ))}
          </div>
          <div className="bg-blue-50 p-3 rounded">
            <div className="flex justify-between mb-1">
              <span className="font-semibold">💰 Crédito Total:</span>
              <span className="text-lg font-bold text-blue-900">{formatCurrency(simulacao.credito_total)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="font-semibold">📅 Parcela Total:</span>
              <span className="text-lg font-bold text-blue-900">{formatCurrency(simulacao.parcela_total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">⏱️ Prazo:</span>
              <span className="text-lg font-bold text-blue-900">{simulacao.prazo_original} Meses</span>
            </div>
          </div>
        </div>

        {/* Lances */}
        {simulacao.lance_total > 0 && (
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-2 pb-2 border-b border-slate-300">
              🎯 Lances
            </h3>
            <div className="space-y-2">
              {simulacao.lance_embutido_ativo && (
                <div className="flex justify-between text-sm">
                  <span>Lance Embutido ({simulacao.lance_embutido_percentual}%):</span>
                  <span className="font-semibold">{formatCurrency(simulacao.lance_embutido_valor)}</span>
                </div>
              )}
              {simulacao.lance_proprio_ativo && (
                <div className="flex justify-between text-sm">
                  <span>Lance Próprio:</span>
                  <span className="font-semibold">{formatCurrency(simulacao.lance_proprio_valor)}</span>
                </div>
              )}
              <div className="flex justify-between bg-emerald-50 p-2 rounded border-t border-emerald-200">
                <span className="font-bold">🏆 Lance Total:</span>
                <span className="text-lg font-bold text-emerald-900">{formatCurrency(simulacao.lance_total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Valor a Receber */}
        <div className="p-4 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg text-white">
          <h3 className="text-sm font-bold mb-1">💰 Valor que o Cliente Recebe</h3>
          <p className="text-3xl font-bold">
            {formatCurrency(simulacao.credito_total - (simulacao.lance_embutido_valor || 0))}
          </p>
          <p className="text-xs opacity-90 mt-1">
            (Crédito {formatCurrency(simulacao.credito_total)}
            {simulacao.lance_embutido_valor > 0 && ` - Lance Emb. ${formatCurrency(simulacao.lance_embutido_valor)}`})
          </p>
        </div>

        {/* Cálculos */}
        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-2 pb-2 border-b border-slate-300">
            🧮 Cálculos
          </h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Total do Plano:</span>
              <span className="font-semibold">{formatCurrency(simulacao.prazo_original * simulacao.parcela_total)}</span>
            </div>
            <div className="flex justify-between">
              <span>(-) Lance:</span>
              <span className="font-semibold">{formatCurrency(simulacao.lance_total)}</span>
            </div>
            <div className="flex justify-between">
              <span>(-) 1ª Parcela (no ato):</span>
              <span className="font-semibold">{formatCurrency(simulacao.parcela_total)}</span>
            </div>
            <div className="flex justify-between bg-blue-50 p-2 rounded border-t border-blue-200">
              <span className="font-bold">Saldo Devedor:</span>
              <span className="text-lg font-bold text-blue-900">{formatCurrency(simulacao.saldo_apos_contemplacao)}</span>
            </div>
            {simulacao.opcao_pos_contemplacao === 'prazo' && (
              <p className="text-xs text-slate-600 italic mt-2">⏱️ Carência 3 meses reduz prazo</p>
            )}
          </div>
        </div>

        {/* Resultado Final */}
        <div className="bg-gradient-to-r from-purple-100 to-purple-50 border-2 border-purple-300 rounded-lg p-4">
          <h3 className="text-lg font-bold text-purple-900 mb-3 text-center">
            ✨ Resultado Final
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-purple-800">Novo Prazo:</span>
              <span className="text-xl font-bold text-purple-900">{simulacao.novo_prazo} meses</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-purple-800">Nova Parcela:</span>
              <span className="text-xl font-bold text-purple-900">{formatCurrency(simulacao.nova_parcela)}</span>
            </div>
            {simulacao.opcao_pos_contemplacao === 'prazo' && (
              <div className="pt-2 border-t border-purple-200 text-sm text-purple-700">
                ✓ 3 meses de carência após contemplação
              </div>
            )}
          </div>
        </div>

        {/* Rodapé */}
        <div className="pt-3 border-t border-slate-300 text-center text-xs text-slate-500">
          <p>Vendedor: {simulacao.usuario_nome}</p>
          <p className="mt-1">Simulação sujeita a alterações conforme condições da administradora.</p>
        </div>
      </div>
    </>
  );
}