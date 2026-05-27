import { useState, useEffect, useRef, useCallback } from 'react';
import JsSIP from 'jssip';
import { base44 } from '@/api/base44Client';

// Hook que gerencia o softphone SIP/WebRTC via JsSIP + NVOIP WSS
export default function useSoftphone(config) {
  const [sipStatus, setSipStatus] = useState('desconectado'); // desconectado | conectando | registrado | erro
  const [chamadaAtiva, setChamadaAtiva] = useState(null);   // { session, destino, direcao, status }
  const [chamadaEntrante, setChamadaEntrante] = useState(null); // { session, origem }
  const [erroMsg, setErroMsg] = useState('');

  const uaRef = useRef(null);
  const audioRemotoRef = useRef(null);
  const ringtoneRef = useRef(null);
  const inicioRef = useRef(null); // timestamp inicio chamada para histórico

  // Inicializa elementos de áudio
  useEffect(() => {
    audioRemotoRef.current = new Audio();
    audioRemotoRef.current.autoplay = true;

    // Ringtone simples via Web Audio API
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playRingtone = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440;
      gain.gain.value = 0.3;
      osc.start();
      setTimeout(() => osc.stop(), 800);
    };
    ringtoneRef.current = { play: playRingtone, pause: () => {}, ctx };

    return () => {
      if (audioRemotoRef.current) {
        audioRemotoRef.current.srcObject = null;
      }
    };
  }, []);

  const desconectar = useCallback(() => {
    if (uaRef.current) {
      try { uaRef.current.stop(); } catch {}
      uaRef.current = null;
    }
    setSipStatus('desconectado');
  }, []);

  const conectar = useCallback(() => {
    if (!config?.numbersip || !config?.sip_password) {
      console.warn('SIP: numbersip ou sip_password ausente');
      return;
    }
    if (uaRef.current) desconectar();

    setSipStatus('conectando');
    setErroMsg('');

    // NVOIP WSS endpoint conforme documentação oficial
    const socket = new JsSIP.WebSocketInterface('wss://app.nvoip.com.br:7443');

    const ua = new JsSIP.UA({
      sockets: [socket],
      uri: `sip:${config.numbersip}@app.nvoip.com.br`,
      password: config.sip_password,
      authorization_user: config.numbersip,
      display_name: 'JD Promotora',
      register: true,
      register_expires: 300,
      session_timers: false,
      connection_recovery_min_interval: 2,
      connection_recovery_max_interval: 30,
      log: { builtinEnabled: false, level: 'warn' },
    });

    ua.on('connecting', () => setSipStatus('conectando'));
    ua.on('connected', () => setSipStatus('conectando'));
    ua.on('disconnected', (e) => {
      console.warn('SIP desconectado:', e?.code, e?.reason);
      setSipStatus('desconectado');
      setErroMsg('WebSocket desconectado. Reconectando...');
    });
    ua.on('registered', () => {
      setSipStatus('registrado');
      setErroMsg('');
      console.log('✅ SIP registrado — ramal:', config.numbersip);
    });
    ua.on('unregistered', () => setSipStatus('desconectado'));
    ua.on('registrationFailed', (e) => {
      const cause = e?.cause || '';
      const status = e?.response?.status_code;
      console.error('SIP falha registro:', cause, status);
      setSipStatus('erro');
      if (status === 401 || status === 403) {
        setErroMsg('Credenciais SIP inválidas. Verifique a senha SIP nas configurações.');
      } else {
        setErroMsg(`Falha no registro SIP: ${cause || status || 'erro desconhecido'}`);
      }
    });

    // Chamada entrante
    ua.on('newRTCSession', (data) => {
      const { session, originator } = data;

      if (originator === 'remote') {
        const origem = session.remote_identity?.uri?.user || session.remote_identity?.display_name || 'Desconhecido';
        setChamadaEntrante({ session, origem });

        // Toca ringtone em loop
        let ringInterval = setInterval(() => {
          try { ringtoneRef.current?.play(); } catch {}
        }, 1200);

        session.on('failed', () => {
          clearInterval(ringInterval);
          setChamadaEntrante(null);
        });
        session.on('ended', () => {
          clearInterval(ringInterval);
          setChamadaEntrante(null);
          setChamadaAtiva(null);
          _limparAudio();
          _salvarHistorico(origem, 'entrada', 'nao_atendida');
        });
      }
    });

    ua.start();
    uaRef.current = ua;
  }, [config?.numbersip, config?.sip_password]);

  // Reconecta automaticamente quando config muda
  useEffect(() => {
    if (config?.numbersip && config?.sip_password) {
      conectar();
    } else {
      desconectar();
    }
    return () => desconectar();
  }, [config?.numbersip, config?.sip_password]);

  const realizarChamada = useCallback((numero) => {
    if (!uaRef.current || sipStatus !== 'registrado') {
      console.warn('SIP não registrado, não é possível discar');
      return false;
    }

    const numeroLimpo = numero.replace(/\D/g, '');
    // NVOIP: para externos, usar sip:numero@app.nvoip.com.br
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
    });

    inicioRef.current = Date.now();
    setChamadaAtiva({ session, destino: numeroLimpo, direcao: 'saida', status: 'chamando' });

    session.on('progress', () => setChamadaAtiva(prev => prev ? { ...prev, status: 'chamando' } : null));
    session.on('accepted', () => {
      inicioRef.current = Date.now();
      setChamadaAtiva(prev => prev ? { ...prev, status: 'em_ligacao' } : null);
      _conectarAudio(session);
    });
    session.on('confirmed', () => {
      inicioRef.current = Date.now();
      setChamadaAtiva(prev => prev ? { ...prev, status: 'em_ligacao' } : null);
      _conectarAudio(session);
    });
    session.on('ended', () => {
      const durSeg = inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0;
      _salvarHistorico(numeroLimpo, 'saida', 'atendida', durSeg);
      setChamadaAtiva(null);
      _limparAudio();
    });
    session.on('failed', (e) => {
      console.error('Chamada SIP falhou:', e.cause);
      _salvarHistorico(numeroLimpo, 'saida', 'nao_atendida', 0);
      setChamadaAtiva(null);
      _limparAudio();
    });

    return true;
  }, [sipStatus]);

  const atenderChamada = useCallback(() => {
    if (!chamadaEntrante?.session) return;
    const { session, origem } = chamadaEntrante;

    session.answer({
      mediaConstraints: { audio: true, video: false },
      pcConfig: {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      },
    });

    inicioRef.current = Date.now();
    setChamadaEntrante(null);
    setChamadaAtiva({ session, destino: origem, direcao: 'entrada', status: 'em_ligacao' });

    session.on('confirmed', () => _conectarAudio(session));
    session.on('ended', () => {
      const durSeg = inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0;
      _salvarHistorico(origem, 'entrada', 'atendida', durSeg);
      setChamadaAtiva(null);
      _limparAudio();
    });
    session.on('failed', () => {
      setChamadaAtiva(null);
      _limparAudio();
    });
  }, [chamadaEntrante]);

  const rejeitarChamada = useCallback(() => {
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

  const _conectarAudio = (session) => {
    const pc = session.connection;
    if (!pc) return;

    // Tenta via getReceivers
    const receivers = pc.getReceivers?.() || [];
    const audioTrack = receivers.find(r => r.track?.kind === 'audio')?.track;
    if (audioTrack && audioRemotoRef.current) {
      audioRemotoRef.current.srcObject = new MediaStream([audioTrack]);
      audioRemotoRef.current.play().catch(() => {});
    }

    // Fallback via ontrack
    pc.ontrack = (e) => {
      if (e.streams?.[0] && audioRemotoRef.current) {
        audioRemotoRef.current.srcObject = e.streams[0];
        audioRemotoRef.current.play().catch(() => {});
      }
    };
  };

  const _limparAudio = () => {
    if (audioRemotoRef.current) {
      audioRemotoRef.current.srcObject = null;
    }
  };

  const _salvarHistorico = async (numero, direcao, status, duracaoSegundos = 0) => {
    try {
      const me = await base44.auth.me();
      const colabs = await base44.entities.Colaborador.filter({ user_id: me?.id });
      const colab = colabs?.[0];
      if (!colab?.empresa_id) return;

      // Tenta encontrar cliente pelo número
      const numLimpo = numero.replace(/\D/g, '');
      let clienteId = null, clienteNome = null;
      try {
        const clientes = await base44.entities.Cliente.filter({ empresa_id: colab.empresa_id, telefone: numLimpo });
        if (clientes?.length > 0) {
          clienteId = clientes[0].id;
          clienteNome = clientes[0].nome;
        }
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
      console.warn('Erro ao salvar histórico:', e.message);
    }
  };

  return {
    sipStatus,
    erroMsg,
    chamadaAtiva,
    chamadaEntrante,
    conectar,
    desconectar,
    realizarChamada,
    atenderChamada,
    rejeitarChamada,
    encerrarChamada,
  };
}