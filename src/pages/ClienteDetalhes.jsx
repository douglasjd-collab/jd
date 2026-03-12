import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import DataTable from '@/components/ui/DataTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar,
  ShoppingCart
} from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function ClienteDetalhes() {
  const urlParams = new URLSearchParams(window.location.search);
  const clienteId = urlParams.get('id');

  const { data: cliente, isLoading: loadingCliente } = useQuery({
    queryKey: ['cliente', clienteId],
    queryFn: async () => {
      const clientes = await base44.entities.Cliente.filter({ id: clienteId });
      return clientes[0];
    },
    enabled: !!clienteId
  });

  const { data: vendas = [], isLoading: loadingVendas } = useQuery({
    queryKey: ['vendas-cliente', clienteId],
    queryFn: () => base44.entities.Venda.filter({ cliente_id: clienteId }),
    enabled: !!clienteId
  });

  const { data: propostas = [], isLoading: loadingPropostas } = useQuery({
    queryKey: ['propostas-cliente', clienteId, cliente?.cpf, cliente?.pj_cnpj],
    queryFn: async () => {
      const cpf = cliente?.cpf || cliente?.pj_cnpj;
      if (!cpf) return [];
      // Buscar por cliente_id vinculado OU por CPF (propostas importadas)
      const [porId, porCpf] = await Promise.all([
        base44.entities.Proposta.filter({ cliente_id: clienteId }),
        base44.entities.Proposta.filter({ cliente_cpf: cpf })
      ]);
      // Unir e deduplicar por id
      const todos = [...porId, ...porCpf];
      const vistos = new Set();
      return todos.filter(p => { if (vistos.has(p.id)) return false; vistos.add(p.id); return true; });
    },
    enabled: !!clienteId && !!cliente
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const produtoBadge = (produto) => {
    const map = { consorcio: 'Consórcio', emprestimo: 'Empréstimo', financiamento: 'Financiamento' };
    const colors = { consorcio: 'bg-blue-100 text-blue-800', emprestimo: 'bg-purple-100 text-purple-800', financiamento: 'bg-orange-100 text-orange-800' };
    return <Badge className={colors[produto] || 'bg-slate-100 text-slate-800'}>{map[produto] || produto}</Badge>;
  };

  if (loadingCliente || !cliente) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]"></div>
      </div>
    );
  }

  const totalVendas = vendas.length + propostas.length;
  const valorTotal = vendas.reduce((acc, v) => acc + (v.valorCredito || v.valor_carta || 0), 0)
    + propostas.reduce((acc, p) => acc + (p.valor_credito || 0), 0);

  const vendasColumns = [
    {
      header: 'Tipo',
      cell: (row) => produtoBadge(row._tipo)
    },
    {
      header: 'Produto / Contrato',
      cell: (row) => (
        <div>
          <p className="font-medium">{row._descricao}</p>
          <p className="text-xs text-slate-500">{row._contrato}</p>
        </div>
      )
    },
    {
      header: 'Banco/Adm',
      cell: (row) => row.administradora_nome || row._banco || '-'
    },
    {
      header: 'Vendedor',
      cell: (row) => <span className="text-xs">{row.vendedor_nome || '-'}</span>
    },
    {
      header: 'Valor',
      cell: (row) => formatCurrency(row._valor)
    },
    {
      header: 'Data',
      cell: (row) => row.data_venda ? format(new Date(row.data_venda), 'dd/MM/yyyy') : '-'
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />
    }
  ];

  // Unificar vendas e propostas em uma lista normalizada
  const todasVendas = [
    ...vendas.map(v => ({
      ...v,
      _tipo: v.tipo ? 'consorcio' : 'consorcio',
      _descricao: `${v.grupo || ''}/${v.cota || ''}`,
      _contrato: v.contrato || '',
      _valor: v.valorCredito || v.valor_carta || 0,
      _banco: v.administradora_nome,
    })),
    ...propostas.map(p => ({
      ...p,
      _tipo: p.produto || 'emprestimo',
      _descricao: p.emprestimo_tipo || p.produto || 'Empréstimo',
      _contrato: p.contrato || p.emprestimo_numero_ade || '',
      _valor: p.valor_credito || 0,
      _banco: p.administradora_nome,
    }))
  ].sort((a, b) => new Date(b.data_venda || 0) - new Date(a.data_venda || 0));

  // Determinar nome e identificação baseado no tipo de pessoa
  const nomeExibicao = cliente.tipo_pessoa === 'Jurídica' 
    ? (cliente.pj_razao_social || cliente.pj_nome_fantasia)
    : cliente.nome_completo;
  
  const identificacao = cliente.tipo_pessoa === 'Jurídica' 
    ? cliente.pj_cnpj 
    : cliente.cpf;

  const telefone = cliente.tipo_pessoa === 'Jurídica'
    ? (cliente.pj_celular || cliente.pj_telefone_fixo)
    : (cliente.celular || cliente.telefone_fixo);

  const email = cliente.tipo_pessoa === 'Jurídica'
    ? cliente.pj_email
    : cliente.email;

  const endereco = cliente.tipo_pessoa === 'Jurídica'
    ? [cliente.pj_endereco, cliente.pj_numero, cliente.pj_bairro, cliente.pj_cidade, cliente.pj_uf]
        .filter(Boolean).join(', ')
    : [cliente.res_endereco, cliente.res_numero, cliente.res_bairro, cliente.res_cidade, cliente.res_uf]
        .filter(Boolean).join(', ');

  return (
    <div className="space-y-6">
      <PageHeader
        title={nomeExibicao}
        subtitle={identificacao}
        backTo="Clientes"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info do Cliente */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <User className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Nome</p>
                <p className="font-medium">{nomeExibicao || '-'}</p>
              </div>
            </div>

            {cliente.senha_gov && (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <User className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-500">Senha GOV</p>
                  <p className="font-medium">{cliente.senha_gov}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <Phone className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Telefone</p>
                <p className="font-medium">{telefone || '-'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <Mail className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Email</p>
                <p className="font-medium">{email || '-'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <MapPin className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Endereço</p>
                <p className="font-medium">{endereco || '-'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <Calendar className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Data de Nascimento</p>
                <p className="font-medium">
                  {cliente.data_nascimento ? format(new Date(cliente.data_nascimento), 'dd/MM/yyyy') : '-'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <span className="text-slate-500">Status</span>
              <StatusBadge status={cliente.status} />
            </div>
          </CardContent>
        </Card>

        {/* Resumo e Vendas */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cards resumo */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-50">
                  <ShoppingCart className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Total de Vendas</p>
                  <p className="text-2xl font-bold">{totalVendas}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-emerald-50">
                  <ShoppingCart className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Valor Total</p>
                  <p className="text-2xl font-bold">{formatCurrency(valorTotal)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Histórico de Vendas */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Histórico de Vendas ({todasVendas.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={vendasColumns}
                data={todasVendas}
                isLoading={loadingVendas || loadingPropostas}
                emptyMessage="Nenhuma venda encontrada"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}