import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Ban, CheckCircle2, GripVertical, Maximize2, Minus, Phone, Play, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const SINAL_VALIDO_MS = 3 * 60000;

const tempoRelativo = (iso) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h}h${min % 60 ? ` ${min % 60}min` : ''}`;
};

export default function CampanhaMonitorGlobal({ empresaId }) {
  const qc = useQueryClient();
  const [minimizado, setMinimizado] = useState(false);
  const [posicao, setPosicao] = useState({ x: 24, y: 24 });
  const [agindo, setAgindo] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const arrasteRef = useRef(null);

  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: campanhas = [] } = useQuery({
    queryKey: ['campanha-monitor-global', empresaId],
    queryFn: () => base44.entities.Campanha.filter({ empresa_id: empresaId, status: { $in: ['executando', 'pausada'] } }, '-created_date', 100),
    enabled: !!empresaId,
    refetchInterval: 2000,
  });
  const campanha = useMemo(
    () => campanhas.find(c => c.status === 'executando')
      || campanhas.find(c => c.status === 'pausada' && c.inicio_execucao) || null,
    [campanhas]
  );
  const { data: destinatarios = [] } = useQuery({
    queryKey: ['campanha-monitor-destinatarios', campanha?.id],
    queryFn: () => base44.entities.CampanhaDestinatario.filter({ campanha_id: campanha.id }, '-data_envio', 500),
    enabled: !!campanha?.id,
    refetchInterval: 2000,
  });

  if (!campanha) return null;

  const total = Number(campanha.total_destinatarios || destinatarios.length || 0);
  const enviadosLista = destinatarios.filter((d) => ['enviada', 'entregue', 'lida', 'respondida'].includes(d.status));
  const falhasLista = destinatarios.filter((d) => ['falhou', 'numero_invalido', 'sem_whatsapp', 'bloqueado'].includes(d.status));
  const revisarLista = destinatarios.filter((d) => d.status === 'revisar');
  const enviados = Math.max(Number(campanha.enviados || 0), enviadosLista.length);
  const falhas = Math.max(Number(campanha.falhas || 0), falhasLista.length);
  const revisar = Math.max(Number(campanha.revisar || 0), revisarLista.length);
  const processados = Math.min(total, enviados + falhas + revisar);
  const percentual = total > 0 ? Math.round((processados / total) * 100) : 0;

  const executando = campanha.status === 'executando';
  const semSinal = executando && (!campanha.heartbeat_em
    || agora - new Date(campanha.heartbeat_em).getTime() > SINAL_VALIDO_MS);
  const proximoEmMs = campanha.proximo_envio_em ? new Date(campanha.proximo_envio_em).getTime() - agora : null;
  const proximoEmSegundos = proximoEmMs !== null && proximoEmMs > 0 ? Math.ceil(proximoEmMs / 1000) : null;

  const titulo = campanha.status === 'pausada'
    ? 'Disparo pausado'
    : semSinal ? 'Disparo sem sinal' : 'Disparo em andamento';

  const detalhe = campanha.status === 'pausada'
    ? (campanha.motivo_pausa || 'Pausado — os destinatários pendentes aguardam você retomar.')
    : semSinal
      ? `O servidor não dá sinal ${tempoRelativo(campanha.heartbeat_em)}. Você pode retomar com segurança.`
      : proximoEmSegundos !== null
        ? `Próximo envio em ${proximoEmSegundos}s`
        : 'Buscando o próximo envio…';

  const interromper = async () => {
    if (!window.confirm('Interromper este disparo? Os clientes ainda na fila não receberão a mensagem.')) return;
    setAgindo(true);
    try {
      await base44.entities.Campanha.update(campanha.id, {
        status: 'cancelada',
        fim_execucao: new Date().toISOString(),
        proximo_envio_em: null,
        motivo_pausa: 'Cancelada pelo usuário',
      });
      await base44.entities.CampanhaDestinatario.updateMany(
        { campanha_id: campanha.id, status: 'na_fila' },
        { $set: { status: 'cancelado', erro_mensagem: 'Envio interrompido pelo usuário' } }
      ).catch(() => {});
      toast.success('Disparo interrompido');
      qc.invalidateQueries({ queryKey: ['campanha-monitor-global', empresaId] });
      qc.invalidateQueries({ queryKey: ['campanhas-lista', empresaId] });
    } finally {
      setAgindo(false);
    }
  };

  const retomar = async () => {
    if (!window.confirm('Retomar este disparo? Somente os destinatários pendentes receberão a mensagem — quem já recebeu não é reenviado.')) return;
    setAgindo(true);
    try {
      await base44.functions.invoke('dispararCampanhaNaoOficial', { campanha_id: campanha.id, acao: 'retomar' });
      toast.success('Disparo retomado. Você pode acompanhar por aqui.');
      qc.invalidateQueries({ queryKey: ['campanha-monitor-global', empresaId] });
      qc.invalidateQueries({ queryKey: ['campanhas-lista', empresaId] });
    } catch (erro) {
      toast.error('Não foi possível retomar: ' + (erro?.message || 'erro desconhecido'));
    } finally {
      setAgindo(false);
    }
  };

  const iniciarArraste = (evento) => {
    const ponto = evento.touches?.[0] || evento;
    arrasteRef.current = { inicioX: ponto.clientX, inicioY: ponto.clientY, x: posicao.x, y: posicao.y };
    const mover = (e) => {
      const atual = e.touches?.[0] || e;
      if (!arrasteRef.current) return;
      setPosicao({
        x: Math.max(8, arrasteRef.current.x + arrasteRef.current.inicioX - atual.clientX),
        y: Math.max(8, arrasteRef.current.y + arrasteRef.current.inicioY - atual.clientY),
      });
    };
    const parar = () => {
      arrasteRef.current = null;
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', parar);
      window.removeEventListener('touchmove', mover);
      window.removeEventListener('touchend', parar);
    };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', parar);
    window.addEventListener('touchmove', mover, { passive: true });
    window.addEventListener('touchend', parar);
  };

  return (
    <div className="fixed z-[100] w-[380px] max-w-[calc(100vw-16px)] rounded-xl border border-emerald-200 bg-white shadow-2xl overflow-hidden"
      style={{ right: posicao.x, bottom: posicao.y }}>
      <div className={`flex items-center gap-2 px-3 py-2.5 text-white cursor-move select-none ${semSinal || campanha.status === 'pausada' ? 'bg-amber-600' : 'bg-emerald-600'}`}
        onMouseDown={iniciarArraste} onTouchStart={iniciarArraste}>
        <GripVertical className="w-4 h-4 opacity-80" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{titulo}</p>
          <p className="text-[11px] text-white/80 truncate">{campanha.nome}</p>
        </div>
        <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={() => setMinimizado((v) => !v)}
          className="p-1 rounded hover:bg-black/20" title={minimizado ? 'Expandir' : 'Minimizar'}>
          {minimizado ? <Maximize2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
        </button>
      </div>
      {!minimizado && (
        <div className="p-4 space-y-3">
          <p className={`text-xs rounded-lg px-2 py-1.5 ${semSinal || campanha.status === 'pausada' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
            {detalhe}
          </p>
          <div className="flex items-end justify-between">
            <div><p className="text-2xl font-bold text-slate-800">{enviados}</p><p className="text-xs text-slate-500">de {total} enviadas</p></div>
            <span className="text-sm font-semibold text-emerald-700">{percentual}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${percentual}%` }} /></div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>{Math.max(0, total - processados)} na fila</span>
            <span className={falhas ? 'text-red-600' : ''}>{falhas} falha(s)</span>
          </div>
          {revisar > 0 && (
            <p className="text-[11px] rounded-lg bg-amber-50 px-2 py-1.5 text-amber-800">
              {revisar} envio(s) com resultado incerto aguardando conferência no WhatsApp — não são reenviados automaticamente.
            </p>
          )}
          <div className="border-t pt-2">
            <p className="text-xs font-semibold text-slate-700 mb-1.5">Clientes processados</p>
            <div className="max-h-44 overflow-auto space-y-1">
              {destinatarios.filter((d) => d.status !== 'na_fila').map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs">
                  {['enviada', 'entregue', 'lida', 'respondida'].includes(d.status)
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    : d.status === 'enviando' ? <Phone className="w-3.5 h-3.5 text-blue-600" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                  <span className="flex-1 truncate">{d.cliente_nome || d.telefone}</span>
                  <span className="text-slate-400">{d.status === 'revisar' ? 'conferir' : d.status}</span>
                </div>
              ))}
              {!destinatarios.some((d) => d.status !== 'na_fila') && <p className="text-xs text-slate-400 py-2">Aguardando o primeiro envio…</p>}
            </div>
          </div>
          {campanha.status === 'pausada' || semSinal ? (
            <button type="button" onClick={retomar} disabled={agindo}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {agindo ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Retomar com segurança
            </button>
          ) : (
            <button type="button" onClick={interromper} disabled={agindo}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60">
              <Ban className="w-3.5 h-3.5" /> Interromper envio
            </button>
          )}
          <p className="text-[11px] text-slate-500">O envio continua no servidor mesmo com o CRM fechado.</p>
        </div>
      )}
    </div>
  );
}