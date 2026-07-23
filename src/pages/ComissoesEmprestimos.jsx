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
  ChevronDown, ChevronUp, DollarSign, AlertCircle,
  TrendingUp, TrendingDown, FileText, Download, FileSpreadsheet
} from 'lucide-react';
import PropostaDetalhesModal from '@/components/comissoes/PropostaDetalhesModal';
import { toast } from 'react-hot-toast';
import moment from 'moment';
import 'moment/locale/pt-br';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { createPageUrl } from '@/utils';
import { gerarPdfComprovanteEmprestimo, gerarCodigoAutenticacao } from '@/components/comissoes/pdfComprovanteEmprestimo';
import { mascararChavePix, mascararDocumento } from '@/utils/mascaraPix';

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
  const [acrescimoValor, setAcrescimoValor] = useState('');
  const [acrescimoDescricao, setAcrescimoDescricao] = useState('');
  const [isPaying, setIsPaying] = useState(false);

  // Adiantamentos a descontar no modal de pagamento
  const [adiantamentosVendedor, setAdiantamentosVendedor] = useState([]);
  const [adiantamentosSelecionados, setAdiantamentosSelecionados] = useState(new Set());
  const [dadosBancariosVendedor, setDadosBancariosVendedor] = useState(null);

  // PIX do vendedor (snapshot imutável no comprovante)
  const [pixVendedor, setPixVendedor] = useState(null);
  // Modal de confirmação do pagamento (passo 2 do fluxo PIX)
  const [confirmarModal, setConfirmarModal] = useState(false);
  // Comprovante bancário anexo + identificador da transação PIX
  const [comprovanteFile, setComprovanteFile] = useState(null);
  const [comprovanteTransacaoId, setComprovanteTransacaoId] = useState('');
  // Código único de autenticação gerado na confirmação (UUID curto)
  const [codigoAutenticacao, setCodigoAutenticacao] = useState('');
  // Logo configurada (passada para o gerador do comprovante PDF)
  const [logoUrlComprovante, setLogoUrlComprovante] = useState(null);

  // Modal marcar comissão do banco
  const [marcarBancoModal, setMarcarBancoModal] = useState(false);
  const [propostaMarcar, setPropostaMarcar] = useState(null);
  const [isMarkingBanco, setIsMarkingBanco] = useState(false);
  const [bancoDtRecebimento, setBancoDtRecebimento] = useState('');
  const [bancoValorRecebido, setBancoValorRecebido] = useState('');
  const [bancoPercentualRecebido, setBancoPercentualRecebido] = useState('');
  const [bancoBaseComissao, setBancoBaseComissao] = useState('');

  // Percentuais personalizados por proposta (sobreescrevem o valor_comissao)
  // key: proposta.id, value: percentual (número)
  const [percentuaisCustom, setPercentuaisCustom] = useState({});

  // Modal detalhes proposta (duplo clique)
  const [propostaDetalhes, setPropostaDetalhes] = useState(null);

  // Dashboard financeiro
  const [relatorioAtivo, setRelatorioAtivo] = useState(null);

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

  const isPaga = (p) => {
    if (p.status_id && statusPagoIds.includes(p.status_id)) return true;
    const s = normStr(p.status);
    return ['pago', 'paga', 'operacao finalizada', 'operação finalizada',
            'finalizado', 'finalizada', 'concluido', 'concluída', 'concluida'].some(v => s.includes(v));
  };

  const { data: propostas = [], isLoading } = useQuery({
    queryKey: ['propostas-emp-cons-comissoes', user?.empresa_id],
    queryFn: async () => {
      // Busca TODOS os produtos exceto consórcio e financiamento
      // (emprestimo, consignado, ou qualquer outro valor que não seja consórcio/financiamento)
      const filtroBase = user?.empresa_id ? { empresa_id: user.empresa_id } : {};
      const todas = await base44.entities.Proposta.filter(filtroBase, '-data_venda', 3000);
      const lista = todas.filter(p =>
        p.produto !== 'consorcio' && p.produto !== 'financiamento'
      );
      return lista;
    },
    enabled: !!user && statusPagoIds.length > 0,
  });

  // Propostas que geram comissão: status "pago/finalizado" OU comissão do banco já recebida
  const propostasPagas = propostas.filter(p => isPaga(p) || p.comissao_banco_recebida === true);

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

  // Stats — filtradas pelo mês selecionado para o dashboard
  const propostasMes = mesFilter === 'todos'
    ? propostasPagas
    : propostasPagas.filter(p => {
        const d = p.emprestimo_data_liberacao || p.data_venda || '';
        return d.startsWith(mesFilter);
      });

  const totalRecebidoBanco = propostasMes.filter(p => p.comissao_banco_recebida).reduce((a, p) => a + (p.valor_comissao || 0), 0);
  const totalPagoVendedor = propostasMes.filter(p => p.comissao_vendedor_paga).reduce((a, p) => a + (p.valor_comissao_vendedor_pago || p.valor_comissao || 0), 0);
  const totalProgramado = propostasMes.filter(p => p.comissao_banco_recebida && !p.comissao_vendedor_paga).reduce((a, p) => a + (p.valor_comissao || 0), 0);
  const saldoAPagar = Math.max(0, totalRecebidoBanco - totalPagoVendedor);

  // Indicadores operacionais
  const qtdPropostasPagas = propostasMes.length;
  const qtdComissoesBanco = propostasMes.filter(p => p.comissao_banco_recebida).length;
  const qtdComissoesPagasVendedor = propostasMes.filter(p => p.comissao_vendedor_paga).length;
  const qtdProgramadas = propostasMes.filter(p => p.comissao_banco_recebida && !p.comissao_vendedor_paga).length;

  // Relatório por vendedor (comissões pagas)
  const relPorVendedor = Object.values(
    propostasMes.filter(p => p.comissao_vendedor_paga).reduce((acc, p) => {
      const key = p.vendedor_nome || 'Sem vendedor';
      if (!acc[key]) acc[key] = { nome: key, total: 0 };
      acc[key].total += p.valor_comissao_vendedor_pago || p.valor_comissao || 0;
      return acc;
    }, {})
  ).sort((a, b) => b.total - a.total);

  // Relatório por banco (comissões recebidas)
  const relPorBanco = Object.values(
    propostasMes.filter(p => p.comissao_banco_recebida).reduce((acc, p) => {
      const key = p.administradora_nome || 'Sem banco';
      if (!acc[key]) acc[key] = { nome: key, total: 0 };
      acc[key].total += p.valor_comissao || 0;
      return acc;
    }, {})
  ).sort((a, b) => b.total - a.total);

  // Relatório programadas por vendedor
  const relProgramadas = Object.values(
    propostasMes.filter(p => p.comissao_banco_recebida && !p.comissao_vendedor_paga).reduce((acc, p) => {
      const key = p.vendedor_nome || 'Sem vendedor';
      if (!acc[key]) acc[key] = { nome: key, total: 0 };
      acc[key].total += p.valor_comissao || 0;
      return acc;
    }, {})
  ).sort((a, b) => b.total - a.total);

  const exportarExcelDashboard = () => {
    const rows = [
      ['Relatório de Comissões — ' + (mesFilter === 'todos' ? 'Todos os meses' : moment(mesFilter).format('MMMM/YYYY'))],
      [],
      ['RESUMO'],
      ['Comissões Recebidas do Banco', totalRecebidoBanco.toFixed(2)],
      ['Comissões Pagas aos Vendedores', totalPagoVendedor.toFixed(2)],
      ['Comissões Programadas', totalProgramado.toFixed(2)],
      ['Saldo a Pagar', saldoAPagar.toFixed(2)],
      [],
      ['POR VENDEDOR (PAGAS)'],
      ...relPorVendedor.map(r => [r.nome, r.total.toFixed(2)]),
      [],
      ['POR BANCO (RECEBIDAS)'],
      ...relPorBanco.map(r => [r.nome, r.total.toFixed(2)]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comissoes_${mesFilter || 'todos'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Percentual da empresa (comissão recebida do banco) = valor_comissao / base de cálculo
  const getPercentualEmpresa = (p) => {
    const base = p.comissao_banco_base_comissao || p.valor_credito;
    if (p.valor_comissao && base) {
      return parseFloat(((p.valor_comissao / base) * 100).toFixed(4));
    }
    return 0;
  };

  // Percentual do vendedor (editável)
  // Se comissao_banco_base_comissao está definido, sempre recalcula com base correta.
  // Senão usa percentual_comissao_vendedor salvo (legado) ou percentual empresa.
  const getPercentualVendedorDefault = (p) => {
    if (p.comissao_banco_base_comissao) {
      return getPercentualEmpresa(p);
    }
    if (p.percentual_comissao_vendedor != null && p.percentual_comissao_vendedor > 0) {
      return parseFloat(p.percentual_comissao_vendedor);
    }
    return getPercentualEmpresa(p);
  };

  const getPercentualVendedor = (p) => {
    return percentuaisCustom[p.id] !== undefined ? percentuaisCustom[p.id] : getPercentualVendedorDefault(p);
  };

  // Base de cálculo da comissão: usa base_comissao do banco se disponível, senão valor_credito (bruto)
  const getBaseComissao = (p) => p.comissao_banco_base_comissao || p.valor_credito || 0;

  // Valor a pagar ao vendedor
  const getValorAPagar = (p) => {
    return getBaseComissao(p) * (getPercentualVendedor(p) / 100);
  };
  
  // Alias para compatibilidade
  const getPercentualProposta = getPercentualEmpresa;

  const abrirModalPagamento = async (vendedor, e) => {
    if (e) e.stopPropagation();
    setVendedorModal(vendedor);
    const aPagar = vendedor.propostas.filter(p => p.comissao_banco_recebida && !p.comissao_vendedor_paga);
    setModalSelecionados(new Set(aPagar.map(p => p.id)));
    setModalSearch('');
    setFormaPagamento('PIX');
    setObservacao('');
    setAcrescimoValor('');
    setAcrescimoDescricao('');
    setAdiantamentosSelecionados(new Set());

    // Reset do passo de confirmação / comprovante / PIX (snapshot por chamada)
    setPixVendedor(null);
    setConfirmarModal(false);
    setComprovanteFile(null);
    setComprovanteTransacaoId('');
    setCodigoAutenticacao('');

    // Busca adiantamentos pendentes e dados bancários/PIX do vendedor em paralelo
    try {
      const filtro = { status: 'pendente' };
      if (vendedor.vendedor_id) filtro.colaborador_id = vendedor.vendedor_id;
      const [adis, colabs] = await Promise.all([
        base44.entities.Adiantamento.filter(filtro),
        vendedor.vendedor_id
          ? base44.entities.Colaborador.filter({ id: vendedor.vendedor_id })
          : Promise.resolve([]),
      ]);
      setAdiantamentosVendedor(adis.filter(a => a.colaborador_id === vendedor.vendedor_id || (!vendedor.vendedor_id && !a.colaborador_id)));
      if (colabs.length > 0) {
        const c = colabs[0];
        // Snapshot de PIX — captura do cadastro atual do vendedor (imutável no comprovante)
        const pixChave = c.pix_chave || c.chave_pix || null;
        const pixTipo = c.pix_tipo || c.tipo_chave_pix || null;
        setPixVendedor(pixChave ? {
          tipo: pixTipo,
          chave: pixChave,
          titularNome: c.pix_titular_nome || c.favorecido_nome || c.nome,
          titularDocumento: c.pix_titular_documento || c.favorecido_cpf || c.cpf_cnpj,
          instituicao: c.pix_instituicao || c.banco_nome || c.banco,
        } : null);
        setDadosBancariosVendedor({
          banco: c.banco_nome || c.banco || null,
          agencia: c.agencia || null,
          conta: c.conta || null,
          tipo_conta: c.tipo_conta || null,
          pix: pixChave,
        });
      } else {
        setDadosBancariosVendedor(null);
      }
    } catch {
      setAdiantamentosVendedor([]);
      setDadosBancariosVendedor(null);
    }

    // Logo configurada para o comprovante PDF (buscada aqui para passar ao gerador)
    try {
      const configs = await base44.entities.ConfiguracaoSistema.filter({ chave: 'logo_url' });
      if (configs && configs.length > 0 && configs[0].valor) setLogoUrlComprovante(configs[0].valor);
    } catch (_) {}

    setPagarModal(true);
  };

  const handleMarcarBancoRecebido = async (proposta) => {
    if (!proposta.comissao_banco_recebida) {
      // Validar campos obrigatórios ao marcar como recebido
      if (!bancoDtRecebimento) { toast.error('Informe a data de recebimento'); return; }
      if (bancoValorRecebido === '' || bancoValorRecebido === null) { toast.error('Informe o valor recebido'); return; }
      if (bancoPercentualRecebido === '' || bancoPercentualRecebido === null) { toast.error('Informe o percentual recebido'); return; }
    }
    setIsMarkingBanco(true);
    try {
      const novoStatus = !proposta.comissao_banco_recebida;
      const updateData = { comissao_banco_recebida: novoStatus };
      if (novoStatus) {
        updateData.comissao_banco_data_recebimento = bancoDtRecebimento;
        updateData.comissao_banco_valor_recebido = parseFloat(bancoValorRecebido) || 0;
        updateData.comissao_banco_percentual_recebido = parseFloat(bancoPercentualRecebido) || 0;
        if (bancoBaseComissao && parseFloat(bancoBaseComissao) > 0) {
          updateData.comissao_banco_base_comissao = parseFloat(bancoBaseComissao);
        }
        // Atualizar valor_comissao com o valor efetivamente recebido
        updateData.valor_comissao = parseFloat(bancoValorRecebido) || proposta.valor_comissao;
      }
      await base44.entities.Proposta.update(proposta.id, updateData);
      queryClient.invalidateQueries(['propostas-emp-cons-comissoes']);
      toast.success(novoStatus ? 'Comissão do banco marcada como recebida!' : 'Desmarcado');
    } catch (err) {
      toast.error('Erro ao atualizar');
    } finally {
      setIsMarkingBanco(false);
      setMarcarBancoModal(false);
      setPropostaMarcar(null);
      setBancoDtRecebimento('');
      setBancoValorRecebido('');
      setBancoPercentualRecebido('');
      setBancoBaseComissao('');
    }
  };

  const gerarPDF = async (propostasLista, vendedorInfo, dataPagamento, formaPagto, loteCode, percMap = {}, adiantamentosDesc = [], dadosBancarios = null, acrescimoVal = 0, acrescimoDesc = '', pixInfo = null, codigoAutentic = '', comprovanteAnexado = false) => {
    const doc = gerarPdfComprovanteEmprestimo({
      vendedorNome: vendedorInfo?.vendedor_nome || '-',
      dataPagamento,
      formaPagamento: formaPagto || '-',
      loteCode,
      itens: propostasLista,
      percMap,
      adiantamentosDesc,
      acrescimoVal,
      acrescimoDesc,
      pix: pixInfo,
      codigoAutenticacao: codigoAutentic,
      comprovanteAnexado,
      logoUrl: logoUrlComprovante,
    });
    doc.save(`comprovante_emp_${vendedorInfo?.vendedor_nome?.replace(/\s+/g, '_') || 'vendedor'}_${moment(dataPagamento).format('YYYYMMDD')}.pdf`);
    return doc;
  };

  const totalAdiantamentosDesc = Array.from(adiantamentosSelecionados)
    .map(id => adiantamentosVendedor.find(a => a.id === id))
    .filter(Boolean)
    .reduce((acc, a) => acc + (a.valor || 0), 0);

  const handleConfirmarPagamento = async () => {
    if (modalSelecionados.size === 0 || !vendedorModal) return;

    // Validação: PIX obrigatório quando forma de pagamento for PIX
    if (formaPagamento === 'PIX' && (!pixVendedor || !pixVendedor.chave)) {
      toast.error('O vendedor não possui uma chave PIX cadastrada. Atualize o cadastro antes de realizar o pagamento.');
      return;
    }

    setIsPaying(true);
    try {
      const ids = Array.from(modalSelecionados);
      const paraPagar = propostas.filter(p => ids.includes(p.id) && p.comissao_banco_recebida && !p.comissao_vendedor_paga);
      if (paraPagar.length === 0) { toast.error('Nenhum contrato válido para pagar'); return; }

      // Upload do comprovante bancário anexado (se houver)
      let comprovanteUrl = null;
      if (comprovanteFile) {
        try {
          const respUpload = await base44.integrations.Core.UploadFile({ file: comprovanteFile });
          comprovanteUrl = respUpload?.file_url || null;
        } catch (e) {
          console.warn('Falha ao anexar comprovante:', e);
          toast.error('Erro ao anexar comprovante. Tente novamente.');
          setIsPaying(false);
          return;
        }
      }

      const dataPagamento = moment().format('YYYY-MM-DD');
      const dataHoraQuitacao = moment().toISOString();
      const loteCode = `EMPC${String(Date.now()).slice(-6)}`;
      const codigoAutentic = codigoAutenticacao || gerarCodigoAutenticacao();
      setCodigoAutenticacao(codigoAutentic);

      // Calcular totais com percentuais congelados agora
      const itensComValores = paraPagar.map(p => {
        const percVendedor = percentuaisCustom[p.id] !== undefined ? percentuaisCustom[p.id] : getPercentualEmpresa(p);
        const percEmpresa = getPercentualEmpresa(p);
        const base = p.comissao_banco_base_comissao || p.valor_credito || 0;
        const valVendedor = base * (percVendedor / 100);
        const editadoManual = percentuaisCustom[p.id] !== undefined;
        return { p, percVendedor, percEmpresa, valVendedor, editadoManual };
      });

      const valorTotalBruto = itensComValores.reduce((acc, i) => acc + i.valVendedor, 0);
      const acrescimoVal = parseFloat(acrescimoValor) || 0;
      const valorTotal = Math.max(0, valorTotalBruto - totalAdiantamentosDesc + acrescimoVal);

      // 1. Criar lote (com snapshot imutável do PIX + comprovante + autenticação + responsável)
      const lote = await base44.entities.LotePagamentoComissaoEmprestimo.create({
        empresa_id: vendedorModal.propostas[0]?.empresa_id || user?.empresa_id,
        vendedor_id: vendedorModal.vendedor_id,
        vendedor_nome: vendedorModal.vendedor_nome,
        data_pagamento: dataPagamento,
        data_quitacao: dataPagamento,
        data_hora_quitacao: dataHoraQuitacao,
        valor_total: valorTotal,
        valor_efetivamente_pago: valorTotal,
        quantidade_propostas: itensComValores.length,
        forma_pagamento: formaPagamento,
        observacao: observacao || '',
        lote_codigo: loteCode,
        acrescimos: acrescimoVal,
        acrescimo_descricao: acrescimoDescricao || '',
        descontos: totalAdiantamentosDesc,
        comprovante_url: comprovanteUrl,
        comprovante_anexado: !!comprovanteUrl,
        comprovante_transacao_id: comprovanteTransacaoId || null,
        codigo_autenticacao: codigoAutentic,
        status: 'quitado',
        quitado_por_id: user?.colaborador_id || user?.id || null,
        quitado_por_nome: user?.full_name || null,
        pix_tipo: pixVendedor?.tipo || null,
        pix_chave: pixVendedor?.chave || null,
        pix_titular_nome: pixVendedor?.titularNome || null,
        pix_titular_documento: pixVendedor?.titularDocumento || null,
        pix_instituicao: pixVendedor?.instituicao || null,
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
          valor_liquido: p.valor_liquido || null,
          valor_parcela: p.emprestimo_valor_parcela || null,
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

      // Descontar adiantamentos selecionados (com suporte a desconto parcial)
      const adisDesc = Array.from(adiantamentosSelecionados)
        .map(id => adiantamentosVendedor.find(a => a.id === id))
        .filter(Boolean);

      // Calcular quanto realmente pode ser descontado (limitado ao valor bruto das comissões)
      let saldoDisponivel = valorTotalBruto;

      for (const adi of adisDesc) {
        if (saldoDisponivel <= 0) break;

        const valorDescontar = Math.min(adi.valor, saldoDisponivel);
        const valorRestante = adi.valor - valorDescontar;
        saldoDisponivel -= valorDescontar;

        if (valorRestante > 0.01) {
          // Desconto parcial: atualiza o adiantamento original com o valor restante e cria novo pendente
          // Appenda ao histórico de descontos parciais
          let historicoAtual = [];
          try { historicoAtual = JSON.parse(adi.historico_descontos || '[]'); } catch {}
          historicoAtual.push({
            valor: valorDescontar,
            data_desconto: dataPagamento,
            lote_codigo: loteCode,
            lote_id: lote.id,
          });
          await base44.entities.Adiantamento.update(adi.id, {
            valor: valorRestante,
            status: 'pendente',
            historico_descontos: JSON.stringify(historicoAtual),
            observacao: `Parcialmente descontado no lote ${loteCode}. Restante: R$ ${valorRestante.toFixed(2)}`,
          });
          // Cria registro do valor efetivamente descontado (para histórico/despesa)
          await base44.entities.Adiantamento.create({
            empresa_id: adi.empresa_id || vendedorModal.propostas[0]?.empresa_id || user?.empresa_id,
            colaborador_id: adi.colaborador_id,
            colaborador_nome: adi.colaborador_nome,
            parceiro_nome: adi.parceiro_nome,
            valor: valorDescontar,
            data: adi.data,
            motivo: adi.motivo,
            status: 'descontado',
            data_desconto: dataPagamento,
            lote_pagamento_id: lote.id,
            observacao: `Desconto parcial do lote ${loteCode}. Original: R$ ${adi.valor.toFixed(2)}`,
          });
        } else {
          // Desconto total
          await base44.entities.Adiantamento.update(adi.id, {
            status: 'descontado',
            data_desconto: dataPagamento,
            lote_pagamento_id: lote.id,
          });
        }

        // Lança despesa "Adiantamento de Salário" para o financeiro pelo valor efetivamente descontado
        await base44.entities.Despesa.create({
          empresa_id: vendedorModal.propostas[0]?.empresa_id || user?.empresa_id,
          descricao: `Adiantamento de Salário — ${adi.colaborador_nome || adi.parceiro_nome}${adi.motivo ? ` (${adi.motivo})` : ''}`,
          categoria: 'Adiantamento de Salários',
          valor: valorDescontar,
          data: adi.data,
          data_pagamento: dataPagamento,
          status: 'pago',
          responsavel_id: adi.colaborador_id || user?.colaborador_id || '',
          responsavel_nome: adi.colaborador_nome || adi.parceiro_nome || '',
          observacao: `Descontado no lote ${loteCode}${valorRestante > 0.01 ? ` (parcial, restam R$ ${valorRestante.toFixed(2)})` : ''}`,
          usuario_id: user?.colaborador_id || '',
          usuario_nome: user?.full_name || '',
        });
      }

      // PDF usa os valores já calculados (congelados)
      const percMapFinal = {};
      itensComValores.forEach(({ p, percVendedor }) => { percMapFinal[p.id] = percVendedor; });
      const doc = await gerarPDF(paraPagar, vendedorModal, dataPagamento, formaPagamento, loteCode, percMapFinal, adisDesc, dadosBancariosVendedor, acrescimoVal, acrescimoDescricao, pixVendedor, codigoAutentic, !!comprovanteUrl);

      // Salvar PDF no histórico do lote (storage)
      try {
        const pdfBlob = doc.output('blob');
        const pdfFile = new File([pdfBlob], `comprovante_${loteCode}.pdf`, { type: 'application/pdf' });
        const { file_url: pdfUrl } = await base44.integrations.Core.UploadFile({ file: pdfFile });
        if (pdfUrl) {
          await base44.entities.LotePagamentoComissaoEmprestimo.update(lote.id, { pdf_url: pdfUrl });
        }
      } catch (e) {
        console.warn('Não foi possível salvar o PDF no histórico:', e);
      }

      queryClient.invalidateQueries(['propostas-emp-cons-comissoes']);
      const msgAdis = adisDesc.length > 0 ? ` ${adisDesc.length} adiantamento(s) descontado(s).` : '';
      toast.success(`✅ ${paraPagar.length} comissão(ões) paga(s)! PDF gerado.${msgAdis}`);
      setPagarModal(false);
      setConfirmarModal(false);
      setModalSelecionados(new Set());
      setVendedorModal(null);
      setComprovanteFile(null);
      setComprovanteTransacaoId('');
      setCodigoAutenticacao('');
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

      {/* ===== DASHBOARD FINANCEIRO ===== */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">COMISSÕES — DASHBOARD FINANCEIRO</h2>
          <div className="flex flex-wrap gap-2">
            <Select value={mesFilter} onValueChange={setMesFilter}>
              <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Mês/Ano" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meses</SelectItem>
                {mesesDisponiveis.map(mes => (
                  <SelectItem key={mes} value={mes}>{moment(mes).format('MMMM/YYYY')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="a_pagar">A Pagar</SelectItem>
                <SelectItem value="paga">Pagos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={comissaoBancoFilter} onValueChange={setComissaoBancoFilter}>
              <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Banco" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os bancos</SelectItem>
                <SelectItem value="recebida">✅ Com. Recebida</SelectItem>
                <SelectItem value="nao_recebida">⏳ Não Recebida</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Linha 1: 4 cards grandes */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border-l-4 border-green-500 bg-green-50 p-4">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Recebidas no Mês</p>
            <p className="text-2xl font-bold text-green-800 mt-1">{fmt(totalRecebidoBanco)}</p>
            <p className="text-xs text-green-600 mt-0.5">Comissões do banco</p>
          </div>
          <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Pagas no Mês</p>
            <p className="text-2xl font-bold text-blue-800 mt-1">{fmt(totalPagoVendedor)}</p>
            <p className="text-xs text-blue-600 mt-0.5">Pagas aos vendedores</p>
          </div>
          <div className="rounded-lg border-l-4 border-orange-400 bg-orange-50 p-4">
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Programadas</p>
            <p className="text-2xl font-bold text-orange-800 mt-1">{fmt(totalProgramado)}</p>
            <p className="text-xs text-orange-600 mt-0.5">Banco recebeu, aguarda pagamento</p>
          </div>
          <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-4">
            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Saldo a Pagar</p>
            <p className="text-2xl font-bold text-red-800 mt-1">{fmt(saldoAPagar)}</p>
            <p className="text-xs text-red-600 mt-0.5">Recebido − Pago</p>
          </div>
        </div>

        {/* Linha 2: Indicadores operacionais */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Propostas Pagas', val: qtdPropostasPagas, color: 'text-slate-700' },
            { label: 'Com. Recebidas Banco', val: qtdComissoesBanco, color: 'text-green-700' },
            { label: 'Com. Pagas Vendedor', val: qtdComissoesPagasVendedor, color: 'text-blue-700' },
            { label: 'Programadas', val: qtdProgramadas, color: 'text-orange-700' },
          ].map(({ label, val, color }) => (
            <div key={label} className="bg-slate-50 rounded-lg p-3 text-center border border-slate-100">
              <p className={`text-2xl font-bold ${color}`}>{val}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Linha 3: Botões de relatório */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100">
          <Button size="sm" variant={relatorioAtivo === 'pagas' ? 'default' : 'outline'} className="text-xs h-8 gap-1.5"
            onClick={() => setRelatorioAtivo(relatorioAtivo === 'pagas' ? null : 'pagas')}>
            <FileText className="w-3.5 h-3.5" /> Comissões Pagas
          </Button>
          <Button size="sm" variant={relatorioAtivo === 'recebidas' ? 'default' : 'outline'} className="text-xs h-8 gap-1.5"
            onClick={() => setRelatorioAtivo(relatorioAtivo === 'recebidas' ? null : 'recebidas')}>
            <FileText className="w-3.5 h-3.5" /> Comissões Recebidas
          </Button>
          <Button size="sm" variant={relatorioAtivo === 'programadas' ? 'default' : 'outline'} className="text-xs h-8 gap-1.5"
            onClick={() => setRelatorioAtivo(relatorioAtivo === 'programadas' ? null : 'programadas')}>
            <FileText className="w-3.5 h-3.5" /> Programadas
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5 ml-auto" onClick={exportarExcelDashboard}>
            <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" /> Exportar Excel
          </Button>
        </div>

        {/* Relatórios inline */}
        {relatorioAtivo === 'pagas' && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-700 text-white px-4 py-2 text-xs font-bold">
              Relatório de Comissões Pagas — {mesFilter === 'todos' ? 'Todos os meses' : moment(mesFilter).format('MMMM/YYYY')}
            </div>
            <div className="divide-y divide-slate-100">
              {relPorVendedor.length === 0 ? (
                <p className="text-center text-slate-400 text-xs p-4">Nenhuma comissão paga no período</p>
              ) : relPorVendedor.map(r => (
                <div key={r.nome} className="flex items-center justify-between px-4 py-2 hover:bg-slate-50">
                  <span className="text-sm text-slate-700">{r.nome}</span>
                  <span className="font-semibold text-sm text-blue-700">{fmt(r.total)}</span>
                </div>
              ))}
            </div>
            <div className="bg-slate-50 px-4 py-2 flex justify-between border-t border-slate-200">
              <span className="text-xs font-bold text-slate-600">TOTAL PAGO</span>
              <span className="text-sm font-bold text-blue-700">{fmt(totalPagoVendedor)}</span>
            </div>
          </div>
        )}

        {relatorioAtivo === 'recebidas' && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-green-700 text-white px-4 py-2 text-xs font-bold">
              Relatório de Comissões Recebidas — {mesFilter === 'todos' ? 'Todos os meses' : moment(mesFilter).format('MMMM/YYYY')}
            </div>
            <div className="divide-y divide-slate-100">
              {relPorBanco.length === 0 ? (
                <p className="text-center text-slate-400 text-xs p-4">Nenhuma comissão recebida no período</p>
              ) : relPorBanco.map(r => (
                <div key={r.nome} className="flex items-center justify-between px-4 py-2 hover:bg-slate-50">
                  <span className="text-sm text-slate-700">{r.nome}</span>
                  <span className="font-semibold text-sm text-green-700">{fmt(r.total)}</span>
                </div>
              ))}
            </div>
            <div className="bg-slate-50 px-4 py-2 flex justify-between border-t border-slate-200">
              <span className="text-xs font-bold text-slate-600">TOTAL RECEBIDO</span>
              <span className="text-sm font-bold text-green-700">{fmt(totalRecebidoBanco)}</span>
            </div>
          </div>
        )}

        {relatorioAtivo === 'programadas' && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-orange-600 text-white px-4 py-2 text-xs font-bold">
              Relatório de Comissões Programadas — {mesFilter === 'todos' ? 'Todos os meses' : moment(mesFilter).format('MMMM/YYYY')}
            </div>
            <div className="divide-y divide-slate-100">
              {relProgramadas.length === 0 ? (
                <p className="text-center text-slate-400 text-xs p-4">Nenhuma comissão programada no período</p>
              ) : relProgramadas.map(r => (
                <div key={r.nome} className="flex items-center justify-between px-4 py-2 hover:bg-slate-50">
                  <span className="text-sm text-slate-700">{r.nome}</span>
                  <span className="font-semibold text-sm text-orange-700">{fmt(r.total)}</span>
                </div>
              ))}
            </div>
            <div className="bg-slate-50 px-4 py-2 flex justify-between border-t border-slate-200">
              <span className="text-xs font-bold text-slate-600">TOTAL PROGRAMADO</span>
              <span className="text-sm font-bold text-orange-700">{fmt(totalProgramado)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Filtros da lista */}
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
      </div>

      {/* Aviso sobre fluxo */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-start gap-2 text-xs text-slate-600">
        <AlertCircle className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
        <span><strong>Fluxo:</strong> 1. Marque os contratos como "Comissão recebida do banco". 2. Pague a comissão ao vendedor.</span>
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
                          <th className="p-3 text-left font-semibold">Tipo</th>
                          <th className="p-3 text-left font-semibold">Banco</th>
                          <th className="p-3 text-left font-semibold">Data Lib.</th>
                          <th className="p-3 text-right font-semibold">Vl. Base Comissão</th>
                          <th className="p-3 text-right font-semibold">Vl. Líquido</th>
                          <th className="p-3 text-right font-semibold">Vl. Parcela</th>
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
                          <tr key={p.id} className="border-b hover:bg-slate-50 transition-colors cursor-pointer" onDoubleClick={() => setPropostaDetalhes(p)}>
                            <td className="p-3">
                               <p className="font-medium text-slate-900">{p.cliente_nome || '-'}</p>
                               {p.cliente_cpf && <p className="text-xs text-slate-400 mt-0.5">{p.cliente_cpf}</p>}
                             </td>
                            <td className="p-3 text-slate-600">{p.contrato || '-'}</td>
                            <td className="p-3 text-slate-600">
                              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700">
                                {getTipoLabel(p.emprestimo_tipo)}
                              </span>
                            </td>
                            <td className="p-3 text-slate-600">{p.administradora_nome || '-'}</td>
                            <td className="p-3 text-slate-500 text-xs">
                              {p.emprestimo_data_liberacao
                                ? moment(p.emprestimo_data_liberacao).format('DD/MM/YYYY')
                                : p.data_venda ? moment(p.data_venda).format('DD/MM/YYYY') : '-'}
                            </td>
                            <td className="p-3 text-right font-medium">
                              {p.comissao_banco_base_comissao
                                ? <span className="text-blue-700 font-semibold">{fmt(p.comissao_banco_base_comissao)}</span>
                                : <span className="text-slate-600">{fmt(p.valor_credito)}</span>
                              }
                            </td>
                            <td className="p-3 text-right font-medium text-slate-600">{p.valor_liquido ? fmt(p.valor_liquido) : '-'}</td>
                            <td className="p-3 text-right text-slate-500 text-xs">{p.emprestimo_valor_parcela ? fmt(p.emprestimo_valor_parcela) : '-'}</td>
                            <td className="p-3 text-right text-slate-500 text-xs font-semibold">
                              {getPercentualEmpresa(p).toFixed(2)}%
                            </td>
                            <td className="p-3 text-right font-semibold text-slate-700">{fmt(p.valor_comissao)}</td>
                            <td className="p-3 text-right" onDoubleClick={e => e.stopPropagation()}>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={percentuaisCustom[p.id] !== undefined ? percentuaisCustom[p.id] : getPercentualVendedorDefault(p).toFixed(2)}
                                onChange={e => setPercentuaisCustom(prev => ({ ...prev, [p.id]: parseFloat(e.target.value) || 0 }))}
                                className="w-20 h-7 text-xs text-right p-1"
                              />
                            </td>
                            <td className="p-3 text-right font-semibold text-blue-700">{fmt(getValorAPagar(p))}</td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => {
                                  setPropostaMarcar(p);
                                  setBancoDtRecebimento(p.comissao_banco_data_recebimento || '');
                                                   setBancoValorRecebido(p.comissao_banco_valor_recebido ? String(p.comissao_banco_valor_recebido) : p.valor_comissao ? String(p.valor_comissao) : '');
                                                   setBancoPercentualRecebido(p.comissao_banco_percentual_recebido ? String(p.comissao_banco_percentual_recebido) : getPercentualEmpresa(p) ? String(getPercentualEmpresa(p).toFixed(4)) : '');
                                                   setBancoBaseComissao(p.comissao_banco_base_comissao ? String(p.comissao_banco_base_comissao) : '');
                                  setMarcarBancoModal(true);
                                }}
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

      {/* Modal: Detalhes da Proposta (duplo clique) */}
      <PropostaDetalhesModal
        proposta={propostaDetalhes}
        onClose={() => setPropostaDetalhes(null)}
      />

      {/* Modal: Marcar Comissão Banco */}
      <Dialog open={marcarBancoModal} onOpenChange={(v) => {
        setMarcarBancoModal(v);
        if (!v) { setBancoDtRecebimento(''); setBancoValorRecebido(''); setBancoPercentualRecebido(''); setBancoBaseComissao(''); }
      }}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#10353C] to-[#1a5060] px-6 py-4">
            <DialogTitle className="text-white text-lg font-bold flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#23BE84]" />
              Recebimento do Banco
            </DialogTitle>
            <p className="text-white/60 text-xs mt-0.5">Registre os dados do recebimento da comissão</p>
          </div>

          {propostaMarcar && (
            <div className="p-5 space-y-4">
              {/* Info do contrato */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Cliente', value: propostaMarcar.cliente_nome, full: true },
                  { label: 'Contrato', value: propostaMarcar.contrato || '-' },
                  { label: 'Banco', value: propostaMarcar.administradora_nome || '-' },
                  { label: 'Tipo', value: getTipoLabel(propostaMarcar.emprestimo_tipo) },
                  { label: 'Vl. Bruto (Crédito)', value: fmt(propostaMarcar.valor_credito), highlight: true },
                ].map(({ label, value, full, highlight }) => (
                  <div key={label} className={`bg-slate-50 rounded-xl px-3 py-2.5 ${full ? 'col-span-2' : ''}`}>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
                    <p className={`text-sm font-semibold mt-0.5 ${highlight ? 'text-[#10353C]' : 'text-slate-800'}`}>{value}</p>
                  </div>
                ))}
              </div>

              {propostaMarcar.comissao_banco_recebida ? (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-orange-800 font-semibold text-sm">Deseja desmarcar o recebimento?</p>
                    {propostaMarcar.comissao_banco_data_recebimento && (
                      <p className="text-orange-600 text-xs mt-1">
                        Registrado em {moment(propostaMarcar.comissao_banco_data_recebimento).format('DD/MM/YYYY')} · {fmt(propostaMarcar.comissao_banco_valor_recebido)} · {propostaMarcar.comissao_banco_percentual_recebido}%
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                    <CheckCircle2 className="w-4 h-4 text-[#23BE84]" />
                    <p className="text-slate-700 font-semibold text-sm">Dados do recebimento</p>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Data de Recebimento *</Label>
                    <Input
                      type="date"
                      value={bancoDtRecebimento}
                      onChange={e => setBancoDtRecebimento(e.target.value)}
                      className="h-10 border-slate-200 focus:border-[#10353C]"
                    />
                  </div>

                  {/* Campo: Base da Comissão */}
                  <div>
                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Vl. B. Comissão <span className="text-slate-400 normal-case font-normal">(valor sobre o qual a comissão foi paga)</span></Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">R$</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={fmt(propostaMarcar.valor_credito)}
                        className="pl-9 h-10 border-slate-200 focus:border-[#10353C] bg-blue-50/40"
                        value={bancoBaseComissao}
                        onChange={e => {
                          setBancoBaseComissao(e.target.value);
                          // Recalcular percentual se houver valor recebido
                          const base = parseFloat(e.target.value) || 0;
                          const val = parseFloat(bancoValorRecebido) || 0;
                          if (val > 0 && base > 0) {
                            setBancoPercentualRecebido(((val / base) * 100).toFixed(4));
                          }
                        }}
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Se vazio, usa o Vl. Bruto ({fmt(propostaMarcar.valor_credito)}) para cálculo do percentual</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Valor Recebido *</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">R$</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0,00"
                          className="pl-9 h-10 border-slate-200 focus:border-[#10353C]"
                          value={bancoValorRecebido}
                          onChange={e => {
                            setBancoValorRecebido(e.target.value);
                            const val = parseFloat(e.target.value) || 0;
                            const base = parseFloat(bancoBaseComissao) || propostaMarcar.valor_credito || 0;
                            if (val > 0 && base > 0) {
                              setBancoPercentualRecebido(((val / base) * 100).toFixed(4));
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Percentual *</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.0001"
                          placeholder="0,00"
                          className="pr-8 h-10 border-slate-200 focus:border-[#10353C]"
                          value={bancoPercentualRecebido}
                          onChange={e => {
                            setBancoPercentualRecebido(e.target.value);
                            const perc = parseFloat(e.target.value) || 0;
                            const base = parseFloat(bancoBaseComissao) || propostaMarcar.valor_credito || 0;
                            if (perc > 0 && base > 0) {
                              setBancoValorRecebido(((base * perc) / 100).toFixed(2));
                            }
                          }}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">%</span>
                      </div>
                    </div>
                  </div>

                  {bancoValorRecebido && bancoPercentualRecebido && parseFloat(bancoValorRecebido) > 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <p className="text-emerald-700 text-xs">
                        <strong>{fmt(parseFloat(bancoValorRecebido))}</strong> referente a <strong>{parseFloat(bancoPercentualRecebido).toFixed(4)}%</strong> de {fmt(parseFloat(bancoBaseComissao) || propostaMarcar.valor_credito)}
                        {bancoBaseComissao && parseFloat(bancoBaseComissao) > 0 && parseFloat(bancoBaseComissao) !== propostaMarcar.valor_credito && (
                          <span className="text-slate-500 ml-1">(base: {fmt(parseFloat(bancoBaseComissao))})</span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="px-5 pb-5 flex gap-2 justify-end border-t border-slate-100 pt-4">
            <Button variant="outline" onClick={() => setMarcarBancoModal(false)} disabled={isMarkingBanco} className="px-5">
              Cancelar
            </Button>
            <Button
              onClick={() => propostaMarcar && handleMarcarBancoRecebido(propostaMarcar)}
              disabled={isMarkingBanco}
              className={`px-5 ${propostaMarcar?.comissao_banco_recebida ? 'bg-orange-500 hover:bg-orange-600' : 'bg-[#10353C] hover:bg-[#1a5060]'}`}
            >
              {isMarkingBanco
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Processando...</>
                : propostaMarcar?.comissao_banco_recebida
                  ? 'Desmarcar Recebimento'
                  : <><CheckCircle2 className="w-4 h-4 mr-2" />Confirmar Recebimento</>
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Selecionar Contratos a Pagar */}
      <Dialog open={pagarModal} onOpenChange={setPagarModal}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[95vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Pagar Comissão ao Vendedor</DialogTitle>
            <p className="text-sm text-slate-500">Apenas contratos com comissão do banco recebida podem ser pagos.</p>
          </DialogHeader>

          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar cliente ou contrato..." value={modalSearch}
              onChange={e => setModalSearch(e.target.value)} className="pl-9" />
          </div>

          <div className="overflow-y-auto border rounded-lg" style={{maxHeight: '40vh'}}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b">
                <tr className="text-slate-600">
                  <th className="p-3 w-10">
                    <Checkbox checked={todosSelecionados} onCheckedChange={toggleTodos} />
                  </th>
                  <th className="p-3 text-left font-semibold">Cliente</th>
                  <th className="p-3 text-left font-semibold">Contrato</th>
                  <th className="p-3 text-left font-semibold">Banco</th>
                  <th className="p-3 text-right font-semibold">Vl. Base Comissão</th>
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
                      <td className="p-3">
                        <p className="font-medium">{p.cliente_nome || '-'}</p>
                        {p.cliente_cpf && <p className="text-xs text-slate-400 mt-0.5">{p.cliente_cpf}</p>}
                      </td>
                      <td className="p-3 text-slate-600">{p.contrato || '-'}</td>
                      <td className="p-3 text-slate-600">{p.administradora_nome || '-'}</td>
                      <td className="p-3 text-right text-slate-700 font-medium">{fmt(getBaseComissao(p))}</td>
                      <td className="p-3 text-right">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={percentuaisCustom[p.id] !== undefined ? percentuaisCustom[p.id] : getPercentualVendedorDefault(p).toFixed(2)}
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

          {/* Adiantamentos pendentes do vendedor */}
          {adiantamentosVendedor.length > 0 && (
            <div className="border border-orange-200 rounded-lg bg-orange-50 p-3 space-y-2">
              <div className="flex items-center gap-2 text-orange-800 font-semibold text-sm">
                <AlertCircle className="w-4 h-4" />
                Adiantamentos Pendentes — selecione para descontar neste pagamento
              </div>
              {adiantamentosVendedor.map(a => {
                const sel = adiantamentosSelecionados.has(a.id);
                return (
                  <div
                    key={a.id}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-colors ${sel ? 'bg-orange-100 border-orange-400' : 'bg-white border-orange-200 hover:border-orange-300'}`}
                    onClick={() => {
                      const s = new Set(adiantamentosSelecionados);
                      sel ? s.delete(a.id) : s.add(a.id);
                      setAdiantamentosSelecionados(s);
                    }}
                  >
                    <Checkbox checked={sel} onCheckedChange={() => {
                      const s = new Set(adiantamentosSelecionados);
                      sel ? s.delete(a.id) : s.add(a.id);
                      setAdiantamentosSelecionados(s);
                    }} />
                    <div className="flex-1 text-xs">
                      <span className="font-semibold text-slate-800">{fmt(a.valor)}</span>
                      <span className="text-slate-500 ml-2">{moment(a.data).format('DD/MM/YYYY')}</span>
                      {a.motivo && <span className="text-slate-500 ml-2">— {a.motivo}</span>}
                    </div>
                  </div>
                );
              })}
              {totalAdiantamentosDesc > 0 && (
                <p className="text-xs text-orange-700 font-semibold pt-1">
                  Desconto total: {fmt(totalAdiantamentosDesc)} · Valor líquido a pagar: {fmt(Math.max(0, totalModalSelecionado - totalAdiantamentosDesc))}
                </p>
              )}
            </div>
          )}

          <div className="border-t pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 text-base">
                  Total: <span className="text-[#10353C]">{fmt(totalModalSelecionado)}</span>
                </span>
                {totalAdiantamentosDesc > 0 && (
                  <span className="ml-3 text-sm text-orange-600 font-semibold">
                    − {fmt(totalAdiantamentosDesc)} (adiantamentos) = <span className="text-green-700">{fmt(Math.max(0, totalModalSelecionado - totalAdiantamentosDesc))}</span>
                  </span>
                )}
              </div>
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
            <div className="grid grid-cols-2 gap-3 border border-green-200 bg-green-50 rounded-lg p-3">
              <div>
                <Label className="text-xs text-slate-600 font-semibold">(+) Acréscimo — Valor (R$)</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  value={acrescimoValor}
                  onChange={e => setAcrescimoValor(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-slate-600 font-semibold">Descrição do Acréscimo</Label>
                <Input
                  className="mt-1"
                  placeholder="Ex: Bônus de produção..."
                  value={acrescimoDescricao}
                  onChange={e => setAcrescimoDescricao(e.target.value)}
                />
              </div>
            </div>
          </div>

          {formaPagamento === 'PIX' && (!pixVendedor || !pixVendedor.chave) && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2 text-xs flex items-center gap-2 mb-2">
              <AlertCircle className="w-3.5 h-3.5" />
              O vendedor não possui uma chave PIX cadastrada. Atualize o cadastro antes de realizar o pagamento.
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPagarModal(false)} disabled={isPaying}>Cancelar</Button>
            <Button
              disabled={modalSelecionados.size === 0 || isPaying || (formaPagamento === 'PIX' && (!pixVendedor || !pixVendedor.chave))}
              onClick={() => setConfirmarModal(true)}
              className="bg-[#10353C] hover:bg-[#1a5060] text-white">
              {isPaying ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processando...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 mr-2" />Revisar e Confirmar ({fmt(Math.max(0, totalModalSelecionado - totalAdiantamentosDesc + (parseFloat(acrescimoValor) || 0)))})</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação (Passo 2 — Revisão do Pagamento PIX) */}
      <Dialog open={confirmarModal} onOpenChange={setConfirmarModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#10353C]" />
              Confirmar Pagamento
            </DialogTitle>
            <p className="text-xs text-slate-500">Revise os dados do pagamento antes de confirmar.</p>
          </DialogHeader>

          {pixVendedor && (
            <div className="space-y-2.5 text-sm">
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-xs text-slate-500 font-semibold uppercase">Vendedor</span>
                <span className="col-span-2 font-semibold text-slate-800">{vendedorModal?.vendedor_nome || '-'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-xs text-slate-500 font-semibold uppercase">Valor líquido</span>
                <span className="col-span-2 font-bold text-[#10353C]">{fmt(Math.max(0, totalModalSelecionado - totalAdiantamentosDesc + (parseFloat(acrescimoValor) || 0)))}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-xs text-slate-500 font-semibold uppercase">Forma</span>
                <span className="col-span-2 font-semibold text-slate-800">{formaPagamento}</span>
              </div>
              {pixVendedor?.tipo && (
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-xs text-slate-500 font-semibold uppercase">Tipo da chave</span>
                  <span className="col-span-2 font-semibold text-slate-800 uppercase">{pixVendedor.tipo}</span>
                </div>
              )}
              {pixVendedor?.chave && (
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-xs text-slate-500 font-semibold uppercase">Chave PIX</span>
                  <span className="col-span-2 font-semibold text-slate-800 font-mono">{mascararChavePix(pixVendedor.chave, pixVendedor.tipo)}</span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-xs text-slate-500 font-semibold uppercase">Favorecido</span>
                <span className="col-span-2 font-semibold text-slate-800">{pixVendedor?.titularNome || vendedorModal?.vendedor_nome || '-'}</span>
              </div>
              {pixVendedor?.titularDocumento && (
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-xs text-slate-500 font-semibold uppercase">CPF/CNPJ</span>
                  <span className="col-span-2 font-semibold text-slate-800 font-mono">{mascararDocumento(pixVendedor.titularDocumento)}</span>
                </div>
              )}
              {pixVendedor?.instituicao && (
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-xs text-slate-500 font-semibold uppercase">Instituição</span>
                  <span className="col-span-2 font-semibold text-slate-800">{pixVendedor.instituicao}</span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 items-center">
                <span className="text-xs text-slate-500 font-semibold uppercase">Data do pagamento</span>
                <span className="col-span-2 font-semibold text-slate-800">{moment().format('DD/MM/YYYY [às] HH:mm')}</span>
              </div>
            </div>
          )}

          {/* Anexar comprovante bancário e/ou informar identificador da transação PIX */}
          <div className="border-t pt-3 space-y-2">
            <div>
              <Label className="text-xs text-slate-500 font-semibold">Comprovante bancário (PDF, JPG ou PNG) — opcional</Label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => setComprovanteFile(e.target.files?.[0] || null)}
                className="text-xs mt-1 w-full file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-slate-100 file:text-slate-700 file:cursor-pointer"
              />
              {comprovanteFile && (
                <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {comprovanteFile.name} ({Math.round(comprovanteFile.size / 1024)} KB)
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs text-slate-500 font-semibold">Identificador da transação PIX (quando disponível)</Label>
              <Input
                placeholder="Ex: E0001234567890..."
                value={comprovanteTransacaoId}
                onChange={e => setComprovanteTransacaoId(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmarModal(false)} disabled={isPaying}>Voltar</Button>
            <Button
              disabled={isPaying}
              onClick={handleConfirmarPagamento}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {isPaying ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Confirmando...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 mr-2" />Confirmar Pagamento</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}