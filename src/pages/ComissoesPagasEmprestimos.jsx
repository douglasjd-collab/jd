import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, ChevronDown, ChevronUp, FileText, Loader2 } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/pt-br';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

moment.locale('pt-br');

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const getValPago = (p) => p.valor_comissao_vendedor_pago || 0;
const getPercVendedor = (p) => {
  if (p.percentual_comissao_vendedor) return p.percentual_comissao_vendedor;
  if (p.valor_comissao_vendedor_pago && p.valor_credito) return (p.valor_comissao_vendedor_pago / p.valor_credito) * 100;
  if (p.valor_comissao && p.valor_credito) return (p.valor_comissao / p.valor_credito) * 100;
  return 0;
};

export default function ComissoesPagasEmprestimos() {
  const [user, setUser] = useState(null);
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [filtroMes, setFiltroMes] = useState('todos');
  const [expandedGrupos, setExpandedGrupos] = useState({});

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

  const { data: propostas = [], isLoading } = useQuery({
    queryKey: ['propostas-emp-pagas-comissao', user?.empresa_id],
    queryFn: () => {
      const filter = { produto: 'emprestimo', comissao_vendedor_paga: true };
      if (user?.empresa_id) filter.empresa_id = user.empresa_id;
      return base44.entities.Proposta.filter(filter, '-comissao_vendedor_data_pagamento', 1000);
    },
    enabled: !!user,
  });

  // Filtrar
  const filtradas = propostas.filter(p => {
    if (filtroVendedor && !p.vendedor_nome?.toLowerCase().includes(filtroVendedor.toLowerCase())) return false;
    if (filtroMes !== 'todos' && p.comissao_vendedor_data_pagamento) {
      if (moment(p.comissao_vendedor_data_pagamento).format('YYYY-MM') !== filtroMes) return false;
    }
    return true;
  });

  // Agrupar por vendedor + data pagamento
  const grupos = {};
  filtradas.forEach(p => {
    const key = `${p.vendedor_id || 'sv'}_${p.comissao_vendedor_data_pagamento || 'sem-data'}`;
    if (!grupos[key]) {
      grupos[key] = {
        key,
        vendedor_id: p.vendedor_id,
        vendedor_nome: p.vendedor_nome || 'Sem Vendedor',
        data_pagamento: p.comissao_vendedor_data_pagamento,
        forma_pagamento: p.comissao_vendedor_forma_pagamento,
        propostas: [],
      };
    }
    grupos[key].propostas.push(p);
  });

  const gruposList = Object.values(grupos).sort((a, b) => {
    if (!a.data_pagamento) return 1;
    if (!b.data_pagamento) return -1;
    return b.data_pagamento.localeCompare(a.data_pagamento);
  });

  const mesesDisponiveis = [...new Set(propostas
    .filter(p => p.comissao_vendedor_data_pagamento)
    .map(p => moment(p.comissao_vendedor_data_pagamento).format('YYYY-MM'))
  )].sort().reverse();

  const totalGeral = filtradas.reduce((acc, p) => acc + getValPago(p), 0);

  const toggleGrupo = (key) => setExpandedGrupos(prev => ({ ...prev, [key]: !prev[key] }));

  const gerarPDF = (grupo) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const totalPago = grupo.propostas.reduce((acc, p) => acc + getValPago(p), 0);

    doc.setFillColor(16, 53, 60);
    doc.rect(0, 0, 297, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('COMPROVANTE DE PAGAMENTO DE COMISSÃO — EMPRÉSTIMOS', 148, 10, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Gerado em: ${moment().format('DD/MM/YYYY HH:mm')}`, 148, 17, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(10, 26, 277, 22, 2, 2, 'F');
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Vendedor:', 14, 33); doc.text('Data Pagamento:', 90, 33);
    doc.text('Forma Pagamento:', 160, 33); doc.text('Qtd. Itens:', 230, 33);
    doc.setFont('helvetica', 'normal');
    doc.text(grupo.vendedor_nome, 14, 39);
    doc.text(grupo.data_pagamento ? moment(grupo.data_pagamento).format('DD/MM/YYYY') : '-', 90, 39);
    doc.text(grupo.forma_pagamento || '-', 160, 39);
    doc.text(String(grupo.propostas.length), 230, 39);

    doc.autoTable({
      startY: 54,
      head: [['Cliente', 'Contrato', 'Banco', 'Data Lib.', 'Vl. Crédito', '% Vendedor', 'Vl. Pago']],
      body: grupo.propostas.map(p => {
        const perc = p.percentual_comissao_vendedor || 0;
        const valPago = p.valor_comissao_vendedor_pago || (p.valor_credito || 0) * (perc / 100);
        return [
          p.cliente_nome || '-',
          p.contrato || '-',
          p.administradora_nome || '-',
          p.emprestimo_data_liberacao ? moment(p.emprestimo_data_liberacao).format('DD/MM/YYYY') : '-',
          fmt(p.valor_credito),
          `${perc.toFixed(2)}%`,
          fmt(valPago),
        ];
      }),
      foot: [['', '', '', '', '', 'Total:', fmt(totalPago)]],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [16, 53, 60], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [230, 240, 255], fontStyle: 'bold', textColor: [0, 0, 0] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', textColor: [0, 80, 180] } },
    });

    const ph = doc.internal.pageSize.height;
    doc.setFontSize(7); doc.setTextColor(0, 0, 255);
    doc.text(`Gerado em ${moment().format('DD/MM/YYYY HH:mm')}`, 148, ph - 5, { align: 'center' });
    doc.save(`comissao_emp_${(grupo.vendedor_nome || 'vendedor').replace(/\s+/g, '_')}_${moment(grupo.data_pagamento || undefined).format('YYYYMMDD')}.pdf`);
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
            <p className="text-xs text-slate-500 mt-1">{gruposList.length} pagamento(s) • {filtradas.length} proposta(s)</p>
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

      {/* Lista agrupada */}
      {isLoading ? (
        <Card className="p-8 text-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Carregando...
        </Card>
      ) : gruposList.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">Nenhuma comissão paga encontrada</Card>
      ) : (
        <div className="space-y-4">
          {gruposList.map(grupo => {
            const totalGrupo = grupo.propostas.reduce((acc, p) => acc + getValPago(p), 0);
            const isExp = expandedGrupos[grupo.key];

            return (
              <Card key={grupo.key} className="overflow-hidden shadow-sm">
                <div
                  className="bg-gradient-to-r from-[#10353C] to-[#1a5060] text-white p-4 flex items-center gap-4 cursor-pointer select-none"
                  onClick={() => toggleGrupo(grupo.key)}
                >
                  <div className="w-11 h-11 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                    {grupo.vendedor_nome?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base uppercase tracking-wide truncate">{grupo.vendedor_nome}</h3>
                    <div className="flex items-center gap-3 text-xs text-white/70 mt-0.5 flex-wrap">
                      <span>Pago em: {grupo.data_pagamento ? moment(grupo.data_pagamento).format('DD/MM/YYYY') : '-'}</span>
                      <span>•</span>
                      <span>{grupo.propostas.length} proposta(s)</span>
                      <span>•</span>
                      <span className="font-semibold text-white">{fmt(totalGrupo)}</span>
                      {grupo.forma_pagamento && <><span>•</span><span>{grupo.forma_pagamento}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white border-0"
                      onClick={() => gerarPDF(grupo)}>
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
                        <tr className="text-slate-600">
                          <th className="p-3 text-left font-semibold">Cliente</th>
                          <th className="p-3 text-left font-semibold">Contrato</th>
                          <th className="p-3 text-left font-semibold">Banco</th>
                          <th className="p-3 text-left font-semibold">Data Lib.</th>
                          <th className="p-3 text-right font-semibold">Vl. Crédito</th>
                          <th className="p-3 text-right font-semibold">% Vendedor</th>
                          <th className="p-3 text-right font-semibold">Vl. Pago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupo.propostas.map(p => {
                          const perc = p.percentual_comissao_vendedor || 0;
                          const valPago = p.valor_comissao_vendedor_pago || (p.valor_credito || 0) * (perc / 100);
                          return (
                            <tr key={p.id} className="border-b hover:bg-slate-50">
                              <td className="p-3 font-medium text-slate-900">{p.cliente_nome || '-'}</td>
                              <td className="p-3 text-slate-600">{p.contrato || '-'}</td>
                              <td className="p-3 text-slate-600">{p.administradora_nome || '-'}</td>
                              <td className="p-3 text-slate-500 text-xs">
                                {p.emprestimo_data_liberacao ? moment(p.emprestimo_data_liberacao).format('DD/MM/YYYY') : '-'}
                              </td>
                              <td className="p-3 text-right font-medium">{fmt(p.valor_credito)}</td>
                              <td className="p-3 text-right text-slate-600">{perc.toFixed(2)}%</td>
                              <td className="p-3 text-right font-bold text-blue-700">{fmt(valPago)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t">
                        <tr>
                          <td colSpan={6} className="p-3 text-right font-bold text-slate-700">Total:</td>
                          <td className="p-3 text-right font-bold text-blue-700">{fmt(totalGrupo)}</td>
                        </tr>
                      </tfoot>
                    </table>
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