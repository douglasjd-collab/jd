import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, CalendarClock, RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_STYLE = {
  agendada: { label: 'Agendada', color: 'bg-blue-100 text-blue-700', icon: Clock },
  enviada:  { label: 'Enviada',  color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  cancelada:{ label: 'Cancelada',color: 'bg-slate-100 text-slate-500', icon: XCircle },
  falha:    { label: 'Falha',    color: 'bg-red-100 text-red-600', icon: AlertCircle },
};

export default function MensagensAgendadasModal({ open, onOpenChange, empresaId }) {
  const [mensagens, setMensagens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState('agendada');

  const carregar = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const todas = await base44.entities.MensagemAgendada.filter(
        { empresa_id: empresaId },
        '-created_date',
        200
      );
      setMensagens(todas);
    } catch (e) {
      toast.error('Erro ao carregar mensagens agendadas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) carregar();
  }, [open, empresaId]);

  const cancelar = async (msg) => {
    if (!confirm('Cancelar este agendamento?')) return;
    try {
      await base44.entities.MensagemAgendada.update(msg.id, { status: 'cancelada' });
      setMensagens(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'cancelada' } : m));
      toast.success('Agendamento cancelado');
    } catch (e) {
      toast.error('Erro ao cancelar: ' + e.message);
    }
  };

  const excluir = async (msg) => {
    if (!confirm('Excluir permanentemente este agendamento?')) return;
    try {
      await base44.entities.MensagemAgendada.delete(msg.id);
      setMensagens(prev => prev.filter(m => m.id !== msg.id));
      toast.success('Agendamento excluído');
    } catch (e) {
      toast.error('Erro ao excluir: ' + e.message);
    }
  };

  const filtradas = mensagens.filter(m => filtro === 'todas' || m.status === filtro);

  const contadores = {
    todas:     mensagens.length,
    agendada:  mensagens.filter(m => m.status === 'agendada').length,
    enviada:   mensagens.filter(m => m.status === 'enviada').length,
    falha:     mensagens.filter(m => m.status === 'falha').length,
    cancelada: mensagens.filter(m => m.status === 'cancelada').length,
  };

  const formatarData = (data, hora) => {
    if (!data) return '—';
    try {
      return `${format(parseISO(data), "dd/MM/yyyy", { locale: ptBR })} às ${hora || '—'}`;
    } catch {
      return data;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-blue-600" />
            Mensagens Agendadas
          </DialogTitle>
        </DialogHeader>

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'agendada', label: 'Agendadas' },
            { key: 'enviada',  label: 'Enviadas' },
            { key: 'falha',    label: 'Falhas' },
            { key: 'cancelada',label: 'Canceladas' },
            { key: 'todas',    label: 'Todas' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-all ${
                filtro === f.key
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f.label} ({contadores[f.key]})
            </button>
          ))}
          <button onClick={carregar} className="ml-auto text-slate-400 hover:text-slate-600" title="Atualizar">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : filtradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <CalendarClock className="w-10 h-10 opacity-30" />
              <p className="text-sm">Nenhuma mensagem neste filtro</p>
            </div>
          ) : filtradas.map(msg => {
            const s = STATUS_STYLE[msg.status] || STATUS_STYLE.agendada;
            const Icon = s.icon;
            return (
              <div key={msg.id} className="border rounded-xl p-3 bg-white flex gap-3 items-start shadow-sm">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${s.color}`}>
                      <Icon className="w-3 h-3" />
                      {s.label}
                    </span>
                    {msg.tipo === 'recorrente' && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                        Mensal
                      </span>
                    )}
                    <span className="text-xs text-slate-400 ml-auto">
                      {formatarData(msg.data_envio, msg.hora_envio)}
                    </span>
                  </div>

                  <p className="text-sm text-slate-800 font-medium truncate mb-0.5">
                    📱 {msg.telefone}
                    {msg.responsavel_nome && <span className="text-slate-400 font-normal"> · {msg.responsavel_nome}</span>}
                  </p>
                  <p className="text-xs text-slate-500 line-clamp-2">{msg.mensagem}</p>

                  {msg.status === 'falha' && msg.erro_detalhe && (
                    <p className="text-xs text-red-500 mt-1">⚠️ {msg.erro_detalhe}</p>
                  )}
                  {msg.proxima_execucao && msg.tipo === 'recorrente' && msg.status === 'agendada' && (
                    <p className="text-xs text-purple-500 mt-1">
                      Próximo envio: {format(new Date(msg.proxima_execucao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  )}
                </div>

                {/* Ações */}
                <div className="flex flex-col gap-1 flex-shrink-0">
                  {msg.status === 'agendada' && (
                    <button
                      onClick={() => cancelar(msg)}
                      className="text-xs text-orange-500 hover:text-orange-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-orange-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancelar
                    </button>
                  )}
                  <button
                    onClick={() => excluir(msg)}
                    className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}