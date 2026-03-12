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
  Search, Loader2, CheckCircle2, Clock, BarChart2,
  ChevronDown, ChevronUp, DollarSign, AlertCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import moment from 'moment';
import 'moment/locale/pt-br';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { createPageUrl } from '@/utils';

moment.locale('pt-br');

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const parseMes = (d) => {
  if (!d) return null;
  let m = moment(d, 'YYYY-MM-DD', true);
  if (m.isValid()) return m.format('YYYY-MM');
  m = moment(d, 'DD/MM/YYYY', true);
  if (m.isValid()) return m.format('YYYY-MM');
  return null;
};
const normStr = s => String(s || '').toLowerCase().trim();

const STATUS_A_PAGAR = ['a_pagar', 'pendente'];

const TIPO_EMPRESTIMO_LABEL = {
  'NOVO': 'Novo',
  'novo': 'Novo',
  'REFINANCIAMENTO': 'Refin',
  'refinanciamento': 'Refin',
  'PORTABILIDADE': 'Portabilidade',
  'portabilidade': 'Portabilidade',
  'CARTAO_CONSIGNADO': 'Cartão',
  'cartao_consignado': 'Cartão',
};
const getTipoLabel = (tipo) => TIPO_EMPRESTIMO_LABEL[tipo] || tipo || '-';

export default function ComissoesEmprestimos() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('a_pagar');
  const [mesFilter, setMesFilter] = useState('todos');
  const [comissaoBancoFilter, setComissaoBancoFilter] = useState('todos');
  const [expandedVendedores, setExpandedVendedores] = useState({});

  // Modal de pagamento
  const [pagarModal, setPagarModal] = useState(false);
  const [vendedorModal, setVendedorModal] = useState(null);
  const [modalSearch, setModalSearch] = useState('');
  const [modalSelecionados, setModalSelecionados] = useState(new Set());
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const [observacao, setObservacao] = useState('');
  const [isPaying, setIsPaying] = useState(false);

  // Modal marcar comissão do banco
  const [marcarBancoModal, setMarcarBancoModal] = useState(false);
  const [propostaMarcar, setPropostaMarcar] = useState(null);
  const [isMarkingBanco, setIsMarkingBanco] = useState(false);

  // Percentuais personalizados por proposta (sobreescrevem o valor_comissao)
  // key: proposta.id, value: percentual (número)
  const [percentuaisCustom, setPercentuaisCustom] = useState({});

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

  const { data: statusPropostaList = [] } = useQuery({
    queryKey: ['status-propostas-emp-com'],
    queryFn: () => base44.entities.StatusProposta.filter({ ativo: true }),
    enabled: !!user,
  });

  const statusPagoIds = statusPropostaList
    .filter(s => s.funcao_fluxo === 'finalizado' || ['pago', 'paga'].includes(normStr(s.nome)))
    .map(s => s.id);

  const isPaga = (p) =>
    (p.status_id && statusPagoIds.includes(p.status_id)) ||
    ['pago', 'paga'].includes(normStr(p.status));

  const { data: propostas = [], isLoading } = useQuery({
    queryKey: ['propostas-emp-comissoes', user?.empresa_id],
    queryFn: async () => {
      const filtro = { produto: 'emprestimo' };
      if (user?.empresa_id) filtro.empresa_id = user.empresa_id;
      return await base44.entities.Proposta.filter(filtro, '-data_venda', 2000);
    },
    enabled: !!user && statusPagoIds.length > 0,
  });

  // Apenas propostas pagas geram comissão
  const propostasPagas = propostas.filter(isPaga);

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(user?.perfil);

  // Filtros
  const filtered = propostasPagas.filter((p) => {
    if (user?.perfil === 'vendedor' && p.vendedor_id !== user?.colaborador_id) return false;

    // Filtro: comissão recebida do banco
    if (comissaoBancoFilter === 'recebida' && !p.comissao_banco_recebida) return false;
    if (comissaoBancoFilter === 'nao_recebida' && p.comissao_banco_recebida) return false;

    // Filtro: status da comissão ao vendedor
    if (statusFilter === 'a_pagar' && p.comissao_vendedor_paga) return false;
    if (statusFilter === 'paga' && !p.comissao_vendedor_paga) return false;

    // Filtro: mês (usa data_liberacao ou data_venda)
    if (mesFilter !== 'todos') {
      const dataPag = p.emprestimo_data_liberacao || p.data_venda || '';
      if (!dataPag.startsWith(mesFilter)) return false;
    }

    // Busca
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      return (
        p.cliente_nome?.toLowerCase().includes(t) ||
        p.vendedor_nome?.toLowerCase().includes(t) ||
        p.contrato?.toLowerCase().includes(t) ||
        p.administradora_nome?.toLowerCase().includes(t)
      );
    }
    return true;
  });

  const groupedByVendedor = filtered.reduce((acc, p) => {
    const key = p.vendedor_id || 'sem-vendedor';
    if (!acc[key]) acc[key] = { vendedor_id: p.vendedor_id, vendedor_nome: p.vendedor_nome || 'Sem vendedor', propostas: [] };
    acc[key].propostas.push(p);
    return acc;
  }, {});
  const vendedoresLista = Object.values(groupedByVendedor);

  // Meses disponíveis
  const mesesDisponiveis = [...new Set(propostasPagas
    .map(p => parseMes(p.emprestimo_data_liberacao || p.data_venda))
    .filter(Boolean))].sort().reverse();

  // Stats
  const totalValorComissao = propostasPagas.reduce((a, p) => a + (p.valor_comissao || 0), 0);
  const totalRecebidoBanco = propostasPagas.filter(p => p.comissao_banco_recebida).reduce((a, p) => a + (p.valor_comissao || 0), 0);
  const totalPendentePagar = propostasPagas.filter(p => p.comissao_banco_recebida && !p.comissao_vendedor_paga).reduce((a, p) => a + (p.valor_comissao || 0), 0);

  // Percentual da empresa (comissão recebida do banco) = valor_comissao / valor_credito
  const getPercentualEmpresa = (p) => {
    if (p.valor_comissao && p.valor_credito) {
      return parseFloat(((p.valor_comissao / p.valor_credito) * 100).toFixed(4));
    }
    return 0;
  };

  // Percentual do vendedor (editável, padrão = percentual empresa)
  const getPercentualVendedor = (p) => {
    return percentuaisCustom[p.id] !== undefined ? percentuaisCustom[p.id] : getPercentualEmpresa(p);
  };

  // Valor a pagar ao vendedor
  const getValorAPagar = (p) => {
    return (p.valor_credito || 0) * (getPercentualVendedor(p) / 100);
  };
  
  // Alias para compatibilidade
  const getPercentualProposta = getPercentualEmpresa;

  const abrirModalPagamento = (vendedor, e) => {
    if (e) e.stopPropagation();
    setVendedorModal(vendedor);
    // Pré-seleciona apenas as que têm comissão do banco recebida e não foram pagas ao vendedor
    const aPagar = vendedor.propostas.filter(p => p.comissao_banco_recebida && !p.comissao_vendedor_paga);
    setModalSelecionados(new Set(aPagar.map(p => p.id)));
    setModalSearch('');
    setFormaPagamento('PIX');
    setObservacao('');
    setPagarModal(true);
  };

  const handleMarcarBancoRecebido = async (proposta) => {
    setIsMarkingBanco(true);
    try {
      await base44.entities.Proposta.update(proposta.id, { comissao_banco_recebida: !proposta.comissao_banco_recebida });
      queryClient.invalidateQueries(['propostas-emp-comissoes']);
      toast.success(proposta.comissao_banco_recebida ? 'Desmarcado' : 'Comissão do banco marcada como recebida!');
    } catch (err) {
      toast.error('Erro ao atualizar');
    } finally {
      setIsMarkingBanco(false);
      setMarcarBancoModal(false);
      setPropostaMarcar(null);
    }
  };

  const gerarPDF = (propostasLista, vendedorInfo, dataPagamento, formaPagto, loteCode, percMap = {}) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const totalPago = propostasLista.reduce((acc, p) => {
      const perc = percMap[p.id] !== undefined ? percMap[p.id] : getPercentualProposta(p);
      return acc + (p.valor_credito || 0) * (perc / 100);
    }, 0);

    doc.setFillColor(16, 53, 60);
    doc.rect(0, 0, 297, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('COMPROVANTE DE PAGAMENTO DE COMISSÃO — EMPRÉSTIMOS', 148, 10, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Lote: ${loteCode}  |  Gerado em: ${moment().format('DD/MM/YYYY HH:mm')}`, 148, 17, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(10, 26, 277, 22, 2, 2, 'F');
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Vendedor:', 14, 33); doc.text('Data Pagamento:', 90, 33);
    doc.text('Forma Pagamento:', 160, 33); doc.text('Qtd. Itens:', 230, 33);
    doc.setFont('helvetica', 'normal');
    doc.text(vendedorInfo?.vendedor_nome || '-', 14, 39);
    doc.text(moment(dataPagamento, 'YYYY-MM-DD').format('DD/MM/YYYY'), 90, 39);
    doc.text(formaPagto || '-', 160, 39);
    doc.text(String(propostasLista.length), 230, 39);

    doc.autoTable({
      startY: 54,
      head: [['Cliente', 'Contrato', 'Tipo', 'Banco', 'Data Lib.', 'Vl. Crédito', '% Vendedor', 'Vl. a Pagar']],
      body: propostasLista.map(p => {
        const perc = percMap[p.id] !== undefined ? percMap[p.id] : getPercentualVendedor(p);
        const valPagar = (p.valor_credito || 0) * (perc / 100);
        return [
          p.cliente_nome || '-',
          p.contrato || '-',
          getTipoLabel(p.emprestimo_tipo),
          p.administradora_nome || '-',
          p.emprestimo_data_liberacao ? moment(p.emprestimo_data_liberacao).format('DD/MM/YYYY') : '-',
          fmt(p.valor_credito),
          `${perc.toFixed(2)}%`,
          fmt(valPagar),
        ];
      }),
      foot: [['', '', '', '', '', '', 'Total:', fmt(totalPago)]],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [16, 53, 60], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [230, 240, 255], fontStyle: 'bold', textColor: [0, 0, 0] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right', textColor: [0, 80, 180] } },
    });

    const ph = doc.internal.pageSize.height;
    doc.setFontSize(7); doc.setTextColor(0, 0, 255);
    doc.text(`Gerado por ${user?.full_name || 'Sistema'} em ${moment().format('DD/MM/YYYY HH:mm')}`, 148, ph - 5, { align: 'center' });
    doc.save(`comissao_emp_${vendedorInfo?.vendedor_nome?.replace(/\s+/g, '_') || 'vendedor'}_${moment(dataPagamento).format('YYYYMMDD')}.pdf`);
  };

  const handleConfirmarPagamento = async () => {
    if (modalSelecionados.size === 0 || !vendedorModal) return;
    setIsPaying(true);
    try {
      const ids = Array.from(modalSelecionados);
      const paraPagar = propostas.filter(p => ids.includes(p.id) && p.comissao_banco_recebida && !p.comissao_vendedor_paga);
      if (paraPagar.length === 0) { toast.error('Nenhum contrato válido para pagar'); return; }

      const dataPagamento = moment().format('YYYY-MM-DD');
      const loteCode = `EMPC${String(Date.now()).slice(-6)}`;

      // Calcular totais com percentuais congelados agora
      const itensComValores = paraPagar.map(p => {
        const percVendedor = percentuaisCustom[p.id] !== undefined ? percentuaisCustom[p.id] : getPercentualEmpresa(p);
        const percEmpresa = getPercentualEmpresa(p);
        const valVendedor = (p.valor_credito || 0) * (percVendedor / 100);
        const editadoManual = percentuaisCustom[p.id] !== undefined;
        return { p, percVendedor, percEmpresa, valVendedor, editadoManual };
      });

      const valorTotal = itensComValores.reduce((acc, i) => acc + i.valVendedor, 0);

      // 1. Criar lote
      const lote = await base44.entities.LotePagamentoComissaoEmprestimo.create({
        empresa_id: vendedorModal.propostas[0]?.empresa_id || user?.empresa_id,
        vendedor_id: vendedorModal.vendedor_id,
        vendedor_nome: vendedorModal.vendedor_nome,
        data_pagamento: dataPagamento,
        valor_total: valorTotal,
        quantidade_propostas: itensComValores.length,
        forma_pagamento: formaPagamento,
        observacao: observacao || '',
        lote_codigo: loteCode,
      });

      // 2. Criar snapshot dos itens e atualizar propostas
      for (const { p, percVendedor, percEmpresa, valVendedor, editadoManual } of itensComValores) {
        // Snapshot imutável
        await base44.entities.ComissaoEmprestimoPaga.create({
          empresa_id: p.empresa_id,
          lote_pagamento_id: lote.id,
          lote_codigo: loteCode,
          proposta_id: p.id,
          vendedor_id: p.vendedor_id,
          vendedor_nome: p.vendedor_nome,
          cliente_nome: p.cliente_nome,
          contrato: p.contrato,
          banco: p.administradora_nome,
          emprestimo_tipo: p.emprestimo_tipo || null,
          data_liberacao: p.emprestimo_data_liberacao || p.data_venda,
          valor_credito: p.valor_credito || 0,
          percentual_empresa_original: percEmpresa,
          valor_comissao_empresa_original: p.valor_comissao || 0,
          percentual_vendedor_pago: percVendedor,
          valor_vendedor_pago: valVendedor,
          percentual_vendedor_editado_manual: editadoManual,
          data_pagamento: dataPagamento,
          forma_pagamento: formaPagamento,
          observacao: observacao || '',
        });

        // Atualizar proposta com referência do lote + valores congelados
        await base44.entities.Proposta.update(p.id, {
          comissao_vendedor_paga: true,
          comissao_vendedor_data_pagamento: dataPagamento,
          comissao_vendedor_forma_pagamento: formaPagamento,
          percentual_comissao_vendedor: percVendedor,
          valor_comissao_vendedor_pago: valVendedor,
        });
      }

      // PDF usa os valores já calculados (congelados)
      const percMapFinal = {};
      itensComValores.forEach(({ p, percVendedor }) => { percMapFinal[p.id] = percVendedor; });
      gerarPDF(paraPagar, vendedorModal, dataPagamento, formaPagamento, loteCode, percMapFinal);

      queryClient.invalidateQueries(['propostas-emp-comissoes']);
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

  const propostasModal = vendedorModal
    ? vendedorModal.propostas.filter(p => {
        if (!modalSearch) return true;
        const t = modalSearch.toLowerCase();
        return p.cliente_nome?.toLowerCase().includes(t) || p.contrato?.toLowerCase().includes(t);
      })
    : [];

  const totalModalSelecionado = Array.from(modalSelecionados)
    .map(id => propostas.find(p => p.id === id))
    .filter(Boolean)
    .reduce((acc, p) => acc + getValorAPagar(p), 0);

  const aptos = propostasModal.filter(p => p.comissao_banco_recebida && !p.comissao_vendedor_paga);
  const todosSelecionados = aptos.length > 0 && aptos.every(p => modalSelecionados.has(p.id));

  const toggleModalItem = (id) => {
    const s = new Set(modalSelecionados);
    s.has(id) ? s.delete(id) : s.add(id);
    setModalSelecionados(s);
  };
  const toggleTodos = () => {
    if (todosSelecionados) {
      const s = new Set(modalSelecionados);
      aptos.forEach(p => s.delete(p.id));
      setModalSelecionados(s);
    } else {
      const s = new Set(modalSelecionados);
      aptos.forEach(p => s.add(p.id));
      setModalSelecionados(s);
    }
  };

  if (!user) return <div className="p-6 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Comissões a Pagar — Empréstimos</h1>
        <p className="text-slate-500 text-sm mt-1">Gerencie pagamentos de comissões das propostas de empréstimos pagas.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Total Comissões (Propostas Pagas)</p>
            <p className="text-xl font-bold text-slate-800">{fmt(totalValorComissao)}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Comissão Recebida do Banco</p>
            <p className="text-xl font-bold text-green-700">{fmt(totalRecebidoBanco)}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
            <Clock className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Pendente Pagar Vendedor</p>
            <p className="text-xl font-bold text-orange-600">{fmt(totalPendentePagar)}</p>
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por vendedor, cliente, contrato ou banco..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filtro: Comissão do Banco */}
        <Select value={comissaoBancoFilter} onValueChange={setComissaoBancoFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Comissão do Banco" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os contratos</SelectItem>
            <SelectItem value="recebida">✅ Comissão Recebida do Banco</SelectItem>
            <SelectItem value="nao_recebida">⏳ Comissão NÃO Recebida</SelectItem>
          </SelectContent>
        </Select>

        {/* Filtro: Status comissão vendedor */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status Vendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="a_pagar">A Pagar Vendedor</SelectItem>
            <SelectItem value="paga">Pago ao Vendedor</SelectItem>
          </SelectContent>
        </Select>

        {/* Filtro: Mês */}
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

      {/* Aviso sobre fluxo */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold">Fluxo de Comissões</p>
          <p className="mt-1">1. Marque os contratos como "Comissão recebida do banco" quando o banco te pagar. 2. Em seguida, selecione e pague a comissão ao vendedor.</p>
        </div>
      </div>

      {/* Lista por vendedor */}
      {isLoading ? (
        <Card className="p-8 text-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Carregando...
        </Card>
      ) : vendedoresLista.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">Nenhuma proposta paga encontrada</Card>
      ) : (
        <div className="space-y-4">
          {vendedoresLista.map((vendedor) => {
            const qtdAPagar = vendedor.propostas.filter(p => p.comissao_banco_recebida && !p.comissao_vendedor_paga).length;
            const isExpanded = expandedVendedores[vendedor.vendedor_id || 'sv'];

            return (
              <Card key={vendedor.vendedor_id || 'sv'} className="overflow-hidden shadow-sm">
                <div
                  className="bg-gradient-to-r from-[#10353C] to-[#1a5060] text-white p-4 flex items-center gap-4 cursor-pointer select-none"
                  onClick={() => setExpandedVendedores(prev => ({ ...prev, [vendedor.vendedor_id || 'sv']: !prev[vendedor.vendedor_id || 'sv'] }))}
                >
                  <div className="w-11 h-11 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                    {vendedor.vendedor_nome?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base uppercase tracking-wide truncate">{vendedor.vendedor_nome}</h3>
                    <div className="flex items-center gap-3 text-xs text-white/70 mt-0.5">
                      <span>{vendedor.propostas.length} proposta(s) paga(s)</span>
                      <span>•</span>
                      <span>{qtdAPagar} com comissão do banco pronta p/ pagar</span>
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

                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b">
                        <tr className="text-slate-600">
                          <th className="p-3 text-left font-semibold">Cliente</th>
                          <th className="p-3 text-left font-semibold">Contrato</th>
                          <th className="p-3 text-left font-semibold">Banco</th>
                          <th className="p-3 text-left font-semibold">Data Lib.</th>
                          <th className="p-3 text-right font-semibold">Vl. Crédito</th>
                          <th className="p-3 text-right font-semibold">Comissão Empresa %</th>
                          <th className="p-3 text-right font-semibold">Vl. Comissão Empresa</th>
                          <th className="p-3 text-right font-semibold">Comissão Vendedor %</th>
                          <th className="p-3 text-right font-semibold">Vl. a Pagar Vendedor</th>
                          <th className="p-3 text-center font-semibold">Rec. Banco</th>
                          <th className="p-3 text-center font-semibold">Pago Vendedor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendedor.propostas.map(p => (
                          <tr key={p.id} className="border-b hover:bg-slate-50 transition-colors">
                            <td className="p-3 font-medium text-slate-900">{p.cliente_nome || '-'}</td>
                            <td className="p-3 text-slate-600">{p.contrato || '-'}</td>
                            <td className="p-3 text-slate-600">{p.administradora_nome || '-'}</td>
                            <td className="p-3 text-slate-500 text-xs">
                              {p.emprestimo_data_liberacao
                                ? moment(p.emprestimo_data_liberacao).format('DD/MM/YYYY')
                                : p.data_venda ? moment(p.data_venda).format('DD/MM/YYYY') : '-'}
                            </td>
                            <td className="p-3 text-right font-medium">{fmt(p.valor_credito)}</td>
                            <td className="p-3 text-right text-slate-500 text-xs font-semibold">
                              {getPercentualEmpresa(p).toFixed(2)}%
                            </td>
                            <td className="p-3 text-right font-semibold text-slate-700">{fmt(p.valor_comissao)}</td>
                            <td className="p-3 text-right">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={percentuaisCustom[p.id] !== undefined ? percentuaisCustom[p.id] : getPercentualEmpresa(p).toFixed(2)}
                                onChange={e => setPercentuaisCustom(prev => ({ ...prev, [p.id]: parseFloat(e.target.value) || 0 }))}
                                className="w-20 h-7 text-xs text-right p-1"
                              />
                            </td>
                            <td className="p-3 text-right font-semibold text-blue-700">{fmt(getValorAPagar(p))}</td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => { setPropostaMarcar(p); setMarcarBancoModal(true); }}
                                className={`px-2 py-1 rounded-full text-xs font-semibold transition-colors ${
                                  p.comissao_banco_recebida
                                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                }`}
                              >
                                {p.comissao_banco_recebida ? '✅ Recebida' : '⏳ Pendente'}
                              </button>
                            </td>
                            <td className="p-3 text-center">
                              {p.comissao_vendedor_paga ? (
                                <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                  ✅ Pago
                                </span>
                              ) : p.comissao_banco_recebida ? (
                                <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                                  Pronto p/ Pagar
                                </span>
                              ) : (
                                <span className="px-2 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                                  Aguardando Banco
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: Marcar Comissão Banco */}
      <Dialog open={marcarBancoModal} onOpenChange={setMarcarBancoModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Comissão do Banco</DialogTitle>
          </DialogHeader>
          {propostaMarcar && (
            <div className="space-y-3 text-sm">
              <p className="text-slate-600">Cliente: <strong>{propostaMarcar.cliente_nome}</strong></p>
              <p className="text-slate-600">Contrato: <strong>{propostaMarcar.contrato || '-'}</strong></p>
              <p className="text-slate-600">Comissão: <strong className="text-blue-700">{fmt(propostaMarcar.valor_comissao)}</strong></p>
              <p className="text-slate-700 mt-2">
                {propostaMarcar.comissao_banco_recebida
                  ? '⚠️ Deseja desmarcar a comissão como recebida do banco?'
                  : '✅ Confirmar que a comissão foi recebida do banco?'}
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMarcarBancoModal(false)} disabled={isMarkingBanco}>Cancelar</Button>
            <Button
              onClick={() => propostaMarcar && handleMarcarBancoRecebido(propostaMarcar)}
              disabled={isMarkingBanco}
              className={propostaMarcar?.comissao_banco_recebida ? 'bg-orange-500 hover:bg-orange-600' : 'bg-[#10353C] hover:bg-[#1a5060]'}
            >
              {isMarkingBanco ? <Loader2 className="w-4 h-4 animate-spin" /> : (propostaMarcar?.comissao_banco_recebida ? 'Desmarcar' : 'Confirmar Recebimento')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Selecionar Contratos a Pagar */}
      <Dialog open={pagarModal} onOpenChange={setPagarModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Pagar Comissão ao Vendedor</DialogTitle>
            <p className="text-sm text-slate-500">Apenas contratos com comissão do banco recebida podem ser pagos.</p>
          </DialogHeader>

          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar cliente ou contrato..." value={modalSearch}
              onChange={e => setModalSearch(e.target.value)} className="pl-9" />
          </div>

          <div className="overflow-y-auto flex-1 border rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b">
                <tr className="text-slate-600">
                  <th className="p-3 w-10">
                    <Checkbox checked={todosSelecionados} onCheckedChange={toggleTodos} />
                  </th>
                  <th className="p-3 text-left font-semibold">Cliente</th>
                  <th className="p-3 text-left font-semibold">Contrato</th>
                  <th className="p-3 text-left font-semibold">Banco</th>
                  <th className="p-3 text-right font-semibold">Vl. Crédito</th>
                  <th className="p-3 text-right font-semibold">% a Pagar</th>
                  <th className="p-3 text-right font-semibold">Vl. a Pagar</th>
                  <th className="p-3 text-center font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {propostasModal.map(p => {
                  const podeSelecionar = p.comissao_banco_recebida && !p.comissao_vendedor_paga;
                  const isSel = modalSelecionados.has(p.id);
                  return (
                    <tr key={p.id} className={`border-b transition-colors ${isSel ? 'bg-blue-50' : 'hover:bg-slate-50'} ${!podeSelecionar ? 'opacity-50' : ''}`}>
                      <td className="p-3">
                        {podeSelecionar ? (
                          <Checkbox checked={isSel} onCheckedChange={() => toggleModalItem(p.id)} />
                        ) : <div className="w-4" />}
                      </td>
                      <td className="p-3 font-medium">{p.cliente_nome || '-'}</td>
                      <td className="p-3 text-slate-600">{p.contrato || '-'}</td>
                      <td className="p-3 text-slate-600">{p.administradora_nome || '-'}</td>
                      <td className="p-3 text-right text-slate-700 font-medium">{fmt(p.valor_credito)}</td>
                      <td className="p-3 text-right">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={percentuaisCustom[p.id] !== undefined ? percentuaisCustom[p.id] : getPercentualProposta(p).toFixed(2)}
                          onChange={e => setPercentuaisCustom(prev => ({ ...prev, [p.id]: parseFloat(e.target.value) || 0 }))}
                          className="w-20 h-7 text-xs text-right p-1"
                        />
                      </td>
                      <td className="p-3 text-right">
                        <Badge className="bg-blue-100 text-blue-700 font-semibold">{fmt(getValorAPagar(p))}</Badge>
                      </td>
                      <td className="p-3 text-center text-xs">
                        {p.comissao_vendedor_paga
                          ? <span className="text-green-600 font-medium">Já pago</span>
                          : p.comissao_banco_recebida
                          ? <span className="text-blue-600 font-medium">Pronto</span>
                          : <span className="text-orange-500">Aguardando banco</span>}
                      </td>
                    </tr>
                  );
                })}
                {propostasModal.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-slate-400">Nenhum item encontrado</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 text-base">
                Total: <span className="text-[#10353C]">{fmt(totalModalSelecionado)}</span>
              </span>
              <span className="text-sm text-slate-500">{modalSelecionados.size} selecionado(s)</span>
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
    </div>
  );
}