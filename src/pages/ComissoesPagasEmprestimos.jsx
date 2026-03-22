import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, ChevronDown, ChevronUp, FileText, Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import moment from 'moment';
import 'moment/locale/pt-br';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

moment.locale('pt-br');

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const TIPO_EMPRESTIMO_LABEL = {
  'NOVO': 'Novo', 'novo': 'Novo',
  'REFINANCIAMENTO': 'Refin', 'refinanciamento': 'Refin',
  'PORTABILIDADE': 'Portabilidade', 'portabilidade': 'Portabilidade',
  'CARTAO_CONSIGNADO': 'Cartão', 'cartao_consignado': 'Cartão',
};
const getTipoLabel = (tipo) => TIPO_EMPRESTIMO_LABEL[tipo] || tipo || '-';

export default function ComissoesPagasEmprestimos() {
  const [user, setUser] = useState(null);
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [filtroMes, setFiltroMes] = useState('todos');
  const [expandedLotes, setExpandedLotes] = useState({});
  const [loteExcluir, setLoteExcluir] = useState(null);
  const [excluindo, setExcluindo] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
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

  // Buscar lotes de pagamento (novo sistema)
  const { data: lotes = [], isLoading: loadingLotes } = useQuery({
    queryKey: ['lotes-pagamento-emp', user?.empresa_id],
    queryFn: () => {
      const filter = {};
      if (user?.empresa_id) filter.empresa_id = user.empresa_id;
      return base44.entities.LotePagamentoComissaoEmprestimo.filter(filter, '-data_pagamento', 500);
    },
    enabled: !!user,
  });

  // Buscar todos os itens de comissão paga (novo sistema)
  const { data: itens = [], isLoading: loadingItens } = useQuery({
    queryKey: ['comissoes-emp-pagas-itens', user?.empresa_id],
    queryFn: () => {
      const filter = {};
      if (user?.empresa_id) filter.empresa_id = user.empresa_id;
      return base44.entities.ComissaoEmprestimoPaga.filter(filter, '-data_pagamento', 2000);
    },
    enabled: !!user,
  });

  // Buscar propostas legado (comissao_vendedor_paga = true, sem lote novo)
  const { data: propostasLegado = [], isLoading: loadingLegado } = useQuery({
    queryKey: ['propostas-emp-pagas-legado', user?.empresa_id],
    queryFn: () => {
      const filter = { produto: 'emprestimo', comissao_vendedor_paga: true };
      if (user?.empresa_id) filter.empresa_id = user.empresa_id;
      return base44.entities.Proposta.filter(filter, '-comissao_vendedor_data_pagamento', 1000);
    },
    enabled: !!user,
  });

  const isLoading = loadingLotes || loadingItens || loadingLegado;

  // IDs de propostas já com lote novo
  const propostasComLote = new Set(itens.map(i => i.proposta_id).filter(Boolean));

  // Propostas legado = pagas mas sem lote novo
  const propostasOrfas = propostasLegado.filter(p => !propostasComLote.has(p.id));

  // Montar lotes sintéticos do legado agrupados por vendedor + data pagamento
  const legadoGrupos = {};
  propostasOrfas.forEach(p => {
    const key = `legado_${p.vendedor_id || 'sv'}_${p.comissao_vendedor_data_pagamento || 'sem-data'}`;
    if (!legadoGrupos[key]) {
      legadoGrupos[key] = {
        id: key,
        lote_codigo: null,
        vendedor_id: p.vendedor_id,
        vendedor_nome: p.vendedor_nome || 'Sem Vendedor',
        data_pagamento: p.comissao_vendedor_data_pagamento,
        forma_pagamento: p.comissao_vendedor_forma_pagamento,
        quantidade_propostas: 0,
        valor_total: 0,
        isLegado: true,
        propostas: [],
      };
    }
    const valPago = p.valor_comissao_vendedor_pago || p.valor_comissao || 0;
    legadoGrupos[key].valor_total += valPago;
    legadoGrupos[key].quantidade_propostas += 1;
    legadoGrupos[key].propostas.push(p);
  });

  // Unificar lotes novos + lotes legado
  const todosLotes = [
    ...lotes.map(l => ({ ...l, isLegado: false })),
    ...Object.values(legadoGrupos),
  ].sort((a, b) => {
    if (!a.data_pagamento) return 1;
    if (!b.data_pagamento) return -1;
    return b.data_pagamento.localeCompare(a.data_pagamento);
  });

  // Filtrar
  const lotesFiltrados = todosLotes.filter(l => {
    if (filtroVendedor && !l.vendedor_nome?.toLowerCase().includes(filtroVendedor.toLowerCase())) return false;
    if (filtroMes !== 'todos' && l.data_pagamento) {
      if (moment(l.data_pagamento).format('YYYY-MM') !== filtroMes) return false;
    }
    return true;
  });

  // Agrupar itens por lote (novo sistema)
  const itensPorLote = itens.reduce((acc, item) => {
    if (!acc[item.lote_pagamento_id]) acc[item.lote_pagamento_id] = [];
    acc[item.lote_pagamento_id].push(item);
    return acc;
  }, {});

  const mesesDisponiveis = [...new Set(todosLotes
    .filter(l => l.data_pagamento)
    .map(l => moment(l.data_pagamento).format('YYYY-MM'))
  )].sort().reverse();

  const totalGeral = lotesFiltrados.reduce((acc, l) => acc + (l.valor_total || 0), 0);

  const toggleLote = (id) => setExpandedLotes(prev => ({ ...prev, [id]: !prev[id] }));

  const handleExcluirLote = async () => {
    if (!loteExcluir) return;
    setExcluindo(true);
    try {
      const lote = loteExcluir;
      // Reverter propostas vinculadas ao lote
      const loteItensRevert = itensPorLote[lote.id] || [];
      for (const item of loteItensRevert) {
        if (item.proposta_id) {
          await base44.entities.Proposta.update(item.proposta_id, {
            comissao_vendedor_paga: false,
            comissao_vendedor_data_pagamento: null,
            comissao_vendedor_forma_pagamento: null,
            percentual_comissao_vendedor: null,
            valor_comissao_vendedor_pago: null,
          });
        }
        await base44.entities.ComissaoEmprestimoPaga.delete(item.id);
      }
      // Reverter adiantamentos vinculados ao lote
      try {
        const adisLote = await base44.entities.Adiantamento.filter({ lote_pagamento_id: lote.id });
        for (const adi of adisLote) {
          await base44.entities.Adiantamento.update(adi.id, {
            status: 'pendente',
            data_desconto: null,
            lote_pagamento_id: null,
          });
        }
      } catch {}
      // Excluir o lote
      await base44.entities.LotePagamentoComissaoEmprestimo.delete(lote.id);
      queryClient.invalidateQueries(['lotes-pagamento-emp']);
      queryClient.invalidateQueries(['comissoes-emp-pagas-itens']);
      queryClient.invalidateQueries(['propostas-emp-pagas-legado']);
      queryClient.invalidateQueries(['propostas-emp-comissoes']);
      toast.success('Lote excluído! Propostas voltaram para "a pagar".');
      setLoteExcluir(null);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao excluir lote');
    } finally {
      setExcluindo(false);
    }
  };

  const gerarPDF = (lote) => {
    // Lotes legado usam as propostas diretamente; lotes novos usam snapshots
    const loteItens = lote.isLegado
      ? (lote.propostas || []).map(p => ({
          cliente_nome: p.cliente_nome,
          contrato: p.contrato,
          emprestimo_tipo: p.emprestimo_tipo,
          banco: p.administradora_nome,
          data_liberacao: p.emprestimo_data_liberacao || p.data_venda,
          valor_credito: p.valor_credito || 0,
          percentual_empresa_original: p.valor_comissao && p.valor_credito ? (p.valor_comissao / p.valor_credito) * 100 : 0,
          valor_comissao_empresa_original: p.valor_comissao || 0,
          percentual_vendedor_pago: p.percentual_comissao_vendedor || (p.valor_comissao && p.valor_credito ? (p.valor_comissao / p.valor_credito) * 100 : 0),
          valor_vendedor_pago: p.valor_comissao_vendedor_pago || p.valor_comissao || 0,
          percentual_vendedor_editado_manual: false,
        }))
      : (itensPorLote[lote.id] || []);
    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFillColor(16, 53, 60);
    doc.rect(0, 0, 297, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('COMPROVANTE DE PAGAMENTO DE COMISSÃO — EMPRÉSTIMOS', 148, 10, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Lote: ${lote.lote_codigo || lote.id}  |  Gerado em: ${moment().format('DD/MM/YYYY HH:mm')}`, 148, 17, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(10, 26, 277, 22, 2, 2, 'F');
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Vendedor:', 14, 33); doc.text('Data Pagamento:', 90, 33);
    doc.text('Forma Pagamento:', 160, 33); doc.text('Qtd. Itens:', 230, 33);
    doc.setFont('helvetica', 'normal');
    doc.text(lote.vendedor_nome || '-', 14, 39);
    doc.text(lote.data_pagamento ? moment(lote.data_pagamento).format('DD/MM/YYYY') : '-', 90, 39);
    doc.text(lote.forma_pagamento || '-', 160, 39);
    doc.text(String(loteItens.length || lote.quantidade_propostas || 0), 230, 39);

    doc.autoTable({
      startY: 54,
      head: [['Cliente', 'Contrato', 'Tipo', 'Banco', 'Data Lib.', 'Vl. Crédito', '% Vendedor', 'Vl. Pago']],
      body: loteItens.map(item => [
        item.cliente_nome || '-',
        item.contrato || '-',
        getTipoLabel(item.emprestimo_tipo),
        item.banco || '-',
        item.data_liberacao ? moment(item.data_liberacao).format('DD/MM/YYYY') : '-',
        fmt(item.valor_credito),
        `${Number(item.percentual_vendedor_pago || 0).toFixed(2)}%`,
        fmt(item.valor_vendedor_pago),
      ]),
      foot: [['', '', '', '', '', '', 'Total:', fmt(lote.valor_total)]],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [16, 53, 60], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [230, 240, 255], fontStyle: 'bold', textColor: [0, 0, 0] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right', textColor: [0, 80, 180] } },
    });

    const ph = doc.internal.pageSize.height;
    doc.setFontSize(7); doc.setTextColor(0, 0, 255);
    doc.text(`Gerado em ${moment().format('DD/MM/YYYY HH:mm')}`, 148, ph - 5, { align: 'center' });
    doc.save(`comissao_emp_${(lote.vendedor_nome || 'vendedor').replace(/\s+/g, '_')}_${moment(lote.data_pagamento || undefined).format('YYYYMMDD')}.pdf`);
  };

  if (!user) return (
    <div className="p-6 flex items-center gap-2 text-slate-500">
      <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Comissões Pagas — Empréstimos</h1>
        <p className="text-slate-500 text-sm mt-1">Histórico de comissões pagas aos vendedores de empréstimos.</p>
      </div>

      {/* Resumo */}
      <Card className="p-6 bg-gradient-to-r from-green-50 to-emerald-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600 mb-1">Total Pago</p>
            <p className="text-3xl font-bold text-green-600">{fmt(totalGeral)}</p>
            <p className="text-xs text-slate-500 mt-1">{lotesFiltrados.length} lote(s) de pagamento</p>
          </div>
          <FileText className="w-12 h-12 text-green-600 opacity-20" />
        </div>
      </Card>

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Vendedor</Label>
            <Input placeholder="Filtrar por vendedor" value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Mês</Label>
            <Select value={filtroMes} onValueChange={setFiltroMes}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meses</SelectItem>
                {mesesDisponiveis.map(mes => (
                  <SelectItem key={mes} value={mes}>{moment(mes).format('MMMM [de] YYYY')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Lista de lotes */}
      {isLoading ? (
        <Card className="p-8 text-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Carregando...
        </Card>
      ) : lotesFiltrados.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">Nenhuma comissão paga encontrada</Card>
      ) : (
        <div className="space-y-4">
          {lotesFiltrados.map(lote => {
            const loteItens = itensPorLote[lote.id] || [];
            const isExp = expandedLotes[lote.id];

            return (
              <Card key={lote.id} className="overflow-hidden shadow-sm">
                <div
                  className="bg-gradient-to-r from-[#10353C] to-[#1a5060] text-white p-4 flex items-center gap-4 cursor-pointer select-none"
                  onClick={() => toggleLote(lote.id)}
                >
                  <div className="w-11 h-11 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                    {lote.vendedor_nome?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base uppercase tracking-wide truncate">{lote.vendedor_nome}</h3>
                    <div className="flex items-center gap-3 text-xs text-white/70 mt-0.5 flex-wrap">
                      <span>Pago em: {lote.data_pagamento ? moment(lote.data_pagamento).format('DD/MM/YYYY') : '-'}</span>
                      <span>•</span>
                      <span>{lote.quantidade_propostas} proposta(s)</span>
                      <span>•</span>
                      <span className="font-semibold text-white">{fmt(lote.valor_total)}</span>
                      {lote.forma_pagamento && <><span>•</span><span>{lote.forma_pagamento}</span></>}
                      {lote.lote_codigo && <><span>•</span><span className="font-mono text-white/50">{lote.lote_codigo}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white border-0"
                      onClick={() => gerarPDF(lote)}>
                      <Download className="w-4 h-4 mr-1" />PDF
                    </Button>
                    {!lote.isLegado && (
                      <Button size="sm" variant="ghost"
                        className="text-red-300 hover:text-red-100 hover:bg-red-900/30 border-0"
                        onClick={() => setLoteExcluir(lote)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <div className="text-white/50 ml-1">
                    {isExp ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>

                {isExp && (() => {
                  const rowItens = lote.isLegado
                    ? (lote.propostas || []).map(p => ({
                        id: p.id,
                        cliente_nome: p.cliente_nome,
                        contrato: p.contrato,
                        emprestimo_tipo: p.emprestimo_tipo,
                        banco: p.administradora_nome,
                        data_liberacao: p.emprestimo_data_liberacao || p.data_venda,
                        valor_credito: p.valor_credito || 0,
                        percentual_empresa_original: p.valor_comissao && p.valor_credito ? (p.valor_comissao / p.valor_credito) * 100 : 0,
                        valor_comissao_empresa_original: p.valor_comissao || 0,
                        percentual_vendedor_pago: p.percentual_comissao_vendedor || (p.valor_comissao && p.valor_credito ? (p.valor_comissao / p.valor_credito) * 100 : 0),
                        valor_vendedor_pago: p.valor_comissao_vendedor_pago || p.valor_comissao || 0,
                        percentual_vendedor_editado_manual: false,
                      }))
                    : (itensPorLote[lote.id] || []);

                  return (
                    <div className="overflow-x-auto">
                      {rowItens.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-sm">Itens não encontrados para este lote</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 border-b">
                            <tr className="text-slate-600">
                              <th className="p-3 text-left font-semibold">Cliente</th>
                              <th className="p-3 text-left font-semibold">Contrato</th>
                              <th className="p-3 text-left font-semibold">Tipo</th>
                              <th className="p-3 text-left font-semibold">Banco</th>
                              <th className="p-3 text-left font-semibold">Data Lib.</th>
                              <th className="p-3 text-right font-semibold">Vl. Bruto</th>
                              <th className="p-3 text-right font-semibold">Vl. Líquido</th>
                              <th className="p-3 text-right font-semibold">Vl. Parcela</th>
                              <th className="p-3 text-right font-semibold">% Empresa</th>
                              <th className="p-3 text-right font-semibold">Vl. Empresa</th>
                              <th className="p-3 text-right font-semibold">% Vendedor</th>
                              <th className="p-3 text-right font-semibold">Vl. Pago</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rowItens.map(item => (
                              <tr key={item.id} className="border-b hover:bg-slate-50">
                                <td className="p-3 font-medium text-slate-900">{item.cliente_nome || '-'}</td>
                                <td className="p-3 text-slate-600">{item.contrato || '-'}</td>
                                <td className="p-3">
                                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700">
                                    {getTipoLabel(item.emprestimo_tipo)}
                                  </span>
                                </td>
                                <td className="p-3 text-slate-600">{item.banco || '-'}</td>
                                <td className="p-3 text-slate-500 text-xs">
                                  {item.data_liberacao ? moment(item.data_liberacao).format('DD/MM/YYYY') : '-'}
                                </td>
                                <td className="p-3 text-right font-medium">{fmt(item.valor_credito)}</td>
                                <td className="p-3 text-right text-slate-600">{item.valor_liquido ? fmt(item.valor_liquido) : '-'}</td>
                                <td className="p-3 text-right text-slate-500 text-xs">{item.valor_parcela ? fmt(item.valor_parcela) : '-'}</td>
                                <td className="p-3 text-right text-slate-500 text-xs">
                                  {Number(item.percentual_empresa_original || 0).toFixed(2)}%
                                </td>
                                <td className="p-3 text-right text-slate-600">{fmt(item.valor_comissao_empresa_original)}</td>
                                <td className="p-3 text-right text-slate-700">
                                  {Number(item.percentual_vendedor_pago || 0).toFixed(2)}%
                                  {item.percentual_vendedor_editado_manual && (
                                    <span className="ml-1 text-xs text-orange-500" title="Editado manualmente">✎</span>
                                  )}
                                </td>
                                <td className="p-3 text-right font-bold text-blue-700">{fmt(item.valor_vendedor_pago)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-50 border-t">
                            <tr>
                              <td colSpan={9} className="p-3 text-right font-bold text-slate-700">Total:</td>
                              <td className="p-3 text-right font-bold text-blue-700">{fmt(lote.valor_total)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  );
                })()}
              </Card>
            );
          })}
        </div>
      )}
      {/* Modal confirmação exclusão */}
      <Dialog open={!!loteExcluir} onOpenChange={(v) => { if (!v) setLoteExcluir(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" /> Excluir Lote de Pagamento
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-2">
            <p className="text-slate-700">Tem certeza que deseja excluir este lote?</p>
            {loteExcluir && (
              <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                <p><span className="font-semibold">Vendedor:</span> {loteExcluir.vendedor_nome}</p>
                <p><span className="font-semibold">Lote:</span> {loteExcluir.lote_codigo}</p>
                <p><span className="font-semibold">Data:</span> {loteExcluir.data_pagamento ? moment(loteExcluir.data_pagamento).format('DD/MM/YYYY') : '-'}</p>
                <p><span className="font-semibold">Valor:</span> {fmt(loteExcluir.valor_total)}</p>
              </div>
            )}
            <p className="text-orange-600 text-sm font-medium">
              ⚠️ As propostas voltarão para o status "a pagar" e os adiantamentos descontados serão restaurados como pendentes.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setLoteExcluir(null)} disabled={excluindo}>Cancelar</Button>
            <Button onClick={handleExcluirLote} disabled={excluindo} className="bg-red-600 hover:bg-red-700 text-white">
              {excluindo ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Excluindo...</> : <><Trash2 className="w-4 h-4 mr-2" />Confirmar Exclusão</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}