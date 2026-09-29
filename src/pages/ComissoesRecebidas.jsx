import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/PageHeader';
import { Search, DollarSign, User, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';
import { formatDateBR } from '@/components/utils/dateHelpers';

const formatCurrency = (value) =>
  (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const getProduto = (recebimento) =>
  recebimento.grupo || recebimento.cota ? 'consorcio' : 'emprestimo';

const getProdutoLabel = (produto) =>
  produto === 'consorcio' ? 'Consórcio' : 'Empréstimo';

const getContratoKey = (recebimento) => {
  if (getProduto(recebimento) === 'consorcio') {
    return `consorcio:${recebimento.grupo || ''}:${recebimento.cota || ''}`;
  }
  return `emprestimo:${recebimento.contrato || recebimento.venda_id || ''}`;
};

const getContratoLabel = (recebimento) => {
  if (getProduto(recebimento) === 'consorcio') {
    const grupoCota = [recebimento.grupo, recebimento.cota].filter(Boolean).join('/');
    return grupoCota ? `Grupo/Cota ${grupoCota}` : 'Consórcio sem grupo/cota';
  }
  return recebimento.contrato
    ? `Contrato/ADE ${recebimento.contrato}`
    : 'Empréstimo sem contrato informado';
};

export default function ComissoesRecebidas() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [clienteAberto, setClienteAberto] = useState(null);
  const [produtoFilter, setProdutoFilter] = useState('todos');
  const [contratoFilter, setContratoFilter] = useState('todos');

  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    if (me.role === 'super_admin') {
      setUser({ ...me, perfil: 'super_admin', empresa_id: null });
      return;
    }

    const colabs = await base44.entities.Colaborador.filter({ user_id: me.id }, '-created_date');
    const colab = colabs.find((c) => c.status === 'ativo') || colabs[0];
    if (colab) {
      setUser({ ...me, perfil: colab.perfil, empresa_id: colab.empresa_id, colaborador_id: colab.id });
    }
  };

  // Perfis administrativos enxergam toda a empresa; parceiro/vendedor enxergam apenas os próprios recebimentos
  const perfilUsuario = user?.perfil || (user?.role === 'admin' ? 'admin' : '');
  const acessoTotal = ['master', 'super_admin', 'admin', 'gerente'].includes(perfilUsuario);

  const { data: recebimentos = [], isLoading } = useQuery({
    queryKey: ['recebimentos-comissao-por-cliente', user?.empresa_id, user?.colaborador_id, acessoTotal],
    queryFn: () => {
      const filtro = { status_recebimento: 'recebida' };
      if (user?.empresa_id) filtro.empresa_id = user.empresa_id;
      if (!acessoTotal) filtro.vendedor_id = user.colaborador_id || user.id;
      return base44.entities.RecebimentoComissao.filter(filtro, '-data_recebimento', 1000);
    },
    enabled: !!user,
  });

  const clientes = useMemo(() => {
    const agrupados = {};

    recebimentos.forEach((recebimento) => {
      const nome = recebimento.cliente_nome?.trim() || 'Cliente não identificado';
      const chave = recebimento.cliente_id || nome.toLowerCase();

      if (!agrupados[chave]) {
        agrupados[chave] = {
          chave,
          cliente_id: recebimento.cliente_id,
          nome,
          recebimentos: [],
          total: 0,
          produtos: new Set(),
          contratos: new Set(),
        };
      }

      agrupados[chave].recebimentos.push(recebimento);
      agrupados[chave].total += recebimento.valor_recebido || 0;
      agrupados[chave].produtos.add(getProduto(recebimento));
      agrupados[chave].contratos.add(getContratoKey(recebimento));
    });

    const termo = searchTerm.trim().toLowerCase();

    return Object.values(agrupados)
      .filter((cliente) => !termo || cliente.nome.toLowerCase().includes(termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [recebimentos, searchTerm]);

  const totalGeral = recebimentos.reduce(
    (total, item) => total + (item.valor_recebido || 0),
    0
  );

  const abrirCliente = (chave) => {
    setClienteAberto((atual) => (atual === chave ? null : chave));
    setProdutoFilter('todos');
    setContratoFilter('todos');
  };

  if (!user) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Comissões Recebidas"
        subtitle="Busque um cliente e consulte todas as comissões recebidas em seus produtos e contratos"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5 sm:col-span-2">
          <p className="text-sm text-slate-500">Total de comissões recebidas</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{formatCurrency(totalGeral)}</p>
        </Card>
        <Card className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Clientes com recebimento</p>
            <p className="text-3xl font-bold text-[#10353C] mt-1">{clientes.length}</p>
          </div>
          <DollarSign className="w-10 h-10 text-green-600" />
        </Card>
      </div>

      <Card className="p-4 mb-6">
        <label className="text-sm font-semibold text-slate-700 block mb-2">
          Buscar cliente
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Digite o nome do cliente..."
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setClienteAberto(null);
              setProdutoFilter('todos');
              setContratoFilter('todos');
            }}
            className="pl-10 h-11"
          />
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-10 text-center text-slate-500">Carregando comissões...</Card>
      ) : clientes.length === 0 ? (
        <Card className="p-10 text-center text-slate-500">
          Nenhum cliente com comissão recebida foi encontrado.
        </Card>
      ) : (
        <div className="space-y-3">
          {clientes.map((cliente) => {
            const aberto = clienteAberto === cliente.chave;
            const contratosDisponiveis = [...new Map(
              cliente.recebimentos
                .filter((item) => produtoFilter === 'todos' || getProduto(item) === produtoFilter)
                .map((item) => [getContratoKey(item), {
                  chave: getContratoKey(item),
                  label: getContratoLabel(item),
                }])
            ).values()];

            const recebimentosFiltrados = cliente.recebimentos
              .filter((item) => produtoFilter === 'todos' || getProduto(item) === produtoFilter)
              .filter((item) => contratoFilter === 'todos' || getContratoKey(item) === contratoFilter)
              .sort((a, b) =>
                String(b.data_recebimento || '').localeCompare(String(a.data_recebimento || ''))
              );

            const totalFiltrado = recebimentosFiltrados.reduce(
              (total, item) => total + (item.valor_recebido || 0),
              0
            );

            return (
              <Card key={cliente.chave} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => abrirCliente(cliente.chave)}
                  className="w-full p-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-[#10353C]/10 text-[#10353C] flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 truncate">{cliente.nome}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500">
                          {cliente.recebimentos.length} recebimento{cliente.recebimentos.length !== 1 ? 's' : ''}
                        </span>
                        {[...cliente.produtos].map((produto) => (
                          <Badge key={produto} variant="secondary" className="text-xs">
                            {getProdutoLabel(produto)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Total recebido</p>
                      <p className="font-bold text-green-700">{formatCurrency(cliente.total)}</p>
                    </div>
                    {aberto
                      ? <ChevronUp className="w-5 h-5 text-slate-500" />
                      : <ChevronDown className="w-5 h-5 text-slate-500" />}
                  </div>
                </button>

                {aberto && (
                  <div className="border-t bg-slate-50/60 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                          Produto
                        </label>
                        <Select
                          value={produtoFilter}
                          onValueChange={(value) => {
                            setProdutoFilter(value);
                            setContratoFilter('todos');
                          }}
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Todos os produtos" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todos os produtos</SelectItem>
                            {cliente.produtos.has('consorcio') && (
                              <SelectItem value="consorcio">Consórcio</SelectItem>
                            )}
                            {cliente.produtos.has('emprestimo') && (
                              <SelectItem value="emprestimo">Empréstimo</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                          Contrato ou grupo/cota
                        </label>
                        <Select value={contratoFilter} onValueChange={setContratoFilter}>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Todos os contratos" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todos os contratos</SelectItem>
                            {contratosDisponiveis.map((contrato) => (
                              <SelectItem key={contrato.chave} value={contrato.chave}>
                                {contrato.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 bg-white border rounded-lg p-3 mb-4">
                      <div>
                        <p className="text-xs text-slate-500">Total no filtro selecionado</p>
                        <p className="font-bold text-xl text-green-700">{formatCurrency(totalFiltrado)}</p>
                      </div>
                      <Badge variant="outline">
                        {recebimentosFiltrados.length} lançamento{recebimentosFiltrados.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>

                    <div className="overflow-x-auto bg-white rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 text-slate-600">
                          <tr>
                            <th className="text-left px-3 py-2.5 font-semibold">Produto</th>
                            <th className="text-left px-3 py-2.5 font-semibold">Contrato / Grupo e Cota</th>
                            <th className="text-left px-3 py-2.5 font-semibold">Banco / Administradora</th>
                            <th className="text-left px-3 py-2.5 font-semibold">Parcela</th>
                            <th className="text-left px-3 py-2.5 font-semibold">Recebido em</th>
                            <th className="text-right px-3 py-2.5 font-semibold">Valor recebido</th>
                            <th className="text-center px-3 py-2.5 font-semibold">Contrato</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recebimentosFiltrados.map((recebimento) => {
                            const produto = getProduto(recebimento);
                            return (
                              <tr key={recebimento.id} className="border-t hover:bg-slate-50">
                                <td className="px-3 py-3">
                                  <Badge variant="secondary">{getProdutoLabel(produto)}</Badge>
                                </td>
                                <td className="px-3 py-3 font-medium">
                                  {getContratoLabel(recebimento)}
                                </td>
                                <td className="px-3 py-3">
                                  {recebimento.administradora_nome || '-'}
                                </td>
                                <td className="px-3 py-3">
                                  {recebimento.parcela_informada
                                    ? `${recebimento.parcela_informada}ª`
                                    : '-'}
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  {formatDateBR(recebimento.data_recebimento)}
                                </td>
                                <td className="px-3 py-3 text-right font-bold text-green-700">
                                  {formatCurrency(recebimento.valor_recebido)}
                                </td>
                                <td className="px-3 py-3 text-center">
                                  {recebimento.venda_id ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-1.5"
                                      onClick={() => {
                                        window.location.href = createPageUrl(
                                          produto === 'consorcio'
                                            ? `VendaDetalhes?id=${recebimento.venda_id}`
                                            : `PropostaEmprestimoDetalhes?id=${recebimento.venda_id}`
                                        );
                                      }}
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      Abrir
                                    </Button>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}