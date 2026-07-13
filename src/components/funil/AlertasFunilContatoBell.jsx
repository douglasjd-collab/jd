import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Bell, X, PhoneCall, Calendar, CheckCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';

export default function AlertasFunilContatoBell({ empresaId }) {
  const [alertas, setAlertas] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (empresaId) carregarAlertas();
  }, [empresaId]);

  const carregarAlertas = async () => {
    setLoading(true);
    try {
      const todos = await base44.entities.AlertaFunilContato.filter(
        { empresa_id: empresaId, status: 'ativo', lido: false },
        '-created_date',
        50
      );
      setAlertas(todos);
    } catch (e) {
      console.error('Erro ao carregar alertas de contato:', e);
    } finally {
      setLoading(false);
    }
  };

  const marcarLido = async (alerta) => {
    try {
      await base44.entities.AlertaFunilContato.update(alerta.id, { lido: true, lido_em: new Date().toISOString() });
      setAlertas(prev => prev.filter(a => a.id !== alerta.id));
    } catch (e) {
      toast.error('Erro ao marcar como lido');
    }
  };

  const marcarTodosLidos = async () => {
    try {
      for (const alerta of alertas) {
        await base44.entities.AlertaFunilContato.update(alerta.id, { lido: true, lido_em: new Date().toISOString() });
      }
      setAlertas([]);
      toast.success('Todos os alertas marcados como lidos');
    } catch (e) {
      toast.error('Erro ao marcar alertas');
    }
  };

  const abrirConversa = (alerta) => {
    setOpen(false);
    if (alerta.conversa_id) {
      navigate(`/BatePapo?conversa_id=${alerta.conversa_id}`);
    } else {
      navigate(createPageUrl(`OportunidadeDetalhes?id=${alerta.oportunidade_id}`));
    }
  };

  const naoLidos = alertas.length;

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open) carregarAlertas(); }}
        className="relative flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-sm"
        title="Alertas de Próximo Contato"
      >
        <Bell className="w-4 h-4 text-slate-600" />
        {naoLidos > 0 && (
          <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {naoLidos > 9 ? '9+' : naoLidos}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-[380px] bg-white rounded-xl shadow-2xl border border-slate-200 max-h-[520px] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-50 rounded-t-xl">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-sm text-slate-800">Clientes para Retomar Contato</span>
                {naoLidos > 0 && <Badge className="bg-blue-500 text-white text-xs px-1.5">{naoLidos}</Badge>}
              </div>
              <div className="flex items-center gap-1">
                {naoLidos > 0 && (
                  <button onClick={marcarTodosLidos} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100">
                    <CheckCheck className="w-3.5 h-3.5" /> Marcar todos
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-slate-100">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {loading && <div className="flex items-center justify-center py-8 text-slate-400 text-sm">Carregando...</div>}

              {!loading && alertas.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <PhoneCall className="w-8 h-8 mb-2 text-slate-300" />
                  <p className="text-sm font-medium">Nenhum lead esquecido</p>
                  <p className="text-xs mt-1">Nenhum cliente aguardando retorno hoje.</p>
                </div>
              )}

              {!loading && alertas.map(alerta => (
                <div key={alerta.id} className="p-3 border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${alerta.dias_atraso > 0 ? 'bg-red-500' : 'bg-blue-500'}`} />
                        <span className={`text-xs font-semibold ${alerta.dias_atraso > 0 ? 'text-red-600' : 'text-blue-600'}`}>
                          {alerta.dias_atraso > 0 ? `⚠️ ${alerta.dias_atraso} dia(s) em atraso` : '📞 Contato previsto para hoje'}
                        </span>
                      </div>

                      <button
                        className="text-sm font-semibold text-slate-800 hover:text-blue-600 text-left truncate block w-full"
                        onClick={() => abrirConversa(alerta)}
                      >
                        {alerta.cliente_nome || alerta.oportunidade_titulo}
                      </button>

                      {alerta.motivo && (
                        <p className="text-xs text-slate-600 mt-1 italic">💬 {alerta.motivo}</p>
                      )}

                      <div className="mt-1.5 space-y-0.5">
                        {alerta.cliente_telefone && <p className="text-xs text-slate-500">📱 {alerta.cliente_telefone}</p>}
                        {alerta.responsavel_nome && <p className="text-xs text-slate-400">👥 Resp: {alerta.responsavel_nome}</p>}
                      </div>

                      <button
                        onClick={() => abrirConversa(alerta)}
                        className="mt-2 flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-2 py-1 rounded-lg"
                      >
                        <PhoneCall className="w-3 h-3" /> Ir para a conversa
                      </button>
                    </div>

                    <button
                      onClick={() => marcarLido(alerta)}
                      className="flex-shrink-0 p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                      title="Marcar como lido"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {alertas.length > 0 && (
              <div className="px-4 py-2 border-t bg-slate-50 rounded-b-xl">
                <p className="text-xs text-slate-400 text-center flex items-center justify-center gap-1">
                  <Calendar className="w-3 h-3" /> Não deixe o cliente esquecido — retome o contato hoje!
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}