import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, CheckCircle, Clock, TrendingUp, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = (d) => d ? format(new Date(d + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : '-';

function ModalQuitar({ lote, onClose, onConfirm, loading }) {
  const [dataQuitacao, setDataQuitacao] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [comprovante, setComprovante] = useState(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [uploadando, setUploadando] = useState(false);

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
            <Input
              id="data_quitacao"
              type="date"
              value={dataQuitacao}
              onChange={e => setDataQuitacao(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Comprovante (opcional)</Label>
            <label className="flex items-center gap-2 cursor-pointer border border-dashed border-slate-300 rounded-md px-3 py-2 hover:bg-slate-50 transition-colors">
              {uploadando ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              ) : (
                <Paperclip className="w-4 h-4 text-slate-400" />
              )}
              <span className="text-xs text-slate-500 truncate">
                {nomeArquivo || 'Clique para anexar comprovante'}
              </span>
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
              onClick={() => onConfirm(dataQuitacao, comprovante)}
              disabled={loading || uploadando || !dataQuitacao}
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

function TabelaLotes({ titulo, lotes, colunas, emptyMsg, cor, onQuitar }) {
  const total = lotes.reduce((acc, l) => ({
    valor: acc.valor + (l._valor || 0),
    acrescimos: acc.acrescimos + (l.acrescimos || 0),
    descontos: acc.descontos + (l.descontos || 0),
    total: acc.total + (l._total || 0),
  }), { valor: 0, acrescimos: 0, descontos: 0, total: 0 });

  const temQuitacao = lotes[0]?._data_quitacao !== undefined;

  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold text-slate-700">{titulo}</h2>
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
              <tr><td colSpan={colunas.length} className="px-3 py-6 text-center text-slate-400 text-xs">{emptyMsg}</td></tr>
            ) : (
              <>
                {lotes.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">{l._protocolo}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(l.data_pagamento)}</td>
                    {temQuitacao && (
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(l.data_quitacao)}</td>
                    )}
                    <td className="px-3 py-2 text-xs font-medium whitespace-nowrap">{fmt(l._valor)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{fmt(l.acrescimos || 0)}</td>
                    <td className="px-3 py-2 text-xs text-red-600 whitespace-nowrap">{fmt(l.descontos || 0)}</td>
                    <td className="px-3 py-2 text-xs font-bold text-slate-800 whitespace-nowrap">{fmt(l._total)}</td>
                    {l._vendedor !== undefined && (
                      <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{l._vendedor}</td>
                    )}
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={l.status === 'quitado'
                          ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                          : 'border-amber-300 text-amber-700 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors'}
                        onClick={l.status !== 'quitado' ? () => onQuitar(l) : undefined}
                      >
                        {l.status === 'quitado' ? 'Quitado' : 'Programado'}
                      </Badge>
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200">
                  <td className="px-3 py-2 text-xs" colSpan={temQuitacao ? 3 : 2}>Total: {lotes.length}</td>
                  <td className="px-3 py-2 text-xs">{fmt(total.valor)}</td>
                  <td className="px-3 py-2 text-xs">{fmt(total.acrescimos)}</td>
                  <td className="px-3 py-2 text-xs text-red-600">{fmt(total.descontos)}</td>
                  <td className="px-3 py-2 text-xs">{fmt(total.total)}</td>
                  <td className="px-3 py-2" colSpan={2}></td>
                </tr>
              </>
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
  const [loteParaQuitar, setLoteParaQuitar] = useState(null);
  const [quitando, setQuitando] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
    const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' }, '-created_date', 1);
    if (colabs?.length > 0) setColab(colabs[0]);
  };

  const isMaster = user?.perfil === 'master' || user?.perfil === 'super_admin' || user?.perfil === 'admin';
  const empresaId = colab?.empresa_id || user?.empresa_id;

  const { data: lotesEmp = [], isLoading: l1 } = useQuery({
    queryKey: ['lotes-emp', empresaId, colab?.id],
    enabled: !!empresaId,
    queryFn: () => base44.entities.LotePagamentoComissaoEmprestimo.filter(
      isMaster ? { empresa_id: empresaId } : { empresa_id: empresaId, vendedor_id: colab?.id || user?.id },
      '-created_date', 500
    ),
  });

  const { data: lotesConsorcio = [], isLoading: l2 } = useQuery({
    queryKey: ['lotes-consorcio', empresaId, colab?.id],
    enabled: !!empresaId,
    queryFn: () => base44.entities.PagamentoComissaoLote.filter(
      isMaster ? { empresa_id: empresaId } : { empresa_id: empresaId, vendedor_id: colab?.id || user?.id },
      '-created_date', 500
    ),
  });

  const quitarMutation = useMutation({
    mutationFn: async ({ id, tipo, dataQuitacao, comprovante_url }) => {
      const payload = { status: 'quitado', data_quitacao: dataQuitacao, ...(comprovante_url ? { comprovante_url } : {}) };
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

  const handleConfirmarQuitacao = (dataQuitacao, comprovante_url) => {
    if (!loteParaQuitar) return;
    setQuitando(true);
    quitarMutation.mutate({ id: loteParaQuitar.id, tipo: loteParaQuitar._tipo, dataQuitacao, comprovante_url });
  };

  const normalizarEmp = (l) => ({
    ...l,
    _protocolo: l.lote_codigo || `EMP${l.id?.slice(-6)}`,
    _valor: l.valor_total || 0,
    _total: (l.valor_total || 0) + (l.acrescimos || 0) - (l.descontos || 0),
    _data_quitacao: l.data_quitacao,
    _vendedor: isMaster ? l.vendedor_nome : undefined,
    _tipo: 'emp',
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

  const todos = [
    ...lotesEmp.map(normalizarEmp),
    ...lotesConsorcio.map(normalizarCons),
  ].sort((a, b) => new Date(b.data_pagamento || 0) - new Date(a.data_pagamento || 0));

  const programados = todos.filter(l => l.status !== 'quitado');
  const quitados = todos.filter(l => l.status === 'quitado');

  const totalProgramado = programados.reduce((a, l) => a + l._total, 0);
  const totalQuitado = quitados.reduce((a, l) => a + l._total, 0);

  const colunasProgr = isMaster
    ? ['Nº Protocolo', 'Data Programada', 'Valor Comissão', 'Acréscimos', 'Descontos', 'Total', 'Vendedor', 'Status']
    : ['Nº Protocolo', 'Data Programada', 'Valor Comissão', 'Acréscimos', 'Descontos', 'Total', 'Status'];

  const colunasQuit = isMaster
    ? ['Nº Protocolo', 'Data Programada', 'Data Quitação', 'Valor Comissão', 'Acréscimos', 'Descontos', 'Total', 'Vendedor', 'Status']
    : ['Nº Protocolo', 'Data Programada', 'Data Quitação', 'Valor Comissão', 'Acréscimos', 'Descontos', 'Total', 'Status'];

  if (!user || !empresaId) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const isLoading = l1 || l2;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Minhas Comissões</h1>
          <p className="text-sm text-slate-500 mt-0.5">Histórico de comissões programadas e quitadas</p>
        </div>
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
          />
          <TabelaLotes
            titulo="Comissões Quitadas"
            lotes={quitados}
            colunas={colunasQuit}
            emptyMsg="Nenhuma comissão quitada"
            cor="bg-slate-700"
            onQuitar={() => {}}
          />
        </div>
      )}

      <ModalQuitar
        lote={loteParaQuitar}
        onClose={() => setLoteParaQuitar(null)}
        onConfirm={handleConfirmarQuitacao}
        loading={quitando}
      />
    </div>
  );
}