import { useCallback, useEffect, useRef, useState } from 'react';
import { startCallRingback } from './callRingback';
import { base44 } from '@/api/base44Client';

// Worklet que converte Float32 (navegador) <-> Int16 (rede) para as Ligações por
// Stream da D-API (PCM s16le, 16kHz, mono, frames de 20ms = 320 amostras).
// Criado via Blob URL (sem depender de arquivo estático em /public).
const WORKLET_CODE = `
const FRAME = 320;
const PREBUFFER = 1600;
class VoipIO extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(16000 * 2);
    this.wr = 0; this.rd = 0; this.filled = 0; this.primed = false;
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
    const mic = inputs[0]?.[0];
    if (mic) {
      for (let i = 0; i < mic.length; i++) {
        this.outAccum[this.outLen++] = mic[i];
        if (this.outLen === FRAME) {
          const i16 = new Int16Array(FRAME);
          for (let k = 0; k < FRAME; k++) {
            let v = this.outAccum[k];
            v = v > 1 ? 1 : v < -1 ? -1 : v;
            i16[k] = v * 32767;
          }
          this.port.postMessage({ kind: 'out', pcm: i16.buffer }, [i16.buffer]);
          this.outLen = 0;
        }
      }
    }
    const out = outputs[0][0];
    if (!this.primed && this.filled >= PREBUFFER) this.primed = true;
    for (let i = 0; i < out.length; i++) {
      if (this.primed && this.filled > 0) {
        out[i] = this.ring[this.rd];
        this.rd = (this.rd + 1) % this.ring.length;
        this.filled--;
      } else {
        out[i] = 0;
        if (this.primed && this.filled === 0) this.primed = false;
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

export default function useDapiCall() {
  const [status, setStatus] = useState('idle'); // idle|calling|ringing|connected|ended|error
  const [erro, setErro] = useState(null);
  const [mutado, setMutado] = useState(false);
  const [via, setVia] = useState(null); // 'whatsapp' | 'operadora'

  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const micStreamRef = useRef(null);
  const nodeRef = useRef(null);
  const canSendRef = useRef(false);
  const emChamadaRef = useRef(false);
  const ringbackStopRef = useRef(null);
  const pararSomChamada = useCallback(() => {
    ringbackStopRef.current?.();
    ringbackStopRef.current = null;
  }, []);

  const limpar = useCallback(() => {
    pararSomChamada();
    try { wsRef.current?.close(); } catch (_) {}
    wsRef.current = null;
    try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch (_) {}
    micStreamRef.current = null;
    try { audioCtxRef.current?.close(); } catch (_) {}
    audioCtxRef.current = null;
    nodeRef.current = null;
    canSendRef.current = false;
    emChamadaRef.current = false;
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
    const ctx = new AudioContextClass({ sampleRate: 16000 });
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
        nodeRef.current?.port.postMessage({ kind: 'in', pcm: e.data }, [e.data]);
      }
    };

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
    if (emChamadaRef.current) return;
    emChamadaRef.current = true;
    setErro(null);
    setStatus('calling');
    setVia(viaEscolhida);
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
    if (emChamadaRef.current) return;
    emChamadaRef.current = true;
    setErro(null);
    setStatus('calling');
    setVia('whatsapp');
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
    } catch (e) {
      setErro(mensagemErro(e));
      setStatus('error');
      limpar();
    }
  }, [prepararMidia, conectarMidia, limpar]);

  // Recusa a chamada recebida (não precisa de microfone).
  const recusar = useCallback(async (connectionId, callId) => {
    try {
      await base44.functions.invoke('atenderChamadaDapi', { connectionId, callId, acao: 'recusar' });
    } catch (_) {}
  }, []);

  return { status, erro, mutado, via, iniciar, atender, recusar, encerrar, alternarMudo };
}