import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Bell, X, MessageCircle, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function formatarHora(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const hoje = new Date();
    const isHoje = d.toDateString() === hoje.toDateString();
    return isHoje ? format(d, 'HH:mm') : format(d, 'dd/MM HH:mm');
  } catch { return ''; }
}

export default function AlertasTarefasPopup({ user, onAbrirTarefa }) {
  const [alertas, setAlertas] = useState([]);
  const [visto, setVisto] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!user?.colaborador_id) return;
    carregarAlertas();
    // Poll a cada 30s
    const interval = setInterval(carregarAlertas, 30000);
    return () => clearInterval(interval);
  }, [user?.colaborador_id]);

  // Abre popup automaticamente quando chega alerta novo
  useEffect(() => {
    if (alertas.length > 0 && !visto) {
      setAberto(true);
    }
  }, [alertas]);

  const carregarAlertas = async () => {
    if (!user?.colaborador_id) return;
    try {
      const lista = await base44.entities.AlertaTarefa.filter(
        { destinatario_id: user.colaborador_id, lido: false },
        '-created_date',
        20
      );
      setAlertas(lista);
    } catch {}
  };

  const marcarLido = async (alerta) => {
    await base44.entities.AlertaTarefa.update(alerta.id, { lido: true, lido_em: new Date().toISOString() });
    setAlertas(prev => prev.filter(a => a.id !== alerta.id));
  };

  const marcarTodosLidos = async () => {
    await Promise.all(alertas.map(a =>
      base44.entities.AlertaTarefa.update(a.id, { lido: true, lido_em: new Date().toISOString() })
    ));
    setAlertas([]);
    setAberto(false);
  };

  const handleAbrirTarefa = (alerta) => {
    marcarLido(alerta);
    onAbrirTarefa?.(alerta.tarefa_id);
    setAberto(false);
  };

  const naoLidos = alertas.length;

  if (naoLidos === 0 && !aberto) return null;

  return (
    <>
      {/* Popup modal */}
      {aberto && alertas.length > 0 && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-16 px-4 pointer-events-none">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md pointer-events-auto overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-[#1e3a5f] text-white">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                <span className="font-semibold">Novos comentários para você</span>
                <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {naoLidos}
                </span>
              </div>
              <button onClick={() => { setAberto(false); setVisto(true); }} className="text-white/70 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista */}
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {alertas.map(a => (
                <div key={a.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MessageCircle className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {a.tarefa_titulo || 'Tarefa'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <strong>{a.remetente_nome}</strong> mencionou você
                    </p>
                    {a.comentario_texto && (
                      <p className="text-xs text-slate-600 mt-1 bg-slate-50 rounded-lg px-2 py-1 line-clamp-2 italic">
                        "{a.comentario_texto}"
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">{formatarHora(a.created_date)}</p>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleAbrirTarefa(a)}
                      className="text-xs bg-[#1e3a5f] text-white px-3 py-1 rounded-full hover:bg-[#2a4a73] flex items-center gap-1"
                    >
                      Ver <ChevronRight className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => marcarLido(a)}
                      className="text-xs text-slate-400 hover:text-slate-600 text-center"
                    >
                      OK
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t bg-slate-50 flex justify-end">
              <button
                onClick={marcarTodosLidos}
                className="text-xs text-slate-500 hover:text-slate-700 font-medium"
              >
                Marcar todos como lidos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ícone flutuante quando popup fechado mas tem alertas */}
      {!aberto && naoLidos > 0 && (
        <button
          onClick={() => setAberto(true)}
          className="fixed bottom-6 right-6 z-[9998] bg-[#1e3a5f] text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg hover:bg-[#2a4a73] transition-colors"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {naoLidos}
          </span>
        </button>
      )}
    </>
  );
}