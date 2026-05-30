import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Phone, PhoneOff, PhoneIncoming,
  Mic, MicOff, Radio, AlertTriangle, RefreshCw, Terminal, ChevronDown, ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ChamadaEntrantePopup from './ChamadaEntrantePopup';
import { SIP_LOG } from './useSoftphone';

/**
 * Softphone Panel — EXCLUSIVAMENTE WebRTC via wss://app.nvoip.com.br:7443
 * Sem callback, sem API REST, sem chip, sem MicroSIP.
 */

const STATUS_CFG = {
  desconectado: { label: 'Desconectado',  color: 'bg-slate-100 text-slate-500',   dot: 'bg-slate-400',  pulse: false },
  conectando:   { label: 'Conectando...',  color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400', pulse: true  },
  registrado:   { label: 'Pronto',         color: 'bg-green-100 text-green-700',   dot: 'bg-green-500',  pulse: false },
  erro:         { label: 'Erro SIP',       color: 'bg-red-100 text-red-700',       dot: 'bg-red-500',    pulse: false },
};

const CALL_STATUS_CFG = {
  chamando:    { label: '⟳ Chamando...',   color: 'text-amber-300',  bg: 'bg-amber-500' },
  tocando:     { label: '☎ Tocando...',    color: 'text-blue-300',   bg: 'bg-blue-500'  },
  em_ligacao:  { label: null,              color: 'text-green-400',  bg: 'bg-green-500' },
};

export default function SoftphonePanel({ softphone, numbersip }) {
  const {
    sipStatus, erroMsg,
    chamadaAtiva, chamadaEntrante,
    realizarChamada, atenderChamada, rejeitarChamada, encerrarChamada, conectar,
  } = softphone;

  const [numero, setNumero] = useState('');
  const [mutado, setMutado] = useState(false);
  const [duracao, setDuracao] = useState(0);
  const [showDiag, setShowDiag] = useState(false);
  const [sipLogs, setSipLogs] = useState([]);
  const timerRef = useRef(null);
  const diagTimerRef = useRef(null);

  // Atualiza logs SIP a cada 500ms quando painel aberto
  useEffect(() => {
    if (showDiag) {
      setSipLogs(SIP_LOG.get());
      diagTimerRef.current = setInterval(() => setSipLogs(SIP_LOG.get()), 500);
    } else {
      clearInterval(diagTimerRef.current);
    }
    return () => clearInterval(diagTimerRef.current);
  }, [showDiag]);

  // Abre diagnóstico automaticamente quando há erro
  useEffect(() => {
    if (erroMsg) setShowDiag(true);
  }, [erroMsg]);

  // Timer de duração da chamada
  useEffect(() => {
    if (chamadaAtiva?.status === 'em_ligacao') {
      setDuracao(0);
      timerRef.current = setInterval(() => setDuracao(d => d + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      if (!chamadaAtiva) setDuracao(0);
    }
    return () => clearInterval(timerRef.current);
  }, [chamadaAtiva?.status]);

  // Reset mudo ao encerrar chamada
  useEffect(() => { if (!chamadaAtiva) setMutado(false); }, [chamadaAtiva]);

  const handleMutar = () => {
    const s = chamadaAtiva?.session;
    if (!s) return;
    mutado ? s.unmute({ audio: true }) : s.mute({ audio: true });
    setMutado(!mutado);
  };

  const handleLigar = () => {
    const num = numero.replace(/\D/g, '');
    if (!num || sipStatus !== 'registrado') return;
    console.log(`📞 [Softphone] Discando ${num} via wss://app.nvoip.com.br:7443`);
    realizarChamada(num);
    setNumero('');
  };

  const fmtDuracao = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const cfg = STATUS_CFG[sipStatus] || STATUS_CFG.desconectado;
  const callCfg = chamadaAtiva ? (CALL_STATUS_CFG[chamadaAtiva.status] || CALL_STATUS_CFG.chamando) : null;

  return (
    <>
      {/* Popup global chamada entrante */}
      <ChamadaEntrantePopup
        chamadaEntrante={chamadaEntrante}
        onAtender={atenderChamada}
        onRejeitar={rejeitarChamada}
      />

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden flex flex-col h-full">

        {/* Header */}
        <div className="bg-[#10353C] px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Radio className="w-4 h-4 text-[#23BE84] shrink-0" />
            <span className="font-semibold text-sm text-white">Webphone NVOIP</span>
            {numbersip && <span className="text-xs text-white/50 truncate">— {numbersip}</span>}
          </div>
          <Badge className={cn('text-xs border-0 shrink-0 gap-1', cfg.color)}>
            <span className={cn('w-2 h-2 rounded-full inline-block', cfg.dot, cfg.pulse && 'animate-pulse')} />
            {cfg.label}
          </Badge>
        </div>

        <div className="p-4 space-y-3 flex-1">

          {/* Chamada entrante inline */}
          {chamadaEntrante && (
            <div className="border-2 border-green-400 bg-green-50 rounded-xl p-3 text-center">
              <div className="flex items-center gap-2 justify-center text-green-700">
                <PhoneIncoming className="w-5 h-5 animate-bounce" />
                <span className="font-semibold text-sm">
                  {chamadaEntrante.clienteNome || chamadaEntrante.origem} — ligando...
                </span>
              </div>
            </div>
          )}

          {/* ── CHAMADA ATIVA ── */}
          {chamadaAtiva && !chamadaEntrante && (
            <div className="bg-slate-900 text-white rounded-xl p-5 text-center space-y-3">
              <div className={cn(
                'w-16 h-16 rounded-full mx-auto flex items-center justify-center',
                callCfg?.bg || 'bg-amber-500',
                chamadaAtiva.status !== 'em_ligacao' && 'animate-pulse'
              )}>
                <Phone className="w-8 h-8" />
              </div>
              <div>
                {chamadaAtiva.clienteNome && (
                  <p className="text-green-300 text-sm font-semibold">{chamadaAtiva.clienteNome}</p>
                )}
                <p className="font-bold text-xl tracking-wide">{chamadaAtiva.destino}</p>
                <p className="text-slate-400 text-xs mt-0.5">
                  {chamadaAtiva.direcao === 'saida' ? '↗ Saída — WebRTC' : '↙ Entrada — WebRTC'}
                </p>
              </div>

              {/* Status da chamada */}
              {chamadaAtiva.status === 'em_ligacao'
                ? <p className="text-3xl font-mono text-green-400 tabular-nums">{fmtDuracao(duracao)}</p>
                : <p className={cn('text-sm animate-pulse', callCfg?.color)}>{callCfg?.label}</p>
              }

              <div className="flex gap-2">
                <Button
                  onClick={handleMutar}
                  variant="outline"
                  size="sm"
                  className={cn(
                    'flex-1 border-white/20 text-white hover:bg-white/10 bg-transparent',
                    mutado && 'bg-red-600/40 border-red-400'
                  )}
                >
                  {mutado ? <MicOff className="w-4 h-4 mr-1" /> : <Mic className="w-4 h-4 mr-1" />}
                  {mutado ? 'Mudo' : 'Microfone'}
                </Button>
                <Button
                  onClick={() => {
                    try { encerrarChamada(); } catch {}
                  }}
                  size="sm"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  <PhoneOff className="w-4 h-4 mr-1" /> Encerrar
                </Button>
              </div>
            </div>
          )}

          {/* ── DISCADOR ── */}
          {!chamadaAtiva && !chamadaEntrante && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="DDD + número"
                  value={numero}
                  onChange={e => setNumero(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && handleLigar()}
                  className="flex-1 text-base"
                  autoFocus
                  disabled={sipStatus !== 'registrado'}
                />
                <Button
                  onClick={handleLigar}
                  disabled={!numero.trim() || sipStatus !== 'registrado'}
                  title={sipStatus !== 'registrado' ? `Aguarde o registro SIP (${sipStatus})` : 'Ligar via WebRTC'}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 disabled:opacity-40"
                >
                  <Phone className="w-4 h-4" />
                </Button>
              </div>

              {/* Teclado numérico */}
              <div className="grid grid-cols-3 gap-1.5">
                {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d => (
                  <button
                    key={d}
                    onClick={() => setNumero(p => p + d)}
                    disabled={sipStatus !== 'registrado'}
                    className="h-10 rounded-lg border bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 font-semibold text-sm transition-colors disabled:opacity-30 select-none"
                  >
                    {d}
                  </button>
                ))}
              </div>

              {/* Mensagem de erro SIP real */}
              {erroMsg && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                  ⚠️ {erroMsg}
                </div>
              )}

              {/* Status messages */}
              {sipStatus === 'registrado' && !erroMsg && (
                <p className="text-xs text-green-600 text-center font-medium">
                  ✓ Pronto — WSS registrado. Ligações saem direto pelo navegador.
                </p>
              )}
              {sipStatus === 'conectando' && (
                <p className="text-xs text-yellow-600 text-center animate-pulse">
                  ⟳ Registrando ramal no servidor SIP NVOIP...
                </p>
              )}
              {sipStatus === 'desconectado' && (
                <p className="text-xs text-slate-400 text-center">
                  Desconectado do servidor SIP
                </p>
              )}
              {sipStatus === 'erro' && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-2">
                  <p className="font-semibold">{erroMsg || '⚠️ Falha na conexão SIP'}</p>
                  {!erroMsg?.includes('Senha SIP') && (
                    <p className="text-red-700">Verifique a <strong>Senha SIP</strong> em "Meu Ramal".</p>
                  )}
                  <button
                    onClick={conectar}
                    className="flex items-center gap-1 text-blue-600 hover:underline font-medium"
                  >
                    <RefreshCw className="w-3 h-3" /> Reconectar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Alerta offline */}
        {sipStatus === 'erro' && (
          <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-center gap-2 text-xs text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Webphone offline. Chamadas recebidas não chegarão no CRM.</span>
          </div>
        )}

        {/* Botão + Painel de Diagnóstico SIP */}
        <div className="border-t">
          <button
            onClick={() => { setShowDiag(d => !d); if (!showDiag) setSipLogs(SIP_LOG.get()); }}
            className="w-full flex items-center justify-between px-4 py-2 bg-slate-50 hover:bg-slate-100 text-xs text-slate-500 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              Diagnóstico SIP
              {SIP_LOG.lastError && <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />}
            </span>
            {showDiag ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showDiag && (
            <div className="bg-slate-900 px-3 py-2 max-h-72 overflow-y-auto space-y-2">

              {/* Cards de status */}
              <div className="grid grid-cols-2 gap-1 pt-1">
                <div className={cn('rounded px-2 py-1 text-xs font-mono', sipStatus === 'registrado' ? 'bg-green-900 text-green-300' : 'bg-amber-900 text-amber-300')}>
                  <div className="text-slate-400 text-[10px]">WebSocket</div>
                  <div className="font-bold">{sipStatus === 'registrado' ? '✅ CONECTADO' : `⟳ ${sipStatus.toUpperCase()}`}</div>
                </div>
                <div className={cn('rounded px-2 py-1 text-xs font-mono', sipStatus === 'registrado' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300')}>
                  <div className="text-slate-400 text-[10px]">Registro SIP</div>
                  <div className="font-bold">{sipStatus === 'registrado' ? '✅ REGISTRADO' : '❌ NÃO REGISTRADO'}</div>
                </div>
                <div className={cn('rounded px-2 py-1 text-xs font-mono col-span-2', SIP_LOG.lastUri ? 'bg-blue-900 text-blue-300' : 'bg-slate-800 text-slate-500')}>
                  <div className="text-slate-400 text-[10px]">URI da chamada</div>
                  <div className="font-bold truncate">{SIP_LOG.lastUri ? SIP_LOG.lastUri.detalhe : '— nenhuma chamada ainda —'}</div>
                </div>
                {SIP_LOG.lastResponse && (
                  <div className={cn('rounded px-2 py-1 text-xs font-mono col-span-2',
                    SIP_LOG.lastResponse.tipo === '200_OK' ? 'bg-green-900 text-green-300'
                    : SIP_LOG.lastResponse.tipo.startsWith('4') || SIP_LOG.lastResponse.tipo.startsWith('5') || SIP_LOG.lastResponse.tipo.startsWith('6') ? 'bg-red-900 text-red-300'
                    : 'bg-purple-900 text-purple-300'
                  )}>
                    <div className="text-slate-400 text-[10px]">Última resposta SIP</div>
                    <div className="font-bold">{SIP_LOG.lastResponse.tipo} — {SIP_LOG.lastResponse.detalhe}</div>
                  </div>
                )}
                {SIP_LOG.lastError && (
                  <div className="rounded px-2 py-1 text-xs font-mono bg-red-900 text-red-300 col-span-2">
                    <div className="text-slate-400 text-[10px]">Último erro</div>
                    <div className="font-bold break-all">{SIP_LOG.lastError.detalhe}</div>
                    {SIP_LOG.lastError.extra?.www_auth && (
                      <div className="text-red-400 text-[10px] mt-0.5 break-all">Auth: {SIP_LOG.lastError.extra.www_auth}</div>
                    )}
                    {SIP_LOG.lastError.extra?.uri_usada && (
                      <div className="text-red-400 text-[10px] break-all">URI: {SIP_LOG.lastError.extra.uri_usada}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Separador */}
              <div className="border-t border-slate-700 pt-1">
                <p className="text-slate-500 text-[10px] mb-1 font-mono">— eventos SIP ({sipLogs.length}) —</p>
              </div>

              {/* Log stream */}
              {sipLogs.length === 0
                ? <p className="text-xs text-slate-500 italic font-mono">Nenhum evento ainda. Faça uma chamada para ver o diagnóstico.</p>
                : sipLogs.map((entry, i) => (
                  <div key={i} className="flex gap-1.5 text-xs font-mono leading-5 border-b border-slate-800 pb-0.5">
                    <span className="text-slate-600 shrink-0 w-10 text-[10px]">
                      {entry.ts?.split('T')[1]?.substring(0,8) || ''}
                    </span>
                    <span className={cn('shrink-0 font-bold w-24 truncate text-[10px]',
                      ['FAILED','ERROR','ICE_FAILED','TIMEOUT'].includes(entry.tipo)    ? 'text-red-400'
                      : ['REGISTERED','200_OK','ACK'].includes(entry.tipo)              ? 'text-green-400'
                      : ['INVITE','DIAL','MIC_OK'].includes(entry.tipo)                 ? 'text-yellow-400'
                      : ['100','180','183'].includes(entry.tipo)                        ? 'text-blue-400'
                      : ['RETRY','WS_CONNECTED','CONNECT'].includes(entry.tipo)         ? 'text-cyan-400'
                      : 'text-slate-400'
                    )}>[{entry.tipo}]</span>
                    <span className="text-slate-200 break-all text-[11px] leading-4 flex-1">{entry.detalhe}</span>
                  </div>
                ))
              }
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-4 py-1.5 border-t bg-slate-50 text-xs text-slate-400 text-center">
          WebRTC exclusivo via <span className="font-mono">wss://app.nvoip.com.br:7443</span>
        </div>
      </div>
    </>
  );
}