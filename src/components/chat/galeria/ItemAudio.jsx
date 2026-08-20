import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, MapPin, Play, Pause, Loader2 } from 'lucide-react';
import { formatarDataHora } from './helpers';

const VELOCIDADES = [1, 1.5, 2];

function formatarDuracao(seg) {
  if (!seg || !isFinite(seg)) return '0:00';
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Item de áudio com reprodutor nativo, controle de velocidade 1x/1,5x/2x,
 * download e botão "Localizar na conversa".
 */
export default function ItemAudio({ mensagem, onLocalizarMensagem }) {
  const audioRef = useRef(null);
  const [tocando, setTocando] = useState(false);
  const [duracao, setDuracao] = useState(0);
  const [atual, setAtual] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [velocidade, setVelocidade] = useState(1);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onLoad = () => { setDuracao(a.duration || 0); setCarregando(false); };
    const onTime = () => setAtual(a.currentTime || 0);
    const onEnd = () => { setTocando(false); setAtual(0); };
    const onWaiting = () => setCarregando(true);
    const onPlaying = () => setCarregando(false);
    a.addEventListener('loadedmetadata', onLoad);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    a.addEventListener('waiting', onWaiting);
    a.addEventListener('playing', onPlaying);
    return () => {
      a.removeEventListener('loadedmetadata', onLoad);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('waiting', onWaiting);
      a.removeEventListener('playing', onPlaying);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (tocando) { a.pause(); setTocando(false); }
    else { a.play().then(() => setTocando(true)).catch(() => {}); }
  };

  const alterarVelocidade = () => {
    const idx = VELOCIDADES.indexOf(velocidade);
    const nova = VELOCIDADES[(idx + 1) % VELOCIDADES.length];
    setVelocidade(nova);
    if (audioRef.current) audioRef.current.playbackRate = nova;
  };

  const avancar = (pct) => {
    const a = audioRef.current;
    if (!a || !duracao) return;
    a.currentTime = (pct / 100) * duracao;
    setAtual(a.currentTime);
  };

  const remetenteLabel = mensagem.remetente === 'vendedor' ? 'Enviado' : 'Recebido';
  const progressoPct = duracao ? (atual / duracao) * 100 : 0;

  return (
    <div className="flex flex-col gap-1 p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="h-9 w-9 shrink-0 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center"
          aria-label={tocando ? 'Pausar' : 'Reproduzir'}
        >
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="relative h-1.5 bg-slate-200 rounded-full overflow-hidden cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = ((e.clientX - rect.left) / rect.width) * 100;
              avancar(pct);
            }}
          >
            <div className="absolute left-0 top-0 bottom-0 bg-emerald-500 rounded-full" style={{ width: `${progressoPct}%` }} />
          </div>
          <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
            <span>{formatarDuracao(atual)}</span>
            <span>{formatarDuracao(duracao)}</span>
          </div>
        </div>

        <button
          onClick={alterarVelocidade}
          className="shrink-0 text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 min-w-[36px]"
          title="Velocidade de reprodução"
        >
          {velocidade}x
        </button>

        <a href={mensagem.arquivo_url} download={mensagem.arquivo_nome || 'audio.mp3'} target="_blank" rel="noreferrer" className="shrink-0">
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Baixar áudio">
            <Download className="h-4 w-4 text-slate-600" />
          </Button>
        </a>

        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          title="Localizar na conversa"
          onClick={() => onLocalizarMensagem?.(mensagem.id)}
        >
          <MapPin className="h-4 w-4 text-slate-600" />
        </Button>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${mensagem.remetente === 'vendedor' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {remetenteLabel}
        </span>
        <span>•</span>
        <span>{formatarDataHora(mensagem.data_envio || mensagem.created_date)}</span>
        {mensagem.arquivo_nome && (
          <>
            <span>•</span>
            <span className="truncate">{mensagem.arquivo_nome}</span>
          </>
        )}
      </div>

      {mensagem.texto && mensagem.texto.trim() && (
        <p className="text-[11px] text-slate-500 mt-0.5 italic truncate">"{mensagem.texto}"</p>
      )}

      <audio ref={audioRef} src={mensagem.arquivo_url} preload="none" className="hidden" />
    </div>
  );
}