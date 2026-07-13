import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Bot, X, CheckCheck, TrendingUp, PlusCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';

export default function NotificacoesIABell({ empresaId }) {
  const [notificacoes, setNotificacoes] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (empresaId) carregar();
  }, [empresaId]);

  const carregar = async () => {
    setLoading(true);
    try {
      const todas = await base44.entities.NotificacaoIA.filter(
        { empresa_id: empresaId, lido: false },
        '-created_date',
        50
      );
      setNotificacoes(todas);
    } catch (e) {
      console.error('Erro ao carregar notificações da IA:', e);
    } finally {
      setLoading(false);
    }
  };

  const marcarLida = async (notificacao) => {
    try {
      await base44.entities.NotificacaoIA.update(notificacao.id, { lido: true, lido_em: new Date().toISOString() });
      setNotificacoes(prev => prev.filter(n => n.id !== notificacao.id));
    } catch (e) {
      toast.error('Erro ao marcar como lida');
    }
  };

  const marcarTodasLidas = async () => {
    try {
      for (const n of notificacoes) {
        await base44.entities.NotificacaoIA.update(n.id, { lido: true, lido_em: new Date().toISOString() });
      }
      setNotificacoes([]);
      toast.success('Notificações marcadas como lidas');
    } catch (e) {
      toast.error('Erro ao marcar notificações');
    }
  };

  const abrirOportunidade = (notificacao) => {
    setOpen(false);
    if (notificacao.oportunidade_id) {
      navigate(createPageUrl(`OportunidadeDetalhes?id=${notificacao.oportunidade_id}`));
    }
  };

  const naoLidas = notificacoes.length;

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open) carregar(); }}
        className="relative flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-sm"
        title="Ações da IA no Funil"
      >
        <Bot className="w-4 h-4 text-purple-600" />
        {naoLidas > 0 && (
          <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-[380px] bg-white rounded-xl shadow-2xl border border-slate-200 max-h-[520px] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-purple-50 rounded-t-xl">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-purple-600" />
                <span className="font-semibold text-sm text-slate-800">Ações da Coach IA</span>
                {naoLidas > 0 && <Badge className="bg-purple-600 text-white text-xs px-1.5">{naoLidas}</Badge>}
              </div>
              <div className="flex items-center gap-1">
                {naoLidas > 0 && (
                  <button onClick={marcarTodasLidas} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100">
                    <CheckCheck className="w-3.5 h-3.5" /> Marcar todas
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-slate-100">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {loading && <div className="flex items-center justify-center py-8 text-slate-400 text-sm">Carregando...</div>}

              {!loading && notificacoes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <Bot className="w-8 h-8 mb-2 text-slate-300" />
                  <p className="text-sm font-medium">Nenhuma ação recente</p>
                  <p className="text-xs mt-1">A IA ainda não criou ou movimentou leads.</p>
                </div>
              )}

              {!loading && notificacoes.map(notificacao => (
                <div key={notificacao.id} className="p-3 border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {notificacao.tipo === 'lead_criado' ? (
                          <span className="text-xs font-semibold text-green-600 flex items-center gap-1"><PlusCircle className="w-3.5 h-3.5" /> Lead adicionado ao funil</span>
                        ) : (
                          <span className="text-xs font-semibold text-blue-600 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> Card movimentado</span>
                        )}
                      </div>

                      <button
                        className="text-sm font-semibold text-slate-800 hover:text-purple-600 text-left truncate block w-full"
                        onClick={() => abrirOportunidade(notificacao)}
                      >
                        {notificacao.cliente_nome || notificacao.oportunidade_titulo}
                      </button>

                      <p className="text-xs text-slate-600 mt-1">{notificacao.mensagem}</p>

                      {notificacao.etapa_nome && (
                        <p className="text-xs text-slate-500 mt-1">📍 Etapa: {notificacao.etapa_nome}</p>
                      )}
                    </div>

                    <button
                      onClick={() => marcarLida(notificacao)}
                      className="flex-shrink-0 p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                      title="Marcar como lido"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}