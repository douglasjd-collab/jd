import { useState, useEffect, useRef, useCallback } from 'react';
import JsSIP from 'jssip';

// Hook que gerencia o softphone SIP/WebRTC via JsSIP + NVOIP
export default function useSoftphone(config) {
  const [sipStatus, setSipStatus] = useState('desconectado'); // desconectado | conectando | registrado | erro
  const [chamadaAtiva, setChamadaAtiva] = useState(null); // { session, destino, direcao, status }
  const [chamadaEntrante, setChamadaEntrante] = useState(null); // { session, origem }

  const uaRef = useRef(null);
  const audioRemotoRef = useRef(null);
  const ringtoneRef = useRef(null);

  // Inicializa áudio remoto
  useEffect(() => {
    audioRemotoRef.current = new Audio();
    audioRemotoRef.current.autoplay = true;
    ringtoneRef.current = new Audio('https://www.soundjay.com/phone/phone-ringing-1.mp3');
    ringtoneRef.current.loop = true;
  }, []);

  const desconectar = useCallback(() => {
    if (uaRef.current) {
      uaRef.current.stop();
      uaRef.current = null;
    }
    setSipStatus('desconectado');
  }, []);

  const conectar = useCallback(() => {
    if (!config?.numbersip || !config?.sip_password) {
      console.warn('SIP: numbersip ou sip_password ausente. Configure nas credenciais NVOIP.');
      return;
    }
    if (uaRef.current) desconectar();

    setSipStatus('conectando');

    // NVOIP WebSocket SIP — sip.nvoip.com.br é o host correto (webrtc.nvoip.com.br não existe no DNS)
    // Tenta múltiplos endpoints em ordem
    const wsEndpoints = [
      'wss://sip.nvoip.com.br:443',
      'wss://sip.nvoip.com.br:8089',
      'wss://sip.nvoip.com.br:5065',
    ];
    const sockets = wsEndpoints.map(url => new JsSIP.WebSocketInterface(url));

    const ua = new JsSIP.UA({
      sockets,
      uri: `sip:${config.numbersip}@sip.nvoip.com.br`,
      password: config.sip_password,
      display_name: config.numbersip,
      register: true,
      register_expires: 300,
      session_timers: false,
      connection_recovery_min_interval: 2,
      connection_recovery_max_interval: 30,
      log: { builtinEnabled: true, level: 'warn' },
    });

    ua.on('connecting', () => { console.log('SIP: conectando...'); setSipStatus('conectando'); });
    ua.on('connected', () => { console.log('SIP: WebSocket conectado, aguardando registro...'); setSipStatus('conectando'); });
    ua.on('disconnected', (e) => {
      console.warn('SIP: WebSocket desconectado — code:', e?.code, 'reason:', e?.reason, 'error:', e?.error);
      setSipStatus('desconectado');
    });
    ua.on('registered', () => {
      console.log('SIP: registrado com sucesso! Ramal:', config.numbersip);
      setSipStatus('registrado');
    });
    ua.on('unregistered', (e) => {
      console.warn('SIP: unregistered — cause:', e?.cause);
      setSipStatus('desconectado');
    });
    ua.on('registrationFailed', (e) => {
      console.error('SIP: falha no registro — cause:', e?.cause, 'status:', e?.response?.status_code, 'reason:', e?.response?.reason_phrase);
      setSipStatus('erro');
    });

    // Chamada entrante
    ua.on('newRTCSession', (data) => {
      const { session, originator } = data;

      if (originator === 'remote') {
        // Chamada entrante
        const origem = session.remote_identity?.uri?.user || 'Desconhecido';
        setChamadaEntrante({ session, origem });
        ringtoneRef.current?.play().catch(() => {});

        session.on('failed', () => {
          setChamadaEntrante(null);
          ringtoneRef.current?.pause();
        });
        session.on('ended', () => {
          setChamadaEntrante(null);
          setChamadaAtiva(null);
          ringtoneRef.current?.pause();
          if (audioRemotoRef.current) audioRemotoRef.current.srcObject = null;
        });
      }
    });

    ua.start();
    uaRef.current = ua;
  }, [config, desconectar]);

  // Conecta automaticamente quando config com sip_password estiver disponível
  useEffect(() => {
    if (config?.numbersip && config?.sip_password) {
      conectar();
    }
    return () => desconectar();
  }, [config?.numbersip, config?.sip_password]);

  const realizarChamada = useCallback((numero) => {
    if (!uaRef.current || sipStatus !== 'registrado') return;

    const destino = `sip:${numero}@sip.nvoip.com.br`;
    const session = uaRef.current.call(destino, {
      mediaConstraints: { audio: true, video: false },
      pcConfig: {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      },
    });

    setChamadaAtiva({ session, destino: numero, direcao: 'saida', status: 'chamando' });

    session.on('progress', () => setChamadaAtiva(prev => ({ ...prev, status: 'chamando' })));
    session.on('accepted', () => {
      setChamadaAtiva(prev => ({ ...prev, status: 'em_ligacao' }));
      _conectarAudio(session);
    });
    session.on('confirmed', () => {
      setChamadaAtiva(prev => ({ ...prev, status: 'em_ligacao' }));
      _conectarAudio(session);
    });
    session.on('ended', () => {
      setChamadaAtiva(null);
      if (audioRemotoRef.current) audioRemotoRef.current.srcObject = null;
    });
    session.on('failed', (e) => {
      console.error('Chamada falhou:', e.cause);
      setChamadaAtiva(null);
    });
  }, [sipStatus]);

  const atenderChamada = useCallback(() => {
    if (!chamadaEntrante?.session) return;
    ringtoneRef.current?.pause();

    const { session, origem } = chamadaEntrante;
    session.answer({ mediaConstraints: { audio: true, video: false } });

    setChamadaEntrante(null);
    setChamadaAtiva({ session, destino: origem, direcao: 'entrada', status: 'em_ligacao' });

    session.on('confirmed', () => _conectarAudio(session));
    session.on('ended', () => {
      setChamadaAtiva(null);
      if (audioRemotoRef.current) audioRemotoRef.current.srcObject = null;
    });
    session.on('failed', () => {
      setChamadaAtiva(null);
    });
  }, [chamadaEntrante]);

  const rejeitarChamada = useCallback(() => {
    chamadaEntrante?.session?.terminate();
    setChamadaEntrante(null);
    ringtoneRef.current?.pause();
  }, [chamadaEntrante]);

  const encerrarChamada = useCallback(() => {
    chamadaAtiva?.session?.terminate();
    setChamadaAtiva(null);
    if (audioRemotoRef.current) audioRemotoRef.current.srcObject = null;
  }, [chamadaAtiva]);

  const _conectarAudio = (session) => {
    const pc = session.connection;
    if (!pc) return;
    pc.getReceivers().forEach(receiver => {
      if (receiver.track && receiver.track.kind === 'audio') {
        const stream = new MediaStream([receiver.track]);
        if (audioRemotoRef.current) {
          audioRemotoRef.current.srcObject = stream;
        }
      }
    });
    // Fallback via ontrack
    pc.ontrack = (e) => {
      if (e.streams && e.streams[0] && audioRemotoRef.current) {
        audioRemotoRef.current.srcObject = e.streams[0];
      }
    };
  };

  return {
    sipStatus,
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