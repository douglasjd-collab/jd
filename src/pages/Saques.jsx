import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, CheckCircle, Clock, TrendingUp, Paperclip, FileSpreadsheet, FileText, ExternalLink, Trash2, ArrowUpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = (d) => {
  if (!d) return '-';
  try {
    const dateStr = String(d).length <= 10 ? d + 'T12:00:00' : d;
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return '-';
  }
};

function exportarPDF(titulo, lotes, colunas, mostrarQuitacao) {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text(titulo, 14, 16);
  doc.setFontSize(9);
  doc.text(`Gerado em: ${fmtDate(new Date().toISOString().slice(0, 10))}`, 14, 23);
  const rows = lotes.map(l => [
    l._protocolo,
    fmtDate(l.data_pagamento),
    ...(mostrarQuitacao ? [fmtDate(l.data_quitacao)] : []),
    fmt(l._valor),
    fmt(l.acrescimos || 0),
    fmt(l.descontos || 0),
    fmt(l._total),
    ...(l._vendedor !== undefined ? [l._vendedor] : []),
    l.status === 'quitado' ? 'Quitado' : 'Programado',
  ]);
  autoTable(doc, { head: [colunas], body: rows, startY: 28, styles: { fontSize: 8 } });
  doc.save(`${titulo.replace(/\s+/g, '_')}.pdf`);
}

async function exportarLinhaPDF(lote) {
  // Lotes legado: sem backend, usa PDF simples
  if (lote.isLegado) {
    exportarLinhaPDFSimples(lote);
    return;
  }

  // Emprestimos e Consorcio com ID real: busca comprovante do backend
  if (lote._tipo === 'emp' || lote._tipo === 'consorcio') {
    try {
      const res = await base44.functions.invoke('baixarComprovanteComissao', {
        lote_id: lote.id,
        tipo: lote._tipo,
      });

      // Para consorcio: retorna HTML para abrir/imprimir
      if (res.data?.relatorio_html) {
        const win = window.open('', '_blank');
        win.document.write(res.data.relatorio_html);
        win.document.close();
        setTimeout(() => win.print(), 800);
        return;
      }

      // Retorno PDF como base64 (data URI)
      if (res.data?.pdf_base64) {
        const a = document.createElement('a');
        a.href = res.data.pdf_base64;
        a.download = res.data.filename || `comprovante_${lote._protocolo}.pdf`;
        a.click();
        return;
      }

      // Para emprestimos: retorna PDF binario via Blob
      if (res.data instanceof ArrayBuffer || res.data?.byteLength) {
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `comprovante_${lote._protocolo}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
    } catch (e) {
      // fallback para PDF simples
    }
  }

  exportarLinhaPDFSimples(lote);
}

function exportarLinhaPDFSimples(lote) {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text('Relatório de Comissão', 14, 16);
  doc.setFontSize(9);
  doc.text(`Protocolo: ${lote._protocolo}`, 14, 23);
  doc.text(`Gerado em: ${fmtDate(new Date().toISOString().slice(0, 10))}`, 14, 29);
  const colunas = [
    'Nº Protocolo', 'Data Programada', 'Valor Comissão', 'Acréscimos', 'Descontos', 'Total',
    ...(lote._vendedor !== undefined ? ['Vendedor'] : []),
    'Status',
  ];
  const row = [
    lote._protocolo,
    fmtDate(lote.data_pagamento),
    fmt(lote._valor),
    fmt(lote.acrescimos || 0),
    fmt(lote.descontos || 0),
    fmt(lote._total),
    ...(lote._vendedor !== undefined ? [lote._vendedor] : []),
    lote.status === 'quitado' ? 'Quitado' : 'Programado',
  ];
  autoTable(doc, { head: [colunas], body: [row], startY: 34, styles: { fontSize: 9 } });
  doc.save(`Comissao_${lote._protocolo}.pdf`);
}

function exportarLinhaCSV(lote, mostrarQuitacao) {
  const colunas = [
    'Nº Protocolo', 'Data Programada',
    ...(mostrarQuitacao ? ['Data Quitação'] : []),
    'Valor Comissão', 'Acréscimos', 'Descontos', 'Total',
    ...(lote._vendedor !== undefined ? ['Vendedor'] : []),
    'Status',
  ];
  const row = [
    lote._protocolo,
    fmtDate(lote.data_pagamento),
    ...(mostrarQuitacao ? [fmtDate(lote.data_quitacao)] : []),
    (lote._valor || 0).toFixed(2).replace('.', ','),
    (lote.acrescimos || 0).toFixed(2).replace('.', ','),
    (lote.descontos || 0).toFixed(2).replace('.', ','),
    (lote._total || 0).toFixed(2).replace('.', ','),
    ...(lote._vendedor !== undefined ? [lote._vendedor] : []),
    lote.status === 'quitado' ? 'Quitado' : 'Programado',
  ];
  const csvContent = [colunas, row].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Comissao_${lote._protocolo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportarCSV(titulo, lotes, colunas, mostrarQuitacao) {
  const rows = lotes.map(l => [
    l._protocolo,
    fmtDate(l.data_pagamento),
    ...(mostrarQuitacao ? [fmtDate(l.data_quitacao)] : []),
    (l._valor || 0).toFixed(2).replace('.', ','),
    (l.acrescimos || 0).toFixed(2).replace('.', ','),
    (l.descontos || 0).toFixed(2).replace('.', ','),
    (l._total || 0).toFixed(2).replace('.', ','),
    ...(l._vendedor !== undefined ? [l._vendedor] : []),
    l.status === 'quitado' ? 'Quitado' : 'Programado',
  ]);
  const csvContent = [colunas, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${titulo.replace(/\s+/g, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ModalReprogramar({ lote, onClose, onConfirm, loading }) {
  if (!lote) return null;
  return (
    <Dialog open={!!lote} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reprogramar Comissão</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm text-slate-600">Protocolo: <span className="font-semibold">{lote._protocolo}</span></p>
            <p className="text-sm text-slate-600">Vendedor: <span className="font-semibold">{lote.vendedor_nome || '-'}</span></p>
            <p className="text-sm text-slate-600">Valor: <span className="font-semibold">{fmt(lote._total)}</span></p>
          </div>
          <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-3">
            ⚠️ Esta ação irá reverter o status para <strong>Programado</strong>, removendo a data de quitação e o comprovante.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button className="bg-amber-500 hover:bg-amber-600 text-white" onClick={onConfirm} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar Reprogramação
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModalQuitar({ lote, onClose, onConfirm, loading, contas = [] }) {
  const [dataQuitacao, setDataQuitacao] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [comprovante, setComprovante] = useState(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [uploadando, setUploadando] = useState(false);
  const [contaBancariaId, setContaBancariaId] = useState('');

  useEffect(() => {
    if (lote) {
      setDataQuitacao(format(new Date(), 'yyyy-MM-dd'));
      setComprovante(null);
      setNomeArquivo('');
      setContaBancariaId('');
    }
  }, [lote]);

  const handleArquivo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadando(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setComprovante(file_url);
      setNomeArquivo(file.name);
    } catch {
      toast.error('Erro ao fazer upload do comprovante');
    } finally {
      setUploadando(false);
    }
  };

  return (
    <Dialog open={!!lote} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Quitar Comissão</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm text-slate-600">Protocolo: <span className="font-semibold">{lote?._protocolo}</span></p>
            <p className="text-sm text-slate-600">Valor: <span className="font-semibold">{lote ? fmt(lote._total) : ''}</span></p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="data_quitacao">Data da Quitação</Label>
            <Input id="data_quitacao" type="date" value={dataQuitacao} onChange={e => setDataQuitacao(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Conta Bancária para Retirada <span className="text-red-500">*</span></Label>
            <select
              value={contaBancariaId}
              onChange={e => setContaBancariaId(e.target.value)}
              className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-950"
            >
              <option value="">Selecione a conta...</option>
              {contas.map(c => (
                <option key={c.id} value={c.id}>{c.nome_conta} — {c.banco}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Comprovante (opcional)</Label>
            <label className="flex items-center gap-2 cursor-pointer border border-dashed border-slate-300 rounded-md px-3 py-2 hover:bg-slate-50 transition-colors">
              {uploadando ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : <Paperclip className="w-4 h-4 text-slate-400" />}
              <span className="text-xs text-slate-500 truncate">{nomeArquivo || 'Clique para anexar comprovante'}</span>
              <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleArquivo} />
            </label>
            {comprovante && (
              <a href={comprovante} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">Ver anexo</a>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={loading || uploadando}>Cancelar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => onConfirm(dataQuitacao, comprovante, contaBancariaId)}
              disabled={loading || uploadando || !dataQuitacao || !contaBancariaId}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar Quitação
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModalAnexarComprovante({ lote, onClose, onConfirm, loading }) {
  const [comprovante, setComprovante] = useState(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [uploadando, setUploadando] = useState(false);

  useEffect(() => {
    if (!lote) { setComprovante(null); setNomeArquivo(''); }
  }, [lote]);

  const handleArquivo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadando(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setComprovante(file_url);
      setNomeArquivo(file.name);
    } catch {
      toast.error('Erro ao fazer upload do comprovante');
    } finally {
      setUploadando(false);
    }
  };

  return (
    <Dialog open={!!lote} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Anexar Comprovante</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm text-slate-600">Protocolo: <span className="font-semibold">{lote?._protocolo}</span></p>
            <p className="text-sm text-slate-600">Valor: <span className="font-semibold">{lote ? fmt(lote._total) : ''}</span></p>
          </div>
          <div className="space-y-1">
            <Label>Comprovante</Label>
            <label className="flex items-center gap-2 cursor-pointer border border-dashed border-slate-300 rounded-md px-3 py-2 hover:bg-slate-50 transition-colors">
              {uploadando ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : <Paperclip className="w-4 h-4 text-slate-400" />}
              <span className="text-xs text-slate-500 truncate">{nomeArquivo || 'Clique para anexar comprovante'}</span>
              <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleArquivo} />
            </label>
            {comprovante && (
              <a href={comprovante} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">Ver anexo</a>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={loading || uploadando}>Cancelar</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => onConfirm(lote, comprovante)}
              disabled={loading || uploadando || !comprovante}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar Comprovante
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabelaLotes({ titulo, lotes, colunas, emptyMsg, cor, onQuitar, onReprogramar, mostrarQuitacao, isMaster, onAnexarComprovante, podeQuitar, onExcluir }) {
  const total = lotes.reduce((acc, l) => ({
    valor: acc.valor + (l._valor || 0),
    acrescimos: acc.acrescimos + (l.acrescimos || 0),
    descontos: acc.descontos + (l.descontos || 0),
    total: acc.total + (l._total || 0),
  }), { valor: 0, acrescimos: 0, descontos: 0, total: 0 });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-700">{titulo}</h2>
        {lotes.length > 0 && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => exportarCSV(titulo, lotes, colunas, mostrarQuitacao)}>
              <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" /> Excel
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => exportarPDF(titulo, lotes, colunas, mostrarQuitacao)}>
              <FileText className="w-3.5 h-3.5 text-red-600" /> PDF
            </Button>
          </div>
        )}
      </div>
      <div className="rounded-lg border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={`${cor} text-white`}>
            <tr>
              {colunas.map(c => (
                <th key={c} className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {lotes.length === 0 ? (
              <tr>
                <td colSpan={colunas.length} className="px-3 py-6 text-center text-slate-400 text-xs">{emptyMsg}</td>
              </tr>
            ) : (
              lotes.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">{l._protocolo}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(l.data_pagamento)}</td>
                  {mostrarQuitacao && (
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(l.data_quitacao)}</td>
                  )}
                  <td className="px-3 py-2 text-xs font-medium whitespace-nowrap">{fmt(l._valor)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{fmt(l.acrescimos || 0)}</td>
                  <td className="px-3 py-2 text-xs text-red-600 whitespace-nowrap">{fmt(l.descontos || 0)}</td>
                  <td className="px-3 py-2 text-xs font-bold text-slate-800 whitespace-nowrap">{fmt(l._total)}</td>
                  {isMaster && (
                    <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{l.vendedor_nome || '-'}</td>
                  )}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={l.status === 'quitado'
                          ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                          : podeQuitar
                            ? 'border-amber-300 text-amber-700 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors'
                            : 'border-amber-300 text-amber-700 bg-amber-50'}
                        onClick={l.status !== 'quitado' && podeQuitar ? () => onQuitar(l) : (l.status === 'quitado' && onReprogramar ? () => onReprogramar(l) : undefined)}
                      >
                        {l.status === 'quitado' ? 'Quitado' : 'Programado'}
                      </Badge>
                      {l.status === 'quitado' && (
                        l.comprovante_url ? (
                          <a
                            href={l.comprovante_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ver comprovante de pagamento"
                            className="p-1 rounded hover:bg-blue-100 text-blue-600 transition-colors"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                          </a>
                        ) : onAnexarComprovante ? (
                          <button
                            title="Anexar comprovante"
                            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            onClick={() => onAnexarComprovante(l)}
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                          </button>
                        ) : null
                      )}
                      <button title="Baixar Excel" onClick={() => exportarLinhaCSV(l, mostrarQuitacao)} className="p-1 rounded hover:bg-green-100 text-green-700 transition-colors">
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      </button>
                      <button title="Baixar PDF" onClick={() => exportarLinhaPDF(l)} className="p-1 rounded hover:bg-red-100 text-red-700 transition-colors">
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      {onExcluir && l.status !== 'quitado' && !l.isLegado && (
                        <button title="Excluir lote" onClick={() => onExcluir(l)} className="p-1 rounded hover:bg-red-100 text-red-500 hover:text-red-700 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Saques() {
  const [user, setUser] = useState(null);
  const [colab, setColab] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loteParaQuitar, setLoteParaQuitar] = useState(null);
  const [loteParaReprogramar, setLoteParaReprogramar] = useState(null);
  const [loteParaComprovante, setLoteParaComprovante] = useState(null);
  const [loteParaExcluir, setLoteParaExcluir] = useState(null);
  const [excluindo, setExcluindo] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [reprogramando, setReprogramando] = useState(false);
  const [anexandoComprovante, setAnexandoComprovante] = useState(false);
  const [lancandoFinanceiro, setLancandoFinanceiro] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id }, '-created_date', 5);
      if (colabs?.length > 0) setColab(colabs[0]);
    } finally {
      setLoadingUser(false);
    }
  };

  const perfil = colab?.perfil || user?.role || '';
  const isMaster = ['master', 'super_admin', 'admin', 'gerente'].includes(perfil);
  const empresaId = colab?.empresa_id || user?.empresa_id;

  const userLoaded = !loadingUser && !!user;
  const filtroBase = empresaId ? { empresa_id: empresaId } : {};

  const { data: lotesEmp = [], isLoading: l1 } = useQuery({
    queryKey: ['lotes-emp', empresaId, colab?.id],
    enabled: userLoaded,
    throwOnError: false,
    queryFn: () => base44.entities.LotePagamentoComissaoEmprestimo.filter(
      isMaster ? filtroBase : { ...filtroBase, vendedor_id: colab?.id || user?.id },
      '-created_date', 500
    ),
  });

  const { data: propostasLegado = [], isLoading: l3 } = useQuery({
    queryKey: ['propostas-emp-pagas-legado-saques', empresaId, colab?.id],
    enabled: userLoaded,
    throwOnError: false,
    queryFn: () => {
      const filter = { produto: 'emprestimo', comissao_vendedor_paga: true };
      if (empresaId) filter.empresa_id = empresaId;
      if (!isMaster && (colab?.id || user?.id)) filter.vendedor_id = colab?.id || user?.id;
      return base44.entities.Proposta.filter(filter, '-comissao_vendedor_data_pagamento', 1000);
    },
  });

  const { data: contasBancarias = [] } = useQuery({
    queryKey: ['contas-bancarias-saques', empresaId],
    enabled: userLoaded && !!empresaId,
    queryFn: () => base44.entities.ContaBancaria.filter({ empresa_id: empresaId, status: 'ativa' }),
  });

  const { data: lotesConsorcio = [], isLoading: l2 } = useQuery({
    queryKey: ['lotes-consorcio', empresaId, colab?.id],
    enabled: userLoaded,
    throwOnError: false,
    queryFn: () => base44.entities.PagamentoComissaoLote.filter(
      isMaster ? filtroBase : { ...filtroBase, vendedor_id: colab?.id || user?.id },
      '-created_date', 500
    ),
  });

  const quitarMutation = useMutation({
    mutationFn: async ({ id, tipo, dataQuitacao, comprovante_url, conta_bancaria_id }) => {
      const payload = {
        status: 'quitado',
        data_quitacao: dataQuitacao,
        ...(comprovante_url ? { comprovante_url } : {}),
        ...(conta_bancaria_id ? { conta_bancaria_id } : {}),
      };
      if (tipo === 'emp') {
        await base44.entities.LotePagamentoComissaoEmprestimo.update(id, payload);
      } else {
        await base44.entities.PagamentoComissaoLote.update(id, payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lotes-emp'] });
      queryClient.invalidateQueries({ queryKey: ['lotes-consorcio'] });
      toast.success('Comissão marcada como quitada!');
      setLoteParaQuitar(null);
      setQuitando(false);
    },
    onError: () => {
      toast.error('Erro ao quitar comissão');
      setQuitando(false);
    },
  });

  const handleConfirmarQuitacao = (dataQuitacao, comprovante_url, conta_bancaria_id) => {
    if (!loteParaQuitar) return;
    setQuitando(true);
    quitarMutation.mutate({ id: loteParaQuitar.id, tipo: loteParaQuitar._tipo, dataQuitacao, comprovante_url, conta_bancaria_id });
  };

  const reprogramarMutation = useMutation({
    mutationFn: async ({ id, tipo }) => {
      const payload = { status: 'programado', data_quitacao: null, comprovante_url: null };
      if (tipo === 'emp') {
        await base44.entities.LotePagamentoComissaoEmprestimo.update(id, payload);
      } else {
        await base44.entities.PagamentoComissaoLote.update(id, payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lotes-emp'] });
      queryClient.invalidateQueries({ queryKey: ['lotes-consorcio'] });
      toast.success('Comissão reprogramada com sucesso!');
      setLoteParaReprogramar(null);
      setReprogramando(false);
    },
    onError: () => {
      toast.error('Erro ao reprogramar comissão');
      setReprogramando(false);
    },
  });

  const handleAnexarComprovante = async (lote, comprovanteUrl) => {
    setAnexandoComprovante(true);
    try {
      if (lote._tipo === 'emp') {
        await base44.entities.LotePagamentoComissaoEmprestimo.update(lote.id, { comprovante_url: comprovanteUrl });
      } else {
        await base44.entities.PagamentoComissaoLote.update(lote.id, { comprovante_url: comprovanteUrl });
      }
      queryClient.invalidateQueries({ queryKey: ['lotes-emp'] });
      queryClient.invalidateQueries({ queryKey: ['lotes-consorcio'] });
      toast.success('Comprovante anexado com sucesso!');
      setLoteParaComprovante(null);
    } catch {
      toast.error('Erro ao anexar comprovante');
    } finally {
      setAnexandoComprovante(false);
    }
  };

  const handleLancarFinanceiro = async () => {
    const pendentes = quitados.filter(l => !l.meu_financeiro_receita_id && !l.isLegado);
    if (pendentes.length === 0) {
      toast.info('Todas as comissões quitadas já foram lançadas no Meu Financeiro.');
      return;
    }
    setLancandoFinanceiro(true);
    let sucessos = 0;
    let erros = 0;
    for (const lote of pendentes) {
      try {
        const receita = await base44.entities.MeuFinanceiroReceita.create({
          empresa_id: empresaId,
          usuario_id: colab?.user_id || user?.id,
          usuario_nome: colab?.nome || user?.full_name || '',
          descricao: `Comissão — ${lote._protocolo}`,
          categoria: 'Comissão',
          valor: lote._total,
          data: lote.data_quitacao || lote.data_pagamento || new Date().toISOString().slice(0, 10),
          status: 'recebida',
          data_recebimento: lote.data_quitacao || lote.data_pagamento || new Date().toISOString().slice(0, 10),
          conta_bancaria_id: null,
          observacao: `Lançamento automático da comissão ${lote._protocolo} — ${lote._tipo === 'emp' ? 'Empréstimo' : lote._tipo === 'consorcio' ? 'Consórcio' : 'Legado'}`,
        });
        // Atualizar o lote com o ID da receita
        if (lote._tipo === 'emp') {
          await base44.entities.LotePagamentoComissaoEmprestimo.update(lote.id, { meu_financeiro_receita_id: receita.id });
        } else if (lote._tipo === 'consorcio') {
          await base44.entities.PagamentoComissaoLote.update(lote.id, { meu_financeiro_receita_id: receita.id });
        }
        sucessos++;
      } catch (e) {
        console.error('Erro ao lançar comissão:', lote._protocolo, e);
        erros++;
      }
    }
    queryClient.invalidateQueries({ queryKey: ['lotes-emp'] });
    queryClient.invalidateQueries({ queryKey: ['lotes-consorcio'] });
    setLancandoFinanceiro(false);
    if (erros === 0) {
      toast.success(`${sucessos} comissão(ões) lançada(s) no Meu Financeiro!`);
    } else {
      toast.warning(`${sucessos} lançada(s), ${erros} erro(s).`);
    }
  };

  const handleExcluirLote = async () => {
    if (!loteParaExcluir) return;
    setExcluindo(true);
    try {
      const res = await base44.functions.invoke('excluirLoteComissaoProgramado', {
        lote_id: loteParaExcluir.id,
        tipo: loteParaExcluir._tipo,
      });
      if (res.data?.success) {
        toast.success(res.data.message || 'Lote excluído e contratos revertidos com sucesso!');
      } else {
        toast.error(res.data?.error || 'Erro ao excluir lote');
      }
      queryClient.invalidateQueries({ queryKey: ['lotes-emp'] });
      queryClient.invalidateQueries({ queryKey: ['lotes-consorcio'] });
      setLoteParaExcluir(null);
    } catch (e) {
      toast.error('Erro ao excluir lote: ' + (e.message || ''));
    } finally {
      setExcluindo(false);
    }
  };

  const handleConfirmarReprogramacao = () => {
    if (!loteParaReprogramar) return;
    setReprogramando(true);
    reprogramarMutation.mutate({ id: loteParaReprogramar.id, tipo: loteParaReprogramar._tipo });
  };

  const normalizarEmp = (l) => ({
    ...l,
    status: l.status === 'programado' ? 'programado' : 'quitado',
    _protocolo: l.lote_codigo || `EMP${l.id?.slice(-6)}`,
    _valor: l.valor_total || 0,
    _total: (l.valor_total || 0) + (l.acrescimos || 0) - (l.descontos || 0),
    _data_quitacao: l.data_quitacao,
    _vendedor: isMaster ? l.vendedor_nome : undefined,
    _tipo: 'emp',
  });

  const legadoGrupos = {};
  propostasLegado.forEach(p => {
    const key = `legado_${p.vendedor_id || 'sv'}_${p.comissao_vendedor_data_pagamento || 'sem-data'}`;
    if (!legadoGrupos[key]) {
      legadoGrupos[key] = {
        id: key,
        status: 'quitado',
        vendedor_id: p.vendedor_id,
        vendedor_nome: p.vendedor_nome || 'Sem Vendedor',
        data_pagamento: p.comissao_vendedor_data_pagamento,
        data_quitacao: p.comissao_vendedor_data_pagamento,
        acrescimos: 0,
        descontos: 0,
        _protocolo: `LEG-${(p.vendedor_id || 'sv').slice(-4)}-${(p.comissao_vendedor_data_pagamento || '').replace(/-/g, '')}`,
        _valor: 0,
        _total: 0,
        _vendedor: isMaster ? (p.vendedor_nome || 'Sem Vendedor') : undefined,
        _tipo: 'emp-legado',
        isLegado: true,
      };
    }
    const val = p.valor_comissao_vendedor_pago || p.valor_comissao || 0;
    legadoGrupos[key]._valor += val;
    legadoGrupos[key]._total += val;
  });

  const normalizarCons = (l) => ({
    ...l,
    _protocolo: l.lote_code || `CONS${l.id?.slice(-6)}`,
    _valor: l.total_pago || 0,
    _total: (l.total_pago || 0) + (l.acrescimos || 0) - (l.descontos || 0),
    _data_quitacao: l.data_quitacao,
    _vendedor: isMaster ? l.vendedor_nome : undefined,
    _tipo: 'consorcio',
  });

  const lotesEmpNorm = lotesEmp.map(normalizarEmp);

  // Remover entradas legado que são duplicatas de um lote EMPC (mesmo vendedor + data + valor)
  const legadoFiltrado = Object.values(legadoGrupos).filter(leg =>
    !lotesEmpNorm.some(emp =>
      emp.vendedor_id === leg.vendedor_id &&
      emp.data_pagamento === leg.data_pagamento &&
      Math.abs(emp._total - leg._total) < 0.01
    )
  );

  const todos = [
    ...lotesEmpNorm,
    ...lotesConsorcio.map(normalizarCons),
    ...legadoFiltrado,
  ].sort((a, b) => new Date(b.data_pagamento || 0) - new Date(a.data_pagamento || 0));

  const programados = todos.filter(l => l.status !== 'quitado');
  const quitados = todos.filter(l => l.status === 'quitado');

  const totalProgramado = programados.reduce((a, l) => a + l._total, 0);
  const totalQuitado = quitados.reduce((a, l) => a + l._total, 0);

  const colunasProgr = isMaster
    ? ['Nº Protocolo', 'Data Programada', 'Valor Comissão', 'Acréscimos', 'Descontos', 'Total', 'Vendedor', 'Status / Ações']
    : ['Nº Protocolo', 'Data Programada', 'Valor Comissão', 'Acréscimos', 'Descontos', 'Total', 'Status / Ações'];

  const colunasQuit = isMaster
    ? ['Nº Protocolo', 'Data Programada', 'Data Quitação', 'Valor Comissão', 'Acréscimos', 'Descontos', 'Total', 'Vendedor', 'Status / Ações']
    : ['Nº Protocolo', 'Data Programada', 'Data Quitação', 'Valor Comissão', 'Acréscimos', 'Descontos', 'Total', 'Status / Ações'];

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-500 text-sm">Não foi possível carregar o usuário.</p>
      </div>
    );
  }

  const isLoading = l1 || l2 || l3;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Minhas Comissões</h1>
        <p className="text-sm text-slate-500 mt-0.5">Histórico de comissões programadas e quitadas</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-amber-50">
          <CardContent className="p-5 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-amber-700">Programado</p>
              <p className="text-xl font-bold text-amber-800">{fmt(totalProgramado)}</p>
              <p className="text-xs text-amber-600">{programados.length} lote(s)</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-emerald-50">
          <CardContent className="p-5 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-emerald-700">Quitado</p>
              <p className="text-xl font-bold text-emerald-800">{fmt(totalQuitado)}</p>
              <p className="text-xs text-emerald-600">{quitados.length} lote(s)</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-blue-50">
          <CardContent className="p-5 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-blue-700">Total Geral</p>
              <p className="text-xl font-bold text-blue-800">{fmt(totalProgramado + totalQuitado)}</p>
              <p className="text-xs text-blue-600">{todos.length} lote(s)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-8">
          <TabelaLotes
            titulo="Comissões Programadas"
            lotes={programados}
            colunas={colunasProgr}
            emptyMsg="Nenhuma comissão programada"
            cor="bg-slate-700"
            onQuitar={setLoteParaQuitar}
            mostrarQuitacao={false}
            isMaster={isMaster}
            podeQuitar={isMaster}
            onExcluir={isMaster ? setLoteParaExcluir : undefined}
          />
          {/* Botão Lançar no Meu Financeiro */}
          {quitados.filter(l => !l.meu_financeiro_receita_id && !l.isLegado).length > 0 && (
            <div className="flex items-center gap-2 justify-end">
              <span className="text-xs text-slate-400">{quitados.filter(l => !l.meu_financeiro_receita_id && !l.isLegado).length} comissão(ões) pendente(s) de lançamento</span>
              <Button
                size="sm"
                onClick={handleLancarFinanceiro}
                disabled={lancandoFinanceiro}
                className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              >
                {lancandoFinanceiro ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lançando...</>
                ) : (
                  <><ArrowUpCircle className="w-3.5 h-3.5" /> Lançar no Meu Financeiro</>
                )}
              </Button>
            </div>
          )}
          <TabelaLotes
            titulo="Comissões Quitadas"
            lotes={quitados}
            colunas={colunasQuit}
            emptyMsg="Nenhuma comissão quitada"
            cor="bg-slate-700"
            onQuitar={() => {}}
            onReprogramar={isMaster ? setLoteParaReprogramar : undefined}
            mostrarQuitacao={true}
            isMaster={isMaster}
            podeQuitar={isMaster}
            onAnexarComprovante={setLoteParaComprovante}
          />
        </div>
      )}

      <ModalQuitar
        lote={loteParaQuitar}
        onClose={() => setLoteParaQuitar(null)}
        onConfirm={handleConfirmarQuitacao}
        loading={quitando}
        contas={contasBancarias}
      />
      <ModalReprogramar
        lote={loteParaReprogramar}
        onClose={() => setLoteParaReprogramar(null)}
        onConfirm={handleConfirmarReprogramacao}
        loading={reprogramando}
      />
      <ModalAnexarComprovante
        lote={loteParaComprovante}
        onClose={() => setLoteParaComprovante(null)}
        onConfirm={handleAnexarComprovante}
        loading={anexandoComprovante}
      />

      {/* Modal confirmação exclusão */}
      <Dialog open={!!loteParaExcluir} onOpenChange={(v) => { if (!v) setLoteParaExcluir(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" /> Excluir Lote Programado
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-slate-700 text-sm">Tem certeza que deseja excluir este lote?</p>
            {loteParaExcluir && (
              <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                <p><span className="font-semibold">Protocolo:</span> {loteParaExcluir._protocolo}</p>
                <p><span className="font-semibold">Data:</span> {fmtDate(loteParaExcluir.data_pagamento)}</p>
                <p><span className="font-semibold">Valor:</span> {fmt(loteParaExcluir._total)}</p>
              </div>
            )}
            <p className="text-red-600 text-xs font-medium">⚠️ Esta ação não pode ser desfeita.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setLoteParaExcluir(null)} disabled={excluindo}>Cancelar</Button>
              <Button onClick={handleExcluirLote} disabled={excluindo} className="bg-red-600 hover:bg-red-700 text-white">
                {excluindo ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Excluindo...</> : <><Trash2 className="w-4 h-4 mr-2" />Confirmar Exclusão</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}