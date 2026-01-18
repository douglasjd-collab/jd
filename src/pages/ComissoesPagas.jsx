import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Download } from 'lucide-react';
import moment from 'moment';

export default function ComissoesPagas() {
  const [user, setUser] = useState(null);
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [filtroDataInicio, setFiltroDataInicio] = useState(moment().startOf('month').format('YYYY-MM-DD'));
  const [filtroDataFim, setFiltroDataFim] = useState(moment().endOf('month').format('YYYY-MM-DD'));
  const [filtroLote, setFiltroLote] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (me.role === 'super_admin') {
        setUser({ ...me, perfil: 'super_admin', empresa_id: null });
      } else {
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
        if (colabs.length > 0) {
          const colab = colabs[0];
          setUser({ ...me, perfil: colab.perfil, empresa_id: colab.empresa_id });
        }
      }
    } catch (e) {
      console.error('Erro ao carregar usuário:', e);
    }
  };

  // Buscar comissões pagas
  const { data: comissoesPagas = [], isLoading: loadingComissoes } = useQuery({
    queryKey: ['comissoes-pagas'],
    queryFn: async () => {
      return await base44.entities.ComissaoAPagar.filter({ status_pagamento: 'paga' });
    },
    enabled: !!user,
  });

  // Buscar vendedores
  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedores'],
    queryFn: async () => {
      return await base44.entities.Colaborador.filter({ perfil: 'vendedor', status: 'ativo' });
    },
    enabled: !!user,
  });

  // Normalizar data
  const normalizeDate = (date) => {
    if (!date) return null;
    const m = moment(date);
    return m.isValid() ? m.format('YYYY-MM-DD') : null;
  };

  // Filtrar dados
  const dadosFiltrados = comissoesPagas.filter((c) => {
    // Filtro vendedor (somente seus dados se for vendedor)
    if (user?.perfil === 'vendedor' && c.vendedor_id !== user.colaborador_id) {
      return false;
    }

    // Filtro vendedor por nome
    if (filtroVendedor && !c.vendedor_nome?.toLowerCase().includes(filtroVendedor.toLowerCase())) {
      return false;
    }

    // Filtro período
    if (c.data_pagamento) {
      const normalized = normalizeDate(c.data_pagamento);
      if (!normalized || normalized < filtroDataInicio || normalized > filtroDataFim) {
        return false;
      }
    }

    // Filtro lote
    if (filtroLote && c.lote_id !== filtroLote) {
      return false;
    }

    return true;
  });

  const handleBaixarRelatorio = async (comissao) => {
    try {
      if (comissao.lote_id) {
        // Buscar o lote e obter relatorio_url
        const lotes = await base44.entities.PagamentoComissaoLote.filter({ lote_code: comissao.lote_id });
        if (lotes.length > 0 && lotes[0].relatorio_html) {
          // Abrir/baixar relatório
          const element = document.createElement('a');
          const file = new Blob([lotes[0].relatorio_html], { type: 'text/html' });
          element.href = URL.createObjectURL(file);
          element.download = `Relatorio_Pagamento_${comissao.lote_id}.html`;
          document.body.appendChild(element);
          element.click();
          document.body.removeChild(element);
        }
      }
    } catch (e) {
      console.error('Erro ao baixar relatório:', e);
    }
  };

  if (!user) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <p className="text-slate-600">Carregando...</p>
        </Card>
      </div>
    );
  }

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(user?.perfil);

  if (!isAdmin && user?.perfil !== 'vendedor') {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <p className="text-slate-600">Acesso restrito</p>
        </Card>
      </div>
    );
  }

  const columns = [
    { key: 'data_pagamento', label: 'Data Pagamento' },
    { key: 'vendedor_nome', label: 'Vendedor' },
    { key: 'cliente_nome', label: 'Cliente' },
    { key: 'grupo', label: 'Grupo' },
    { key: 'cota', label: 'Cota' },
    { key: 'parcela_numero', label: 'Parcela' },
    { key: 'valor_recebido', label: 'Valor Recebido' },
    { key: 'percentual_comissao', label: '% Comissão' },
    { key: 'valor_a_pagar', label: 'Valor Pago' },
    { key: 'forma_pagamento', label: 'Forma Pagamento' },
    { key: 'lote_id', label: 'Lote' },
    { key: 'actions', label: 'Ações' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Comissões Pagas"
        subtitle="Histórico de pagamentos realizados"
      />

      {/* Filtros */}
      <Card className="p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label>Vendedor</Label>
            <Input
              placeholder="Filtrar por vendedor"
              value={filtroVendedor}
              onChange={(e) => setFiltroVendedor(e.target.value)}
            />
          </div>
          <div>
            <Label>Data Início</Label>
            <Input
              type="date"
              value={filtroDataInicio}
              onChange={(e) => setFiltroDataInicio(e.target.value)}
            />
          </div>
          <div>
            <Label>Data Fim</Label>
            <Input
              type="date"
              value={filtroDataFim}
              onChange={(e) => setFiltroDataFim(e.target.value)}
            />
          </div>
          <div>
            <Label>Lote</Label>
            <Input
              placeholder="Filtrar por lote"
              value={filtroLote}
              onChange={(e) => setFiltroLote(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Tabela */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Data Pagamento</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Vendedor</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Cliente</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Grupo/Cota</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Parcela</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Valor Recebido</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">% Comissão</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Valor Pago</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Forma</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Lote</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loadingComissoes ? (
                <tr>
                  <td colSpan="11" className="px-4 py-8 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : dadosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="11" className="px-4 py-8 text-center text-slate-500">
                    Nenhum registro encontrado
                  </td>
                </tr>
              ) : (
                dadosFiltrados.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm">{moment(c.data_pagamento).format('DD/MM/YYYY')}</td>
                    <td className="px-4 py-3 text-sm">{c.vendedor_nome}</td>
                    <td className="px-4 py-3 text-sm">{c.cliente_nome}</td>
                    <td className="px-4 py-3 text-sm">{c.grupo}/{c.cota}</td>
                    <td className="px-4 py-3 text-sm text-center">{c.parcela_numero}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono">
                      {(c.valor_recebido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">{c.percentual_comissao || 100}%</td>
                    <td className="px-4 py-3 text-sm text-right font-mono font-bold text-green-600">
                      {(c.valor_a_pagar || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-4 py-3 text-sm">{c.forma_pagamento}</td>
                    <td className="px-4 py-3 text-sm">
                      {c.lote_id ? (
                        <Badge variant="outline">{c.lote_id}</Badge>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleBaixarRelatorio(c)}
                          disabled={!c.lote_id}
                          title={c.lote_id ? 'Baixar 2ª via' : 'Sem lote'}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t text-sm text-slate-600">
          Total de registros: {dadosFiltrados.length}
        </div>
      </Card>
    </div>
  );
}