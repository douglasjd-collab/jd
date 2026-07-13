import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  CheckCircle, 
  XCircle, 
  FileSpreadsheet,
  Calendar,
  User,
  Building2
} from 'lucide-react';
import { format } from 'date-fns';

export default function ImportacaoDetalhes() {
  const urlParams = new URLSearchParams(window.location.search);
  const importacaoId = urlParams.get('id');
  const produtoParam = urlParams.get('produto') || 'consorcio';

  const { data: importacao, isLoading: loadingImportacao } = useQuery({
    queryKey: ['importacao', importacaoId],
    queryFn: async () => {
      const data = await base44.entities.Importacao.filter({ id: importacaoId });
      return data[0];
    },
    enabled: !!importacaoId
  });

  const { data: itens = [], isLoading: loadingItens } = useQuery({
    queryKey: ['importacao-itens', importacaoId],
    queryFn: () => base44.entities.ImportacaoItem.filter({ importacao_id: importacaoId }),
    enabled: !!importacaoId
  });

  // Buscar Vendas da mesma administradora para cruzar vendedor por grupo+cota
  const { data: vendas = [] } = useQuery({
    queryKey: ['importacao-vendas-vendedor', importacao?.empresa_id, importacao?.administradora_id],
    queryFn: () => base44.entities.Venda.filter({
      empresa_id: importacao.empresa_id,
      administradora_id: importacao.administradora_id,
    }, null, 3000),
    enabled: !!importacao?.empresa_id && !!importacao?.administradora_id && importacao?.produto === 'consorcio',
  });

  // Buscar Propostas de consórcio para pegar empresa parceira
  const { data: propostas = [] } = useQuery({
    queryKey: ['importacao-propostas-parceiro', importacao?.empresa_id, importacao?.administradora_id],
    queryFn: () => base44.entities.Proposta.filter({
      empresa_id: importacao.empresa_id,
      administradora_id: importacao.administradora_id,
      produto: 'consorcio',
    }, null, 3000),
    enabled: !!importacao?.empresa_id && !!importacao?.administradora_id && importacao?.produto === 'consorcio',
  });

  // Mapa grupo+cota e contrato → nome do vendedor ou parceiro
  const vendedorMap = useMemo(() => {
    const map = {};
    // Preenche com Vendas (vendedor interno) — chave grupo|cota e contrato
    vendas.forEach(v => {
      if (v.grupo && v.cota) {
        const key = `${v.grupo}|${v.cota}`;
        if (!map[key]) {
          map[key] = v.vendedor_nome || null;
        }
      }
      if (v.contrato) {
        const cKey = `C:${v.contrato}`;
        if (!map[cKey]) {
          map[cKey] = v.vendedor_nome || null;
        }
      }
    });
    // Preenche com Propostas (empresa parceira) — chave grupo|cota e contrato
    propostas.forEach(p => {
      if (p.grupo && p.cota) {
        const key = `${p.grupo}|${p.cota}`;
        if (!map[key] && p.empresa_parceira_nome) {
          map[key] = p.empresa_parceira_nome;
        }
      }
      if (p.contrato) {
        const cKey = `C:${p.contrato}`;
        if (!map[cKey] && p.empresa_parceira_nome) {
          map[cKey] = p.empresa_parceira_nome;
        }
      }
    });
    return map;
  }, [vendas, propostas]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  if (loadingImportacao || !importacao) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]"></div>
      </div>
    );
  }

  const produto = importacao?.produto || produtoParam;
  const itensProcessados = itens.filter(i => i.status === 'processado');
  const itensDivergencia = itens.filter(i => i.status === 'divergencia');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Detalhes da Importação"
        subtitle={`${importacao.arquivo_nome || 'Arquivo importado'}`}
        backTo="Importacao"
      />

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <Calendar className="w-8 h-8 text-slate-400" />
            <div>
              <p className="text-sm text-slate-500">Data</p>
              <p className="font-semibold">
                {new Intl.DateTimeFormat('pt-BR', {
                  timeZone: 'America/Sao_Paulo',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                }).format(new Date(importacao.created_date))}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <Building2 className="w-8 h-8 text-slate-400" />
            <div>
              <p className="text-sm text-slate-500">Administradora</p>
              <p className="font-semibold">{importacao.administradora_nome}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <User className="w-8 h-8 text-slate-400" />
            <div>
              <p className="text-sm text-slate-500">Usuário</p>
              <p className="font-semibold">{importacao.usuario_nome}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <FileSpreadsheet className="w-8 h-8 text-slate-400" />
            <div>
              <p className="text-sm text-slate-500">Valor Total</p>
              <p className="font-semibold">{formatCurrency(importacao.valor_total)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="p-6 text-center">
            <p className="text-4xl font-bold text-slate-900">{importacao.total_registros || 0}</p>
            <p className="text-slate-500 mt-1">Total de Registros</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-emerald-50">
          <CardContent className="p-6 text-center">
            <p className="text-4xl font-bold text-emerald-700">{importacao.registros_processados || 0}</p>
            <p className="text-emerald-600 mt-1">Processados</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-red-50">
          <CardContent className="p-6 text-center">
            <p className="text-4xl font-bold text-red-700">{importacao.registros_divergencia || 0}</p>
            <p className="text-red-600 mt-1">Divergências</p>
          </CardContent>
        </Card>
      </div>

      {/* Items Tabs */}
      <Card className="border-0 shadow-sm">
        <Tabs defaultValue="todos">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Registros</CardTitle>
              <TabsList>
                <TabsTrigger value="todos">Todos ({itens.length})</TabsTrigger>
                <TabsTrigger value="processados">Processados ({itensProcessados.length})</TabsTrigger>
                <TabsTrigger value="divergencias">Divergências ({itensDivergencia.length})</TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent>
            <TabsContent value="todos">
               <ItemsTable itens={itens} formatCurrency={formatCurrency} produto={produto} vendedorMap={vendedorMap} />
             </TabsContent>
             <TabsContent value="processados">
               <ItemsTable itens={itensProcessados} formatCurrency={formatCurrency} produto={produto} vendedorMap={vendedorMap} />
             </TabsContent>
             <TabsContent value="divergencias">
               <ItemsTable itens={itensDivergencia} formatCurrency={formatCurrency} produto={produto} showMotivo vendedorMap={vendedorMap} />
             </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}

function ItemsTable({ itens, formatCurrency, produto = 'consorcio', showMotivo = false, vendedorMap = {} }) {
  if (itens.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        Nenhum registro encontrado
      </div>
    );
  }

  // Colunas para empréstimo
  if (produto === 'emprestimos') {
    return (
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data Rec. Comissão</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Contrato</TableHead>
              <TableHead>Valor Base Comissão</TableHead>
              <TableHead>% Comissão</TableHead>
              <TableHead>Valor Lançamento</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead>Status</TableHead>
              {showMotivo && <TableHead>Motivo</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.data_recebimento ? (() => { try { return format(new Date(item.data_recebimento + 'T12:00:00'), 'dd/MM/yyyy'); } catch { return item.data_recebimento; } })() : '-'}</TableCell>
                <TableCell className="max-w-[160px] truncate">{item.nome_completo || '-'}</TableCell>
                <TableCell>{item.contrato || '-'}</TableCell>
                <TableCell>{item.valor_base_comissao ? formatCurrency(item.valor_base_comissao) : '-'}</TableCell>
                <TableCell>{item.percentual_comissao ? `${item.percentual_comissao}%` : '-'}</TableCell>
                <TableCell className="font-medium">{formatCurrency(item.valor_recebido)}</TableCell>
                <TableCell>{item.vendedor_nome || 'Sem vendedor'}</TableCell>
                <TableCell><StatusBadge status={item.status} /></TableCell>
                {showMotivo && (
                  <TableCell className="max-w-xs">
                    <span className="text-sm text-red-600">{item.motivo_divergencia}</span>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // Colunas para consórcio (padrão)
  return (
    <div className="overflow-x-auto max-h-96 overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Linha</TableHead>
            <TableHead>Contrato</TableHead>
            <TableHead>Grupo</TableHead>
            <TableHead>Cota</TableHead>
            <TableHead>Parcela</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Vendedor/Parceiro</TableHead>
            <TableHead>Status</TableHead>
            {showMotivo && <TableHead>Motivo</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.linha}</TableCell>
              <TableCell>{item.contrato || '-'}</TableCell>
              <TableCell>{item.grupo || '-'}</TableCell>
              <TableCell>{item.cota || '-'}</TableCell>
              <TableCell>{item.parcela}</TableCell>
              <TableCell>{formatCurrency(item.valor_recebido)}</TableCell>
              <TableCell>{vendedorMap[`${item.grupo}|${item.cota}`] || (item.contrato ? vendedorMap[`C:${item.contrato}`] : null) || '-'}</TableCell>
              <TableCell><StatusBadge status={item.status} /></TableCell>
              {showMotivo && (
                <TableCell className="max-w-xs">
                  <span className="text-sm text-red-600">{item.motivo_divergencia}</span>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}