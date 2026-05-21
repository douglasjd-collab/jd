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
    if (!config?.numbersip || !config?.sip_password) return;
    if (uaRef.current) desconectar();

    setSipStatus('conectando');

    // NVOIP WebSocket SIP
    const socket = new JsSIP.WebSocketInterface('wss://webrtc.nvoip.com.br:443');

    const ua = new JsSIP.UA({
      sockets: [socket],
      uri: `sip:${config.numbersip}@nvoip.com.br`,
      password: config.sip_password,
      display_name: config.numbersip,
      register: true,
      register_expires: 300,
      session_timers: false,
      log: { builtinEnabled: false },
    });

    ua.on('connecting', () => setSipStatus('conectando'));
    ua.on('connected', () => setSipStatus('conectando'));
    ua.on('disconnected', () => setSipStatus('desconectado'));
    ua.on('registered', () => setSipStatus('registrado'));
    ua.on('unregistered', () => setSipStatus('desconectado'));
    ua.on('registrationFailed', (e) => {
      console.error('SIP registration failed:', e.cause);
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

  // Conecta/desconecta quando config muda
  useEffect(() => {
    if (config?.numbersip && config?.sip_password) {
      conectar();
    } else {
      desconectar();
    }
    return () => desconectar();
  }, [config?.numbersip, config?.sip_password]);

  const realizarChamada = useCallback((numero) => {
    if (!uaRef.current || sipStatus !== 'registrado') return;

    const destino = `sip:${numero}@nvoip.com.br`;
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