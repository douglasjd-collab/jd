import { useState, useEffect, useRef, useCallback } from 'react';
import JsSIP from 'jssip';
import { base44 } from '@/api/base44Client';

/**
 * Hook Softphone WebRTC — NVOIP ligação direta no CRM
 * Usa JsSIP via wss://app.nvoip.com.br:7443
 * NÃO usa /v2/calls, callback, nem MicroSIP.
 */
export default function useSoftphone(config) {
  const [sipStatus, setSipStatus] = useState('desconectado');
  const [erroMsg, setErroMsg] = useState('');
  const [chamadaAtiva, setChamadaAtiva] = useState(null);
  const [chamadaEntrante, setChamadaEntrante] = useState(null);

  const uaRef = useRef(null);
  const audioRef = useRef(null);
  const ringIntervalRef = useRef(null);
  const inicioRef = useRef(null);
  const configRef = useRef(config);

  useEffect(() => { configRef.current = config; }, [config]);

  // Cria elemento de áudio remoto
  useEffect(() => {
    audioRef.current = document.createElement('audio');
    audioRef.current.autoplay = true;
    document.body.appendChild(audioRef.current);
    return () => {
      if (audioRef.current) {
        audioRef.current.srcObject = null;
        audioRef.current.remove();
      }
    };
  }, []);

  const _pararRingtone = () => {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
  };

  const _tocarRingtone = () => {
    _pararRingtone();
    const _beep = () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 480;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.8);
      } catch {}
    };
    _beep();
    ringIntervalRef.current = setInterval(_beep, 1500);
  };

  const _conectarAudio = (session) => {
    const pc = session.connection;
    if (!pc) return;
    const tryAttach = () => {
      const receivers = pc.getReceivers?.() || [];
      const audioTrack = receivers.find(r => r.track?.kind === 'audio')?.track;
      if (audioTrack && audioRef.current) {
        audioRef.current.srcObject = new MediaStream([audioTrack]);
        audioRef.current.play().catch(() => {});
      }
    };
    tryAttach();
    pc.ontrack = (e) => {
      if (e.streams?.[0] && audioRef.current) {
        audioRef.current.srcObject = e.streams[0];
        audioRef.current.play().catch(() => {});
      }
    };
  };

  const _limparAudio = () => {
    if (audioRef.current) audioRef.current.srcObject = null;
  };

  const _salvarHistorico = async (numero, direcao, status, duracaoSegundos = 0) => {
    try {
      const me = await base44.auth.me();
      if (!me) return;
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id });
      const colab = colabs?.[0];
      if (!colab?.empresa_id) return;

      const numLimpo = (numero || '').replace(/\D/g, '');
      let clienteId = null, clienteNome = null;
      try {
        const cls = await base44.entities.Cliente.filter({ empresa_id: colab.empresa_id });
        const match = cls.find(c =>
          (c.telefone || '').replace(/\D/g, '') === numLimpo ||
          (c.celular || '').replace(/\D/g, '') === numLimpo
        );
        if (match) { clienteId = match.id; clienteNome = match.nome; }
      } catch {}

      await base44.entities.HistoricoChamadaMicroSIP.create({
        empresa_id: colab.empresa_id,
        usuario_id: colab.id,
        usuario_nome: colab.nome,
        direcao,
        numero: numLimpo,
        cliente_id: clienteId,
        cliente_nome: clienteNome,
        status,
        inicio: new Date(Date.now() - duracaoSegundos * 1000).toISOString(),
        fim: new Date().toISOString(),
        duracao_segundos: duracaoSegundos,
      });
    } catch (e) {
      console.warn('Histórico:', e.message);
    }
  };

  const desconectar = useCallback(() => {
    if (uaRef.current) {
      try { uaRef.current.stop(); } catch {}
      uaRef.current = null;
    }
    _pararRingtone();
    setSipStatus('desconectado');
    setChamadaAtiva(null);
    setChamadaEntrante(null);
  }, []);

  const conectar = useCallback(() => {
    const cfg = configRef.current;
    if (!cfg?.numbersip || !cfg?.sip_password) {
      setErroMsg('Configure o Ramal SIP e a Senha SIP em "Meu Ramal".');
      setSipStatus('erro');
      return;
    }

    if (uaRef.current) {
      try { uaRef.current.stop(); } catch {}
      uaRef.current = null;
    }

    setSipStatus('conectando');
    setErroMsg('');

    const socket = new JsSIP.WebSocketInterface('wss://app.nvoip.com.br:7443');

    const ua = new JsSIP.UA({
      sockets: [socket],
      uri: `sip:${cfg.numbersip}@app.nvoip.com.br`,
      password: cfg.sip_password,
      authorization_user: String(cfg.numbersip),
      display_name: 'JD Promotora',
      register: true,
      register_expires: 600,
      session_timers: false,
      connection_recovery_min_interval: 2,
      connection_recovery_max_interval: 30,
      log: { builtinEnabled: false, level: 'error' },
    });

    ua.on('connecting', () => setSipStatus('conectando'));
    ua.on('connected', () => setSipStatus('conectando'));
    ua.on('disconnected', (e) => {
      console.warn('SIP WSS desconectado', e?.code, e?.reason);
      setSipStatus('desconectado');
      setErroMsg('WebSocket desconectado. Tentando reconectar...');
    });
    ua.on('registered', () => {
      setSipStatus('registrado');
      setErroMsg('');
      console.log(`✅ SIP registrado: ${cfg.numbersip}@app.nvoip.com.br`);
    });
    ua.on('unregistered', () => setSipStatus('desconectado'));
    ua.on('registrationFailed', (e) => {
      const status = e?.response?.status_code;
      console.error('SIP registro falhou:', e?.cause, status);
      setSipStatus('erro');
      if (status === 401 || status === 403) {
        setErroMsg('Senha SIP incorreta. Verifique em "Meu Ramal".');
      } else if (status === 404) {
        setErroMsg('Ramal SIP não encontrado no servidor NVOIP.');
      } else {
        setErroMsg(`Falha SIP: ${e?.cause || status || 'erro desconhecido'}`);
      }
    });

    // Chamadas ENTRANTES
    ua.on('newRTCSession', (data) => {
      const { session, originator } = data;
      if (originator !== 'remote') return;

      const origem = session.remote_identity?.uri?.user
        || session.remote_identity?.display_name
        || 'Desconhecido';

      setChamadaEntrante({ session, origem });
      _tocarRingtone();

      session.on('failed', () => {
        _pararRingtone();
        _salvarHistorico(origem, 'entrada', 'nao_atendida', 0);
        setChamadaEntrante(null);
      });
      session.on('ended', () => {
        _pararRingtone();
        setChamadaEntrante(null);
        setChamadaAtiva(null);
        _limparAudio();
      });
    });

    ua.start();
    uaRef.current = ua;
  }, []);

  // Auto conecta quando config disponível
  useEffect(() => {
    if (config?.numbersip && config?.sip_password) {
      conectar();
    } else if (!config?.sip_password && config?.numbersip) {
      setSipStatus('erro');
      setErroMsg('Senha SIP não configurada. Acesse "Meu Ramal" e informe a Senha SIP.');
    }
    return () => desconectar();
  }, [config?.numbersip, config?.sip_password]);

  const realizarChamada = useCallback((numero) => {
    if (!uaRef.current || sipStatus !== 'registrado') return false;
    const cfg = configRef.current;
    const numeroLimpo = numero.replace(/\D/g, '');
    // Para NVOIP: discar externamente via ramal registrado
    const destino = `sip:${numeroLimpo}@app.nvoip.com.br`;

    const session = uaRef.current.call(destino, {
      mediaConstraints: { audio: true, video: false },
      rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
      pcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
      extraHeaders: cfg?.numero_did ? [`X-Caller-ID: ${cfg.numero_did}`] : [],
    });

    inicioRef.current = null;
    setChamadaAtiva({ session, destino: numeroLimpo, direcao: 'saida', status: 'chamando' });

    session.on('progress', () => setChamadaAtiva(prev => prev ? { ...prev, status: 'chamando' } : null));
    session.on('accepted', () => {
      inicioRef.current = Date.now();
      setChamadaAtiva(prev => prev ? { ...prev, status: 'em_ligacao' } : null);
      _conectarAudio(session);
    });
    session.on('confirmed', () => {
      if (!inicioRef.current) inicioRef.current = Date.now();
      setChamadaAtiva(prev => prev ? { ...prev, status: 'em_ligacao' } : null);
      _conectarAudio(session);
    });
    session.on('ended', () => {
      const dur = inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0;
      _salvarHistorico(numeroLimpo, 'saida', dur > 0 ? 'atendida' : 'nao_atendida', dur);
      setChamadaAtiva(null);
      _limparAudio();
    });
    session.on('failed', (e) => {
      console.warn('Chamada falhou:', e?.cause);
      _salvarHistorico(numeroLimpo, 'saida', 'nao_atendida', 0);
      setChamadaAtiva(null);
      _limparAudio();
    });

    return true;
  }, [sipStatus]);

  const atenderChamada = useCallback(() => {
    if (!chamadaEntrante?.session) return;
    _pararRingtone();
    const { session, origem } = chamadaEntrante;
    session.answer({
      mediaConstraints: { audio: true, video: false },
      pcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
    });
    inicioRef.current = Date.now();
    setChamadaEntrante(null);
    setChamadaAtiva({ session, destino: origem, direcao: 'entrada', status: 'em_ligacao' });
    session.on('confirmed', () => _conectarAudio(session));
    session.on('ended', () => {
      const dur = inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0;
      _salvarHistorico(origem, 'entrada', 'atendida', dur);
      setChamadaAtiva(null);
      _limparAudio();
    });
    session.on('failed', () => { setChamadaAtiva(null); _limparAudio(); });
  }, [chamadaEntrante]);

  const rejeitarChamada = useCallback(() => {
    _pararRingtone();
    if (chamadaEntrante?.session) {
      chamadaEntrante.session.terminate();
      _salvarHistorico(chamadaEntrante.origem, 'entrada', 'nao_atendida', 0);
    }
    setChamadaEntrante(null);
  }, [chamadaEntrante]);

  const encerrarChamada = useCallback(() => {
    if (chamadaAtiva?.session) {
      try { chamadaAtiva.session.terminate(); } catch {}
    }
    setChamadaAtiva(null);
    _limparAudio();
  }, [chamadaAtiva]);

  return {
    sipStatus, erroMsg,
    chamadaAtiva, chamadaEntrante,
    conectar, desconectar,
    realizarChamada, atenderChamada, rejeitarChamada, encerrarChamada,
  };
}