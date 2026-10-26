import { useCallback, useEffect, useRef, useState } from 'react';
import { startCallRingback } from './callRingback';
import { base44 } from '@/api/base44Client';

// O padrão da D-API é áudio em frames binários. Alguns deploys, porém, entregam
// os blocos de áudio em frames de texto com base64 — sem esse tratamento o som
// do contato é descartado silenciosamente (o socket fica "conectado e mudo").
const TIPOS_AUDIO_TEXTO = new Set(['audio', 'audio.chunk', 'audio_chunk', 'call.audio', 'pcm', 'media', 'chunk']);
function audioDeFrameTexto(msg) {
  const tipo = String(msg?.type || '').toLowerCase();
  if (!TIPOS_AUDIO_TEXTO.has(tipo)) return null;
  const b64 = msg.data || msg.audio || msg.pcm || msg.payload || msg.chunk;
  if (typeof b64 !== 'string' || b64.length < 16) return null;
  try {
    const bin = atob(b64.trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // Descarta cabeçalho RIFF/WAV quando presente.
    const inicio = (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) ? 44 : 0;
    const total = Math.floor((bytes.length - inicio) / 2);
    if (total <= 0) return null;
    const pcm = new Int16Array(total);
    const dv = new DataView(bytes.buffer, bytes.byteOffset + inicio, total * 2);
    for (let i = 0; i < total; i++) pcm[i] = dv.getInt16(i * 2, true);
    return pcm;
  } catch (_) {
    return null;
  }
}

// Worklet que converte Float32 (navegador) <-> Int16 (rede) para as Ligações por
// Stream da D-API (PCM s16le, 16kHz, mono, frames de 20ms = 320 amostras).
// A rede é sempre 16 kHz, mas o AudioContext pode rodar em outra taxa (48 kHz é
// comum e o Safari/Dockers ignoram a taxa pedida no construtor): por isso o
// reamostramento acontece aqui dentro, e não no construtor do contexto.
// Criado via Blob URL (sem depender de arquivo estático em /public).
const WORKLET_CODE = `
const NET = 16000;      // taxa da rede (D-API)
const FRAME = 320;      // 20 ms @ 16 kHz
const PREBUFFER = 1600; // ~100 ms de buffer de recepção
class VoipIO extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = Math.max(1, sampleRate / NET); // amostras do dispositivo por amostra da rede
    this.ring = new Float32Array(NET * 2);
    this.wr = 0; this.rd = 0; this.filled = 0;
    this.primed = false; this.frac = 0;
    this.upAcc = 0; this.upCnt = 0;
    this.outAccum = new Float32Array(FRAME); this.outLen = 0;
    this.port.onmessage = (e) => {
      if (e.data?.kind !== 'in') return;
      const i16 = new Int16Array(e.data.pcm);
      for (let i = 0; i < i16.length; i++) {
        this.ring[this.wr] = i16[i] / 32768;
        this.wr = (this.wr + 1) % this.ring.length;
        this.filled = Math.min(this.filled + 1, this.ring.length);
      }
    };
  }
  process(inputs, outputs) {
    // Uplink: microfone (taxa do dispositivo) -> 16 kHz -> frames de 320 amostras.
    const mic = inputs[0]?.[0];
    if (mic) {
      for (let i = 0; i < mic.length; i++) {
        this.upAcc += mic[i];
        this.upCnt += 1;
        if (this.upCnt >= this.ratio) {
          let v = this.upAcc / this.upCnt;
          this.upAcc = 0;
          this.upCnt -= this.ratio;
          v = v > 1 ? 1 : v < -1 ? -1 : v;
          this.outAccum[this.outLen++] = v;
          if (this.outLen === FRAME) {
            const i16 = new Int16Array(FRAME);
            for (let k = 0; k < FRAME; k++) i16[k] = this.outAccum[k] * 32767;
            this.port.postMessage({ kind: 'out', pcm: i16.buffer }, [i16.buffer]);
            this.outLen = 0;
          }
        }
      }
    }
    // Downlink: 16 kHz da rede -> taxa do dispositivo (interpolação linear).
    const out = outputs[0][0];
    const step = NET / sampleRate;
    const len = this.ring.length;
    for (let i = 0; i < out.length; i++) {
      if (!this.primed) {
        if (this.filled >= PREBUFFER) this.primed = true;
        else { out[i] = 0; continue; }
      }
      if (this.filled <= 0) { this.primed = false; out[i] = 0; continue; }
      const a = this.ring[this.rd];
      const b = this.ring[(this.rd + 1) % len];
      out[i] = a + (b - a) * this.frac;
      this.frac += step;
      if (this.frac >= 1) {
        const adv = Math.floor(this.frac);
        this.rd = (this.rd + adv) % len;
        this.filled = Math.max(0, this.filled - adv);
        this.frac -= adv;
      }
    }
    return true;
  }
}
registerProcessor('voip-io', VoipIO);
`;

const MOTIVOS_ENCERRAMENTO = {
  rejected: 'Chamada recusada',
  no_answer: 'Chamada não atendida',
  timeout: 'Sem resposta',
  accepted_elsewhere: 'Atendida em outro dispositivo',
  terminate: 'Tempo máximo de chamada atingido',
  ws_closed: 'Conexão da chamada caiu',
};

function mensagemErro(e) {
  const nome = e?.name;
  if (nome === 'NotAllowedError' || nome === 'SecurityError') {
    return 'Permissão de microfone negada. Libere o microfone para o site e tente novamente.';
  }
  if (nome === 'NotFoundError') return 'Nenhum microfone encontrado neste dispositivo.';
  const detalhe = e?.response?.data?.error || e?.response?.data?.message;
  return (typeof detalhe === 'string' && detalhe) || e?.message || 'Erro na chamada';
}

let chamadaLocalOcupada = null;

export default function useDapiCall() {
  const donoLocal = useRef(Symbol('chamada'));
  const [status, setStatus] = useState('idle'); // idle|calling|ringing|connected|ended|error
  const [erro, setErro] = useState(null);
  const [mutado, setMutado] = useState(false);
  const [via, setVia] = useState(null); // 'whatsapp' | 'operadora'
  // Telemetria da mídia: mostra se o áudio do outro lado está chegando e se o
  // microfone está saindo. Sem isso não dá para distinguir "conectou" de "mudo".
  const [audio, setAudio] = useState({ recebidos: 0, enviados: 0, taxa: null, eventos: [] });

  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const micStreamRef = useRef(null);
  const nodeRef = useRef(null);
  const canSendRef = useRef(false);
  const emChamadaRef = useRef(false);
  const ringbackStopRef = useRef(null);
  const monitorRef = useRef(null);
  const framesIn = useRef(0);
  const framesOut = useRef(0);
  const eventosRef = useRef([]);
  const pararSomChamada = useCallback(() => {
    ringbackStopRef.current?.();
    ringbackStopRef.current = null;
  }, []);

  const limpar = useCallback(() => {
    pararSomChamada();
    clearInterval(monitorRef.current);
    monitorRef.current = null;
    try { wsRef.current?.close(); } catch (_) {}
    wsRef.current = null;
    try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch (_) {}
    micStreamRef.current = null;
    try { audioCtxRef.current?.close(); } catch (_) {}
    audioCtxRef.current = null;
    nodeRef.current = null;
    canSendRef.current = false;
    emChamadaRef.current = false;
    if (chamadaLocalOcupada === donoLocal.current) chamadaLocalOcupada = null;
    setMutado(false);
  }, [pararSomChamada]);

  useEffect(() => () => limpar(), [limpar]);

  const encerrar = useCallback(() => {
    limpar();
    setStatus('idle');
    setVia(null);
  }, [limpar]);

  const alternarMudo = useCallback(() => {
    const track = micStreamRef.current?.getAudioTracks()?.[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMutado(!track.enabled);
  }, []);

  // Microfone e pipeline de áudio. É preparado ANTES de discar/atender: se o
  // microfone falhar, nenhuma chamada é criada e nada cai do outro lado.
  const prepararMidia = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microfone indisponível. Abra o sistema em uma aba própria e permita o microfone.');
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    // 16 kHz é o ideal, mas alguns navegadores (Safari/iOS) ignoram ou recusam a
    // taxa pedida. O worklet reamostra, então qualquer taxa serve.
    let ctx;
    try {
      ctx = new AudioContextClass({ sampleRate: 16000 });
    } catch (_) {
      ctx = new AudioContextClass();
    }
    audioCtxRef.current = ctx;
    await ctx.resume();

    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);
    try {
      await ctx.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }

    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    micStreamRef.current = mic;

    const node = new AudioWorkletNode(ctx, 'voip-io', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    nodeRef.current = node;
    ctx.createMediaStreamSource(mic).connect(node);
    node.connect(ctx.destination);

    node.port.onmessage = (ev) => {
      const ws = wsRef.current;
      if (ev.data?.kind === 'out' && canSendRef.current && ws?.readyState === WebSocket.OPEN) {
        framesOut.current += 1;
        ws.send(ev.data.pcm);
      }
    };
  }, []);

  // Abre o WebSocket de mídia e liga os eventos de ciclo de vida.
  // jaAtendida = chamada recebida que já foi atendida por nós (/calls/accept).
  const conectarMidia = useCallback(async (wsUrl, { jaAtendida = false } = {}) => {
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    await new Promise((resolve, reject) => {
      const prazo = setTimeout(() => reject(new Error('Não foi possível abrir o áudio da chamada')), 10000);
      ws.onopen = () => { clearTimeout(prazo); resolve(); };
      ws.onerror = () => { clearTimeout(prazo); reject(new Error('Não foi possível abrir o áudio da chamada')); };
    });

    let conectado = jaAtendida;
    if (jaAtendida) {
      canSendRef.current = true;
      pararSomChamada();
      setStatus('connected');
    }

    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        let msg = {};
        try { msg = JSON.parse(e.data); } catch (_) { return; }
        const tipo = String(msg.type || '');
        if (tipo && !eventosRef.current.includes(tipo)) eventosRef.current = [...eventosRef.current, tipo].slice(-6);
        const audioTexto = audioDeFrameTexto(msg);
        if (audioTexto) {
          framesIn.current += 1;
          nodeRef.current?.port.postMessage({ kind: 'in', pcm: audioTexto.buffer }, [audioTexto.buffer]);
          return;
        }
        switch (msg.type) {
          case 'calling':
            setStatus('calling');
            break;
          case 'ringing':
            setStatus('ringing');
            break;
          case 'accepted':
          case 'connected':
            pararSomChamada();
            conectado = true;
            canSendRef.current = true;
            setStatus('connected');
            break;
          case 'ended': {
            const motivo = MOTIVOS_ENCERRAMENTO[msg.reason];
            if (!conectado && motivo) {
              setErro(motivo);
              setStatus('error');
            } else {
              setStatus('ended');
            }
            limpar();
            break;
          }
          case 'error':
            setErro(msg.msg || msg.code || 'Erro na chamada');
            setStatus('error');
            limpar();
            break;
          default:
            break;
        }
      } else {
        framesIn.current += 1;
        nodeRef.current?.port.postMessage({ kind: 'in', pcm: e.data }, [e.data]);
      }
    };

    clearInterval(monitorRef.current);
    monitorRef.current = setInterval(() => {
      setAudio({
        recebidos: framesIn.current,
        enviados: framesOut.current,
        taxa: audioCtxRef.current?.sampleRate || null,
        eventos: eventosRef.current,
      });
    }, 1000);

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      if (!conectado) {
        setErro('A ligação foi encerrada antes de conectar');
        setStatus('error');
      } else {
        setStatus('ended');
      }
      limpar();
    };

    ws.onerror = () => {
      setErro('Erro de conexão com a chamada');
      setStatus('error');
      limpar();
    };
  }, [limpar, pararSomChamada]);

  // Ligações de saída (WhatsApp via stream ou URA da operadora).
  const iniciar = useCallback(async (viaEscolhida, connectionId, telefone) => {
    if (emChamadaRef.current || chamadaLocalOcupada) {
      setErro('Já existe uma ligação em andamento nesta aba.');
      setStatus('error');
      return false;
    }
    chamadaLocalOcupada = donoLocal.current;
    emChamadaRef.current = true;
    setErro(null);
    setStatus('calling');
    setVia(viaEscolhida);
    framesIn.current = 0;
    framesOut.current = 0;
    eventosRef.current = [];
    setAudio({ recebidos: 0, enviados: 0, taxa: null, eventos: [] });
    try {
      await prepararMidia();
      ringbackStopRef.current = startCallRingback(audioCtxRef.current);

      const resp = await base44.functions.invoke('iniciarChamadaDapi', {
        via: viaEscolhida,
        connectionId,
        phone: (telefone || '').replace(/\D/g, ''),
      });
      if (!resp?.data?.success) throw new Error(resp?.data?.error || 'Falha ao iniciar chamada');

      await conectarMidia(resp.data.wsUrl);
    } catch (e) {
      setErro(mensagemErro(e));
      setStatus('error');
      limpar();
    }
  }, [prepararMidia, conectarMidia, limpar]);

  // Chamada recebida atendida dentro do CRM (WhatsApp).
  const atender = useCallback(async (connectionId, callId) => {
    if (emChamadaRef.current || chamadaLocalOcupada) {
      setErro('Já existe uma ligação em andamento nesta aba.');
      setStatus('error');
      return false;
    }
    chamadaLocalOcupada = donoLocal.current;
    emChamadaRef.current = true;
    setErro(null);
    setStatus('calling');
    setVia('whatsapp');
    framesIn.current = 0;
    framesOut.current = 0;
    eventosRef.current = [];
    setAudio({ recebidos: 0, enviados: 0, taxa: null, eventos: [] });
    try {
      await prepararMidia();

      const resp = await base44.functions.invoke('atenderChamadaDapi', {
        connectionId,
        callId,
        acao: 'atender',
      });
      if (!resp?.data?.success || !resp.data.wsUrl) {
        throw new Error(resp?.data?.error || 'Falha ao atender a chamada');
      }

      await conectarMidia(resp.data.wsUrl, { jaAtendida: true });
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      setStatus('error');
      limpar();
      return false;
    }
  }, [prepararMidia, conectarMidia, limpar]);

  // Recusa a chamada recebida (não precisa de microfone).
  const recusar = useCallback(async (connectionId, callId) => {
    await base44.functions.invoke('atenderChamadaDapi', { connectionId, callId, acao: 'recusar' });
  }, []);

  return { status, erro, mutado, via, audio, iniciar, atender, recusar, encerrar, alternarMudo };
}