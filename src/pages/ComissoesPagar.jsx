import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search, Receipt, ChevronDown, ChevronUp, User,
  FileText, Loader2, CheckCircle2, Clock, BarChart2, Eye
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import moment from 'moment';
import 'moment/locale/pt-br';
import { formatDateBR } from '@/components/utils/dateHelpers';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import VendedorExpandido from '@/components/comissoes/VendedorExpandido';

moment.locale('pt-br');

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ComissoesPagar() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('a_pagar');
  const [mesFilter, setMesFilter] = useState('todos');
  const [expandedVendedores, setExpandedVendedores] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingError, setEditingError] = useState('');

  // Modal de pagamento
  const [pagarModal, setPagarModal] = useState(false);
  const [vendedorModal, setVendedorModal] = useState(null);
  const [modalSearch, setModalSearch] = useState('');
  const [modalSelecionados, setModalSelecionados] = useState(new Set());
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const [observacao, setObservacao] = useState('');
  const [isPaying, setIsPaying] = useState(false);

  // Modal detalhes do recebimento
  const [verRecebimentoModal, setVerRecebimentoModal] = useState(false);
  const [recebimentoDetalhes, setRecebimentoDetalhes] = useState(null);

  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    if (me.role === 'super_admin') {
      setUser({ ...me, perfil: 'super_admin', empresa_id: null });
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) {
        const colab = colabs[0];
        setUser({ ...me, perfil: colab.perfil, empresa_id: colab.empresa_id, colaborador_id: colab.id });
      }
    }
  };

  const sincronizarComissoes = async () => {
    const recebimentos = await base44.entities.RecebimentoComissao.filter({});
    const comissoesExistentes = await base44.entities.ComissaoAPagar.filter({});
    const processados = new Set(comissoesExistentes.map(c => c.recebimento_id));
    const novos = recebimentos.filter(r => !processados.has(r.id));
    for (const rec of novos) {
      const valorAPagar = rec.valor_recebido * (rec.percentual_comissao || 100) / 100;
      await base44.entities.ComissaoAPagar.create({
        empresa_id: rec.empresa_id,
        recebimento_id: rec.id,
        venda_id: rec.venda_id,
        cliente_id: rec.cliente_id,
        cliente_nome: rec.cliente_nome,
        vendedor_id: rec.vendedor_id,
        vendedor_nome: rec.vendedor_nome,
        administradora_id: rec.administradora_id,
        administradora_nome: rec.administradora_nome,
        grupo: rec.grupo,
        cota: rec.cota,
        contrato: rec.contrato,
        parcela_numero: rec.parcela_informada,
        data_recebimento: rec.data_recebimento,
        valor_recebido: rec.valor_recebido,
        percentual_comissao: rec.percentual_comissao || 100,
        valor_a_pagar: valorAPagar,
        status_pagamento: rec.status_pagamento || 'a_pagar',
      });
    }
  };

  const { data: comissoes = [], isLoading } = useQuery({
    queryKey: ['comissoes-a-pagar'],
    queryFn: async () => {
      await sincronizarComissoes();
      return await base44.entities.ComissaoAPagar.filter({});
    },
    enabled: !!user,
  });

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(user?.perfil);

  const STATUS_A_PAGAR = ['a_pagar', 'a_apagar', 'pendente'];

  const filtered = comissoes.filter((c) => {
    if (user?.perfil === 'vendedor' && c.vendedor_id !== user?.id) return false;
    if (user?.empresa_id && c.empresa_id !== user?.empresa_id) return false;
    if (statusFilter === 'a_pagar' && !STATUS_A_PAGAR.includes(c.status_pagamento)) return false;
    if (statusFilter === 'paga' && c.status_pagamento !== 'paga') return false;
    if (mesFilter !== 'todos' && c.data_recebimento) {
      const mes = moment(c.data_recebimento, 'YYYY-MM-DD', true).format('YYYY-MM');
      if (mes !== mesFilter) return false;
    }
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      return (
        c.cliente_nome?.toLowerCase().includes(t) ||
        c.vendedor_nome?.toLowerCase().includes(t) ||
        c.grupo?.toLowerCase().includes(t) ||
        c.cota?.toLowerCase().includes(t)
      );
    }
    return true;
  });

  const groupedByVendedor = filtered.reduce((acc, c) => {
    const key = c.vendedor_id || 'sem-vendedor';
    if (!acc[key]) acc[key] = { vendedor_id: c.vendedor_id, vendedor_nome: c.vendedor_nome || 'Sem vendedor', comissoes: [] };
    acc[key].comissoes.push(c);
    return acc;
  }, {});
  const vendedoresComComissoes = Object.values(groupedByVendedor);

  const mesesDisponiveis = [...new Set(comissoes.map(c =>
    c.data_recebimento ? moment(c.data_recebimento, 'YYYY-MM-DD', true).format('YYYY-MM') : null
  ).filter(Boolean))].sort().reverse();

  const mesAtual = moment().format('YYYY-MM');
  const totalComissoes = comissoes.reduce((a, c) => a + (c.valor_a_pagar || 0), 0);
  const pagasEsseMes = comissoes.filter(c => c.status_pagamento === 'paga' && c.data_pagamento?.startsWith(mesAtual))
    .reduce((a, c) => a + (c.valor_a_pagar || 0), 0);
  const pendentes = comissoes.filter(c => STATUS_A_PAGAR.includes(c.status_pagamento))
    .reduce((a, c) => a + (c.valor_a_pagar || 0), 0);

  const startEditing = (comissao) => { setEditingId(comissao.id); setEditingValue(String(comissao.percentual_comissao || 0)); setEditingError(''); };
  const cancelEditing = () => { setEditingId(null); setEditingValue(''); setEditingError(''); };
  const saveEditing = async (comissaoId) => {
    const percentual = parseFloat(editingValue);
    if (isNaN(percentual) || percentual < 0 || percentual > 100) { setEditingError('0–100'); return; }
    const comissao = comissoes.find(c => c.id === comissaoId);
    await base44.entities.ComissaoAPagar.update(comissaoId, {
      percentual_comissao: percentual,
      valor_a_pagar: (comissao.valor_recebido * percentual) / 100,
    });
    queryClient.invalidateQueries(['comissoes-a-pagar']);
    toast.success('Percentual atualizado!');
    cancelEditing();
  };

  const abrirModalPagamento = (vendedor, e) => {
    if (e) e.stopPropagation();
    setVendedorModal(vendedor);
    const aPagar = vendedor.comissoes.filter(c => STATUS_A_PAGAR.includes(c.status_pagamento));
    setModalSelecionados(new Set(aPagar.map(c => c.id)));
    setModalSearch('');
    setFormaPagamento('PIX');
    setObservacao('');
    setPagarModal(true);
  };

  const gerarPDF = (comissoesLista, vendedorInfo, dataPagamento, formaPagto, loteCode) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const totalPago = comissoesLista.reduce((acc, c) => acc + (c.valor_a_pagar || 0), 0);
    const totalRecebido = comissoesLista.reduce((acc, c) => acc + (c.valor_recebido || 0), 0);

    doc.setFillColor(16, 53, 60);
    doc.rect(0, 0, 297, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('COMPROVANTE DE PAGAMENTO DE COMISSÃO', 148, 10, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Lote: ${loteCode}  |  Gerado em: ${moment().format('DD/MM/YYYY HH:mm')}`, 148, 17, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(10, 26, 277, 28, 2, 2, 'F');
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Vendedor:', 14, 33); doc.text('Data Pagamento:', 90, 33);
    doc.text('Forma Pagamento:', 160, 33); doc.text('Qtd. Itens:', 230, 33);
    doc.setFont('helvetica', 'normal');
    doc.text(vendedorInfo?.vendedor_nome || '-', 14, 39);
    doc.text(moment(dataPagamento, 'YYYY-MM-DD').format('DD/MM/YYYY'), 90, 39);
    doc.text(formaPagto || '-', 160, 39);
    doc.text(String(comissoesLista.length), 230, 39);
    if (observacao) {
      doc.setFont('helvetica', 'bold'); doc.text('Observação:', 14, 46);
      doc.setFont('helvetica', 'normal'); doc.text(observacao, 45, 46);
    }
    doc.setFont('helvetica', 'bold');
    doc.text('Total Recebido (Adm):', 14, 54); doc.text('Total Pago ao Vendedor:', 120, 48);
    doc.setTextColor(0, 120, 80); doc.text(fmt(totalRecebido), 70, 54);
    doc.setTextColor(0, 80, 180); doc.text(fmt(totalPago), 200, 54);
    doc.setTextColor(0, 0, 0);

    doc.autoTable({
      startY: 64,
      head: [['Cliente', 'Grupo/Cota', 'Parcela', 'Data Rec.', 'Vl. Recebido', '% Com.', 'Vl. a Pagar', 'Administradora']],
      body: comissoesLista.map(c => [
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
    doc.text(`Gerado por ${user?.full_name || 'Sistema'} em ${moment().format('DD/MM/YYYY HH:mm')}`, 148, ph - 5, { align: 'center' });
    doc.save(`comissao_${vendedorInfo?.vendedor_nome?.replace(/\s+/g, '_') || 'vendedor'}_${moment(dataPagamento).format('YYYYMMDD')}.pdf`);
  };

  const handleConfirmarPagamento = async () => {
    if (modalSelecionados.size === 0 || !vendedorModal) return;
    setIsPaying(true);
    try {
      const ids = Array.from(modalSelecionados);
      const paraPagar = comissoes.filter(c => ids.includes(c.id) && STATUS_A_PAGAR.includes(c.status_pagamento));
      if (paraPagar.length === 0) { toast.error('Nenhuma comissão válida'); return; }

      const dataPagamento = moment().format('YYYY-MM-DD');
      for (const c of paraPagar) {
        await base44.entities.ComissaoAPagar.update(c.id, {
          status_pagamento: 'paga', data_pagamento: dataPagamento, forma_pagamento: formaPagamento, observacao,
        });
      }

      const lotes = await base44.entities.PagamentoComissaoLote.filter({ empresa_id: user.empresa_id });
      const loteCode = `EMPAY${String(lotes.length + 1).padStart(4, '0')}`;
      const totalPago = paraPagar.reduce((acc, c) => acc + (c.valor_a_pagar || 0), 0);

      await base44.entities.PagamentoComissaoLote.create({
        empresa_id: user.empresa_id, lote_code: loteCode,
        vendedor_id: vendedorModal.vendedor_id, vendedor_nome: vendedorModal.vendedor_nome,
        data_pagamento: dataPagamento, forma_pagamento: formaPagamento,
        total_itens: paraPagar.length, total_pago: totalPago, observacao,
        gerado_por_id: user.colaborador_id, gerado_por_nome: user.full_name,
        comissoes_ids: JSON.stringify(paraPagar.map(c => c.id)), email_enviado: false,
      });

      gerarPDF(paraPagar, vendedorModal, dataPagamento, formaPagamento, loteCode);
      queryClient.invalidateQueries(['comissoes-a-pagar']);
      toast.success(`✅ ${paraPagar.length} comissão(ões) paga(s)! PDF gerado.`);
      setPagarModal(false);
      setModalSelecionados(new Set());
      setVendedorModal(null);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao processar pagamento');
    } finally {
      setIsPaying(false);
    }
  };

  const comissoesModal = vendedorModal
    ? vendedorModal.comissoes.filter(c => {
        if (!modalSearch) return true;
        const t = modalSearch.toLowerCase();
        return c.cliente_nome?.toLowerCase().includes(t) || c.grupo?.toLowerCase().includes(t) || c.cota?.toLowerCase().includes(t);
      })
    : [];

  const totalModalSelecionado = Array.from(modalSelecionados)
    .map(id => comissoes.find(c => c.id === id))
    .filter(Boolean)
    .reduce((acc, c) => acc + (c.valor_a_pagar || 0), 0);

  const aPagarModal = comissoesModal.filter(c => STATUS_A_PAGAR.includes(c.status_pagamento));
  const todosSelecionadosModal = aPagarModal.length > 0 && aPagarModal.every(c => modalSelecionados.has(c.id));

  const toggleModalItem = (id) => {
    const s = new Set(modalSelecionados);
    s.has(id) ? s.delete(id) : s.add(id);
    setModalSelecionados(s);
  };
  const toggleModalTodos = () => {
    if (todosSelecionadosModal) {
      const s = new Set(modalSelecionados);
      aPagarModal.forEach(c => s.delete(c.id));
      setModalSelecionados(s);
    } else {
      const s = new Set(modalSelecionados);
      aPagarModal.forEach(c => s.add(c.id));
      setModalSelecionados(s);
    }
  };

  if (!user) return <div className="p-6 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Comissões a Pagar</h1>
        <p className="text-slate-500 text-sm mt-1">Gerencie pagamentos de forma rápida, clara e organizada.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-2xl">💸</div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Total de Comissões</p>
            <p className="text-xl font-bold text-slate-800">{fmt(totalComissoes)}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Pagas este mês</p>
            <p className="text-xl font-bold text-green-700">{fmt(pagasEsseMes)}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
            <Clock className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Pendentes</p>
            <p className="text-xl font-bold text-orange-600">{fmt(pendentes)}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
            <BarChart2 className="w-6 h-6 text-slate-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 font-medium">Comissões por Vendedor</p>
            <Select value={mesFilter} onValueChange={setMesFilter}>
              <SelectTrigger className="mt-1 h-8 text-sm border-0 p-0 shadow-none focus:ring-0 font-semibold text-slate-700 w-36">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meses</SelectItem>
                {mesesDisponiveis.map(mes => (
                  <SelectItem key={mes} value={mes}>{moment(mes).format('MMMM YYYY')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por vendedor, cliente, grupo ou cota..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="a_pagar">A Pagar</SelectItem>
            <SelectItem value="paga">Paga</SelectItem>
          </SelectContent>
        </Select>
        <Select value={mesFilter} onValueChange={setMesFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Mês / Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os meses</SelectItem>
            {mesesDisponiveis.map(mes => (
              <SelectItem key={mes} value={mes}>{moment(mes).format('MMMM [de] YYYY')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista de vendedores */}
      {isLoading ? (
        <Card className="p-8 text-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Carregando...
        </Card>
      ) : vendedoresComComissoes.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">Nenhuma comissão encontrada</Card>
      ) : (
        <div className="space-y-4">
          {vendedoresComComissoes.map((vendedor) => {
            const qtdAPagar = vendedor.comissoes.filter(c => STATUS_A_PAGAR.includes(c.status_pagamento)).length;
            const ultimoRec = vendedor.comissoes.map(c => c.data_recebimento).filter(Boolean).sort().reverse()[0];
            const isExpanded = expandedVendedores[vendedor.vendedor_id];

            return (
              <Card key={vendedor.vendedor_id} className="overflow-hidden shadow-sm">
                <div
                  className="bg-gradient-to-r from-[#10353C] to-[#1a5060] text-white p-4 flex items-center gap-4 cursor-pointer select-none"
                  onClick={() => setExpandedVendedores(prev => ({ ...prev, [vendedor.vendedor_id]: !prev[vendedor.vendedor_id] }))}
                >
                  <div className="w-11 h-11 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                    {vendedor.vendedor_nome?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base uppercase tracking-wide truncate">{vendedor.vendedor_nome}</h3>
                    <div className="flex items-center gap-3 text-xs text-white/70 mt-0.5">
                      <span>{qtdAPagar} comissão(ões) pendente(s)</span>
                      {ultimoRec && (<><span>•</span><span>Último recebimento: {formatDateBR(ultimoRec)}</span></>)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {qtdAPagar > 0 && (
                     <Button size="sm" className="bg-[#23BE84] hover:bg-[#1da872] text-white border-0"
                       onClick={(e) => { e.stopPropagation(); abrirModalPagamento(vendedor, e); }}>
                       <CheckCircle2 className="w-4 h-4 mr-1" />Pagar Comissão
                     </Button>
                    )}
                  </div>
                  <div className="text-white/50 ml-1">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>

                {isExpanded && <VendedorExpandido
                  vendedor={vendedor}
                  expandedVendedores={expandedVendedores}
                  setExpandedVendedores={setExpandedVendedores}
                  editingId={editingId}
                  editingValue={editingValue}
                  setEditingValue={setEditingValue}
                  isAdmin={isAdmin}
                  startEditing={startEditing}
                  saveEditing={saveEditing}
                  cancelEditing={cancelEditing}
                  setVendedorModal={setVendedorModal}
                  setModalSelecionados={setModalSelecionados}
                  setModalSearch={setModalSearch}
                  setFormaPagamento={setFormaPagamento}
                  setObservacao={setObservacao}
                  setPagarModal={setPagarModal}
                  fmt={fmt}
                  formatDateBR={formatDateBR}
                />}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal Selecionar Contratos a Pagar */}
      <Dialog open={pagarModal} onOpenChange={setPagarModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg">Selecionar Contratos a Pagar</DialogTitle>
            <p className="text-sm text-slate-500">Selecione as comissões que deseja pagar agora.</p>
          </DialogHeader>

          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar vendedor, grupo ou cota..." value={modalSearch}
              onChange={e => setModalSearch(e.target.value)} className="pl-9" />
          </div>

          <div className="overflow-y-auto flex-1 border rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b">
                <tr className="text-slate-600">
                  <th className="p-3 w-10">
                    <Checkbox checked={todosSelecionadosModal} onCheckedChange={toggleModalTodos} />
                  </th>
                  <th className="p-3 text-left font-semibold">Cliente</th>
                  <th className="p-3 text-left font-semibold">Grupo/Cota</th>
                  <th className="p-3 text-left font-semibold">Parcela</th>
                  <th className="p-3 text-left font-semibold">Administradora</th>
                  <th className="p-3 text-right font-semibold">A Pagar</th>
                </tr>
              </thead>
              <tbody>
                {comissoesModal.map(c => {
                  const isPagar = c.status_pagamento === 'a_pagar';
                  const isSel = modalSelecionados.has(c.id);
                  return (
                    <tr key={c.id} className={`border-b transition-colors ${isSel ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <td className="p-3">
                        {isPagar ? (
                          <Checkbox checked={isSel} onCheckedChange={() => toggleModalItem(c.id)} />
                        ) : <div className="w-4" />}
                      </td>
                      <td className="p-3 font-medium">{c.cliente_nome || '-'}</td>
                      <td className="p-3 text-slate-600">{c.grupo && c.cota ? `${c.grupo}/${c.cota}` : c.contrato || '-'}</td>
                      <td className="p-3 text-slate-600">{c.parcela_numero ? `${c.parcela_numero}º` : '-'}</td>
                      <td className="p-3 text-slate-600">{c.administradora_nome || '-'}</td>
                      <td className="p-3 text-right">
                        <Badge className={isPagar ? 'bg-orange-100 text-orange-700 font-semibold' : 'bg-green-100 text-green-700 font-semibold'}>
                          {fmt(c.valor_a_pagar)}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
                {comissoesModal.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-slate-400">Nenhum item encontrado</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t pt-3 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Checkbox checked={todosSelecionadosModal} onCheckedChange={toggleModalTodos} />
                <span className="text-slate-600">Selecionar tudo</span>
              </div>
              <span className="text-slate-500 font-medium">✓ Total a pagar</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 text-base">
                Total a pagar: <span className="text-[#10353C]">{fmt(totalModalSelecionado)}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-500">Forma de Pagamento</Label>
                <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="Transferência Bancária">Transferência Bancária</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Observação (opcional)</Label>
                <Input className="mt-1" placeholder="Observação..." value={observacao} onChange={e => setObservacao(e.target.value)} />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPagarModal(false)} disabled={isPaying}>Cancelar</Button>
            <Button disabled={modalSelecionados.size === 0 || isPaying} onClick={handleConfirmarPagamento}
              className="bg-[#10353C] hover:bg-[#1a5060] text-white">
              {isPaying ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processando...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 mr-2" />Pagar {modalSelecionados.size} contrato(s) ({fmt(totalModalSelecionado)})</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Ver Recebimento */}
      <Dialog open={verRecebimentoModal} onOpenChange={setVerRecebimentoModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do Recebimento</DialogTitle>
          </DialogHeader>
          {recebimentoDetalhes && (
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Cliente', recebimentoDetalhes.cliente_nome],
                ['Vendedor', recebimentoDetalhes.vendedor_nome],
                ['Administradora', recebimentoDetalhes.administradora_nome],
                ['Grupo/Cota', `${recebimentoDetalhes.grupo || '-'}/${recebimentoDetalhes.cota || '-'}`],
                ['Data Recebimento', formatDateBR(recebimentoDetalhes.data_recebimento)],
                ['Valor Recebido', fmt(recebimentoDetalhes.valor_recebido)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="font-semibold text-slate-800">{value}</p>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setVerRecebimentoModal(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}