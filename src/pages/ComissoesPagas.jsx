import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Download, ChevronDown, ChevronUp, FileText, User, Hash } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/pt-br';
import { formatDateBR } from '@/components/utils/dateHelpers';
import { toast } from 'react-hot-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

moment.locale('pt-br');

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ComissoesPagas() {
  const [user, setUser] = useState(null);
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [filtroMes, setFiltroMes] = useState('todos');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [expandedLotes, setExpandedLotes] = useState({});

  useEffect(() => { loadUser(); }, []);

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

  const { data: comissoesPagas = [], isLoading } = useQuery({
    queryKey: ['comissoes-pagas'],
    queryFn: () => base44.entities.ComissaoAPagar.filter({ status_pagamento: 'paga' }),
    enabled: !!user,
  });

  const { data: lotes = [] } = useQuery({
    queryKey: ['lotes-pagamento'],
    queryFn: () => base44.entities.PagamentoComissaoLote.filter({}),
    enabled: !!user,
  });

  // Filtrar comissões
  const dadosFiltrados = comissoesPagas.filter((c) => {
    if (user?.perfil === 'vendedor' && c.vendedor_id !== user.id) return false;
    if (filtroVendedor && !c.vendedor_nome?.toLowerCase().includes(filtroVendedor.toLowerCase())) return false;
    if (filtroMes !== 'todos' && c.data_pagamento) {
      if (moment(c.data_pagamento).format('YYYY-MM') !== filtroMes) return false;
    }
    if (filtroCliente) {
      const termo = filtroCliente.toLowerCase().replace(/\D/g, '') || filtroCliente.toLowerCase();
      const nomeMatch = c.cliente_nome?.toLowerCase().includes(filtroCliente.toLowerCase());
      const cpfMatch = c.cliente_cpf?.replace(/\D/g, '').includes(filtroCliente.replace(/\D/g, ''));
      if (!nomeMatch && !cpfMatch) return false;
    }
    return true;
  });

  // Agrupar por lote (lote_code = protocolo único por pagamento)
  // Cada lote do PagamentoComissaoLote é um relatório individual
  const lotesFiltrados = lotes.filter(l => {
    if (filtroVendedor && !l.vendedor_nome?.toLowerCase().includes(filtroVendedor.toLowerCase())) return false;
    if (filtroMes !== 'todos' && l.data_pagamento) {
      if (moment(l.data_pagamento).format('YYYY-MM') !== filtroMes) return false;
    }
    return true;
  }).sort((a, b) => moment(b.data_pagamento).valueOf() - moment(a.data_pagamento).valueOf());

  // Para cada lote, buscar as comissões correspondentes
  const lotesComComissoes = lotesFiltrados.map(lote => {
    let ids = [];
    try { ids = JSON.parse(lote.comissoes_ids || '[]'); } catch { ids = []; }
    const comissoesDoLote = dadosFiltrados.filter(c => ids.includes(c.id));
    return { ...lote, comissoes: comissoesDoLote };
  }).filter(lote => {
    // Se há filtro de cliente, exibir apenas lotes que contenham ao menos uma comissão do cliente buscado
    if (filtroCliente) return lote.comissoes.length > 0;
    return true;
  });

  // Comissões sem lote (pagas mas sem protocolo)
  const idsEmLotes = new Set(lotesComComissoes.flatMap(l => l.comissoes.map(c => c.id)));
  const semLote = dadosFiltrados.filter(c => !idsEmLotes.has(c.id));

  const mesesDisponiveis = [...new Set(comissoesPagas
    .filter(c => c.data_pagamento)
    .map(c => moment(c.data_pagamento).format('YYYY-MM'))
  )].sort().reverse();

  const toggleLote = (id) => setExpandedLotes(prev => ({ ...prev, [id]: !prev[id] }));

  const gerarPDF = (lote) => {
    const comissoesLote = lote.comissoes;
    if (!comissoesLote.length) { toast.error('Sem comissões para gerar PDF'); return; }

    const doc = new jsPDF({ orientation: 'landscape' });
    const totalPago = comissoesLote.reduce((acc, c) => acc + (c.valor_a_pagar || 0), 0);
    const totalRecebido = comissoesLote.reduce((acc, c) => acc + (c.valor_recebido || 0), 0);

    doc.setFillColor(16, 53, 60);
    doc.rect(0, 0, 297, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('COMPROVANTE DE PAGAMENTO DE COMISSÃO', 148, 10, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Protocolo: ${lote.lote_code}  |  Gerado em: ${moment().format('DD/MM/YYYY HH:mm')}`, 148, 17, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(10, 26, 277, 28, 2, 2, 'F');
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Vendedor:', 14, 33); doc.text('Data Pagamento:', 90, 33);
    doc.text('Forma Pagamento:', 160, 33); doc.text('Qtd. Itens:', 230, 33);
    doc.setFont('helvetica', 'normal');
    doc.text(lote.vendedor_nome || '-', 14, 39);
    doc.text(moment(lote.data_pagamento, 'YYYY-MM-DD').format('DD/MM/YYYY'), 90, 39);
    doc.text(lote.forma_pagamento || '-', 160, 39);
    doc.text(String(comissoesLote.length), 230, 39);
    if (lote.observacao) {
      doc.setFont('helvetica', 'bold'); doc.text('Observação:', 14, 46);
      doc.setFont('helvetica', 'normal'); doc.text(lote.observacao, 45, 46);
    }
    doc.setFont('helvetica', 'bold');
    doc.text('Total Recebido (Adm):', 14, 54); doc.text('Total Pago ao Vendedor:', 120, 54);
    doc.setTextColor(0, 120, 80); doc.text(fmt(totalRecebido), 70, 54);
    doc.setTextColor(0, 80, 180); doc.text(fmt(totalPago), 200, 54);
    doc.setTextColor(0, 0, 0);

    doc.autoTable({
      startY: 64,
      head: [['Cliente', 'Grupo/Cota', 'Parcela', 'Data Rec.', 'Vl. Recebido', '% Com.', 'Vl. Pago', 'Administradora']],
      body: comissoesLote.map(c => [
        c.cliente_nome || '-',
        c.grupo && c.cota ? `${c.grupo}/${c.cota}` : c.contrato || '-',
        c.parcela_numero ? `${c.parcela_numero}º` : '-',
        c.data_recebimento ? moment(c.data_recebimento, 'YYYY-MM-DD', true).format('DD/MM/YYYY') : '-',
        fmt(c.valor_recebido), `${c.percentual_comissao || 0}%`, fmt(c.valor_a_pagar),
        c.administradora_nome || '-',
      ]),
      foot: [['', '', '', '', fmt(totalRecebido), '', fmt(totalPago), '']],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [16, 53, 60], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [230, 240, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 4: { halign: 'right' }, 6: { halign: 'right', textColor: [0, 80, 180] } },
    });

    const ph = doc.internal.pageSize.height;
    doc.setFontSize(7); doc.setTextColor(150);
    doc.text(`Protocolo: ${lote.lote_code} | Gerado em ${moment().format('DD/MM/YYYY HH:mm')}`, 148, ph - 5, { align: 'center' });
    doc.save(`comissao_${lote.vendedor_nome?.replace(/\s+/g, '_') || 'vendedor'}_${lote.lote_code}.pdf`);
    toast.success('PDF gerado!');
  };

  const totalGeral = dadosFiltrados.reduce((acc, c) => acc + (c.valor_a_pagar || 0), 0);

  if (!user) return <div className="p-6 text-slate-500">Carregando...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader title="Comissões Pagas (Consórcio)" subtitle="Histórico de pagamentos por protocolo" />

      {/* Resumo */}
      <Card className="p-6 bg-gradient-to-r from-green-50 to-emerald-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600 mb-1">Total Pago</p>
            <p className="text-3xl font-bold text-green-600">{fmt(totalGeral)}</p>
            <p className="text-xs text-slate-500 mt-1">{lotesComComissoes.length} protocolo(s) • {dadosFiltrados.length} comissão(ões)</p>
          </div>
          <FileText className="w-12 h-12 text-green-600 opacity-20" />
        </div>
      </Card>

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Vendedor</Label>
            <Input placeholder="Filtrar por vendedor" value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} />
          </div>
          <div>
            <Label>Cliente (Nome ou CPF)</Label>
            <Input placeholder="Buscar por nome ou CPF do cliente" value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} />
          </div>
          <div>
            <Label>Mês</Label>
            <select
              className="w-full h-9 px-3 border border-slate-200 rounded-md text-sm"
              value={filtroMes}
              onChange={e => setFiltroMes(e.target.value)}
            >
              <option value="todos">Todos os meses</option>
              {mesesDisponiveis.map(mes => (
                <option key={mes} value={mes}>{moment(mes).format('MMMM [de] YYYY')}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Lista de Lotes / Protocolos */}
      {isLoading ? (
        <Card className="p-8 text-center text-slate-400">Carregando...</Card>
      ) : lotesComComissoes.length === 0 && semLote.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">Nenhuma comissão paga encontrada</Card>
      ) : (
        <div className="space-y-4">
          {lotesComComissoes.map(lote => {
            const totalLote = lote.comissoes.reduce((acc, c) => acc + (c.valor_a_pagar || 0), 0);
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-base uppercase tracking-wide truncate">{lote.vendedor_nome}</h3>
                      <Badge className="bg-white/20 text-white text-xs border-white/30">
                        <Hash className="w-3 h-3 mr-1" />{lote.lote_code}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-white/70 mt-0.5 flex-wrap">
                      <span>Pago em: {formatDateBR(lote.data_pagamento)}</span>
                      <span>•</span>
                      <span>{lote.comissoes.length} contrato(s)</span>
                      <span>•</span>
                      <span className="font-semibold text-white">{fmt(totalLote)}</span>
                      {lote.forma_pagamento && <><span>•</span><span>{lote.forma_pagamento}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white border-0"
                      onClick={() => gerarPDF(lote)}>
                      <Download className="w-4 h-4 mr-1" />PDF
                    </Button>
                  </div>
                  <div className="text-white/50 ml-1">
                    {isExp ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>

                {isExp && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-700">Cliente</th>
                          <th className="text-left p-3 font-semibold text-slate-700">Administradora</th>
                          <th className="text-left p-3 font-semibold text-slate-700">Grupo/Cota</th>
                          <th className="text-left p-3 font-semibold text-slate-700">Parcela</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Vl. Recebido</th>
                          <th className="text-center p-3 font-semibold text-slate-700">% Com.</th>
                          <th className="text-right p-3 font-semibold text-slate-700">Vl. Pago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lote.comissoes.length === 0 ? (
                          <tr><td colSpan={7} className="p-4 text-center text-slate-400">Detalhes não disponíveis</td></tr>
                        ) : lote.comissoes.map(c => (
                          <tr key={c.id} className="border-b hover:bg-slate-50">
                            <td className="p-3">{c.cliente_nome || '-'}</td>
                            <td className="p-3">{c.administradora_nome || '-'}</td>
                            <td className="p-3">{c.grupo && c.cota ? `${c.grupo}/${c.cota}` : c.contrato || '-'}</td>
                            <td className="p-3">{c.parcela_numero ? `${c.parcela_numero}º` : '-'}</td>
                            <td className="p-3 text-right font-semibold text-green-600">{fmt(c.valor_recebido)}</td>
                            <td className="p-3 text-center">{c.percentual_comissao || 0}%</td>
                            <td className="p-3 text-right font-bold text-blue-600">{fmt(c.valor_a_pagar)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t">
                        <tr>
                          <td colSpan={6} className="p-3 text-right font-bold text-slate-700">Total:</td>
                          <td className="p-3 text-right font-bold text-blue-700">{fmt(totalLote)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}

          {/* Comissões sem protocolo (pagas manualmente ou migradas) */}
          {semLote.length > 0 && (
            <Card className="overflow-hidden shadow-sm border-dashed border-2 border-slate-300">
              <div className="bg-slate-500 text-white p-4 flex items-center gap-3 cursor-pointer select-none"
                onClick={() => toggleLote('sem-lote')}>
                <div className="flex-1">
                  <h3 className="font-bold">Comissões sem protocolo</h3>
                  <p className="text-xs text-white/70 mt-0.5">{semLote.length} item(s) • {fmt(semLote.reduce((a, c) => a + (c.valor_a_pagar || 0), 0))}</p>
                </div>
                {expandedLotes['sem-lote'] ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </div>
              {expandedLotes['sem-lote'] && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="text-left p-3 font-semibold text-slate-700">Vendedor</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Cliente</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Grupo/Cota</th>
                        <th className="text-left p-3 font-semibold text-slate-700">Data Pgto</th>
                        <th className="text-right p-3 font-semibold text-slate-700">Vl. Pago</th>
                      </tr>
                    </thead>
                    <tbody>
                      {semLote.map(c => (
                        <tr key={c.id} className="border-b hover:bg-slate-50">
                          <td className="p-3">{c.vendedor_nome || '-'}</td>
                          <td className="p-3">{c.cliente_nome || '-'}</td>
                          <td className="p-3">{c.grupo && c.cota ? `${c.grupo}/${c.cota}` : c.contrato || '-'}</td>
                          <td className="p-3">{formatDateBR(c.data_pagamento)}</td>
                          <td className="p-3 text-right font-bold text-blue-600">{fmt(c.valor_a_pagar)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}