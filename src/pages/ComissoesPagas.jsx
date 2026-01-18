import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Download, Eye, Printer } from 'lucide-react';
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

  // Separar comissões programadas (sem data_pagamento) e quitadas (com data_pagamento)
  const comissoesProgramadas = comissoesPagas.filter(c => !c.data_pagamento);
  const comissoesQuitadas = dadosFiltrados.filter(c => c.data_pagamento);

  // Calcular totais
  const totalProgramado = comissoesProgramadas.reduce((acc, c) => acc + (c.valor_a_pagar || 0), 0);
  const totalQuitado = comissoesQuitadas.reduce((acc, c) => acc + (c.valor_a_pagar || 0), 0);

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

      {/* Comissões Programadas */}
      {comissoesProgramadas.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Comissões Programadas</h2>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-700 text-white">
                    <th className="px-4 py-3 text-left text-sm font-semibold">Nº PROTOCOLO</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">DATA PROGRAMADA</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">VALOR COMISSÃO</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">ACRÉSCIMOS</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">DESCONTOS</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-100 border-b">
                    <td colSpan="6" className="px-4 py-2 text-sm">
                      <span className="font-semibold text-slate-700">Total: {comissoesProgramadas.length}</span>
                    </td>
                  </tr>
                  {comissoesProgramadas.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-4 py-8 text-center text-slate-500">
                        Nenhuma comissão programada
                      </td>
                    </tr>
                  ) : (
                    comissoesProgramadas.map((c) => (
                      <tr key={c.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm">{c.recebimento_id}</td>
                        <td className="px-4 py-3 text-sm">{moment(c.data_recebimento).format('DD/MM/YYYY')}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono">
                          {(c.valor_a_pagar || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-mono">R$ 0,00</td>
                        <td className="px-4 py-3 text-sm text-right font-mono">R$ 0,00</td>
                        <td className="px-4 py-3 text-sm text-right font-mono font-bold">
                          {(c.valor_a_pagar || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Comissões Quitadas */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Comissões Quitadas</h2>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-slate-700 text-white">
                  <th className="px-4 py-3 text-left text-sm font-semibold">Nº PROTOCOLO</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">DATA QUITAÇÃO</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">VALOR COMISSÃO</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">ACRÉSCIMOS</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">DESCONTOS</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">TOTAL</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold">AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {loadingComissoes ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                      Carregando...
                    </td>
                  </tr>
                ) : comissoesQuitadas.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                      Nenhuma comissão quitada encontrada
                    </td>
                  </tr>
                ) : (
                  comissoesQuitadas.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm">{c.recebimento_id}</td>
                      <td className="px-4 py-3 text-sm">{moment(c.data_pagamento).format('DD/MM/YYYY')}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono">
                        {(c.valor_a_pagar || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono">R$ 0,00</td>
                      <td className="px-4 py-3 text-sm text-right font-mono">R$ 0,00</td>
                      <td className="px-4 py-3 text-sm text-right font-mono font-bold text-green-600">
                        {(c.valor_a_pagar || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Visualizar"
                            className="text-slate-600 hover:text-slate-900"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleBaixarRelatorio(c)}
                            disabled={!c.lote_id}
                            title={c.lote_id ? 'Imprimir' : 'Sem lote'}
                            className="text-slate-600 hover:text-slate-900"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}