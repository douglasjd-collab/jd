import { useState, useEffect, useRef, useCallback } from 'react';
import JsSIP from 'jssip';
import { base44 } from '@/api/base44Client';

/**
 * Hook Softphone WebRTC — NVOIP
 * wss://app.nvoip.com.br:7443 — INVITE SIP direto, WebRTC puro.
 * Suporta chamadas de saída e recebimento de chamadas.
 */

// Habilita logs SIP completos no console
JsSIP.debug.enable('JsSIP:*');

export default function useSoftphone(config) {
  const [sipStatus, setSipStatus] = useState('desconectado');
  const [erroMsg, setErroMsg] = useState('');
  const [chamadaAtiva, setChamadaAtiva] = useState(null);
  const [chamadaEntrante, setChamadaEntrante] = useState(null);

  const uaRef = useRef(null);
  const audioRef = useRef(null);
  const ringRef = useRef(null);
  const inicioRef = useRef(null);
  const callTimeoutRef = useRef(null); // timeout 15s para "Chamando..."
  const configRef = useRef(config);
  const colabCacheRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const lastConnectedRef = useRef('');

  useEffect(() => { configRef.current = config; }, [config]);

  // Elemento de áudio remoto persistente
  useEffect(() => {
    const el = document.createElement('audio');
    el.autoplay = true;
    el.setAttribute('playsinline', '');
    document.body.appendChild(el);
    audioRef.current = el;
    return () => {
      el.srcObject = null;
      el.remove();
    };
  }, []);

  // ── ringtone ─────────────────────────────────────────────────────────────
  const _stopRing = () => { clearInterval(ringRef.current); ringRef.current = null; };
  const _startRing = () => {
    _stopRing();
    const beep = () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.frequency.value = 480;
        g.gain.setValueAtTime(0.35, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.9);
      } catch {}
    };
    beep();
    ringRef.current = setInterval(beep, 1800);
  };

  // ── áudio ─────────────────────────────────────────────────────────────────
  const _attachAudio = (session) => {
    const pc = session.connection;
    if (!pc) { console.warn('⚠️ _attachAudio: sem peerConnection'); return; }

    const tryAttach = () => {
      const receivers = pc.getReceivers?.() || [];
      const audioTrack = receivers.find(r => r.track?.kind === 'audio')?.track;
      if (audioTrack && audioRef.current) {
        console.log('🔊 Áudio anexado via getReceivers');
        audioRef.current.srcObject = new MediaStream([audioTrack]);
        audioRef.current.play().catch(e => console.warn('play() err:', e));
      }
    };

    // Tenta imediatamente e também via evento ontrack
    tryAttach();
    pc.addEventListener('track', (e) => {
      console.log('🔊 ontrack event:', e.track?.kind, 'streams:', e.streams?.length);
      if (e.streams?.[0] && audioRef.current) {
        audioRef.current.srcObject = e.streams[0];
        audioRef.current.play().catch(err => console.warn('play() err:', err));
      } else if (e.track?.kind === 'audio' && audioRef.current) {
        audioRef.current.srcObject = new MediaStream([e.track]);
        audioRef.current.play().catch(err => console.warn('play() err:', err));
      }
    });
  };

  const _clearAudio = () => {
    if (audioRef.current) { audioRef.current.srcObject = null; }
  };

  // ── timeout de chamada (60s após INVITE enviado) ──────────────────────────
  const _startCallTimeout = (session, numHistorico) => {
    _clearCallTimeout();
    callTimeoutRef.current = setTimeout(() => {
      console.warn('⏰ Timeout 60s sem resposta — encerrando sessão');
      try { session.terminate(); } catch {}
      if (mountedRef.current) {
        setErroMsg('Sem resposta após 60 segundos. Verifique o número e tente novamente.');
        setChamadaAtiva(null);
      }
      _clearAudio();
      _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
    }, 60000);
  };

  const _clearCallTimeout = () => {
    if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
  };

  // ── buscar colaborador (cache) ────────────────────────────────────────────
  const _getColab = async () => {
    if (colabCacheRef.current) return colabCacheRef.current;
    const me = await base44.auth.me();
    if (!me) return null;
    const colabs = await base44.entities.Colaborador.filter({ user_id: me.id });
    const colab = colabs?.find(c => c.empresa_id && c.status === 'ativo') || colabs?.[0];
    if (colab) colabCacheRef.current = colab;
    return colab;
  };

  // ── buscar cliente pelo número ────────────────────────────────────────────
  const _buscarCliente = async (numero) => {
    try {
      const colab = await _getColab();
      if (!colab?.empresa_id) return null;
      const numLimpo = numero.replace(/\D/g, '');
      const variantes = [numLimpo];
      if (numLimpo.startsWith('55') && numLimpo.length >= 12) variantes.push(numLimpo.slice(2));
      if (numLimpo.length === 13) variantes.push(numLimpo.slice(4));
      const clientes = await base44.entities.Cliente.filter({ empresa_id: colab.empresa_id });
      const match = clientes.find(c => {
        const t = (c.telefone || '').replace(/\D/g, '');
        const cel = (c.celular || '').replace(/\D/g, '');
        return variantes.some(v => v === t || v === cel);
      });
      return match || null;
    } catch { return null; }
  };

  // ── salvar histórico ──────────────────────────────────────────────────────
  const _salvarHistorico = async (numero, direcao, status, durSeg = 0, clienteId = null, clienteNome = null) => {
    try {
      const colab = await _getColab();
      if (!colab?.empresa_id) return;
      const numLimpo = (numero || '').replace(/\D/g, '');
      if (!clienteId) {
        const c = await _buscarCliente(numLimpo);
        if (c) { clienteId = c.id; clienteNome = c.nome; }
      }
      await base44.entities.HistoricoChamadaMicroSIP.create({
        empresa_id: colab.empresa_id,
        usuario_id: colab.id,
        usuario_nome: colab.nome,
        direcao,
        numero: numLimpo,
        cliente_id: clienteId,
        cliente_nome: clienteNome,
        status,
        inicio: new Date(Date.now() - durSeg * 1000).toISOString(),
        fim: new Date().toISOString(),
        duracao_segundos: durSeg,
      });
    } catch (e) { console.warn('Histórico chamada:', e.message); }
  };

  // ── desconectar (manual) ──────────────────────────────────────────────────
  const desconectar = useCallback(() => {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    _clearCallTimeout();
    if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
    _stopRing();
    if (mountedRef.current) {
      setSipStatus('desconectado');
      setChamadaAtiva(null);
      setChamadaEntrante(null);
    }
  }, []);

  // ── conectar / registrar ramal ────────────────────────────────────────────
  const conectar = useCallback(() => {
    const cfg = configRef.current;
    if (!cfg?.numbersip || !cfg?.sip_password) {
      setErroMsg('Configure o Ramal SIP e a Senha SIP em "Meu Ramal".');
      setSipStatus('erro');
      return;
    }
    if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
    setSipStatus('conectando');
    setErroMsg('');

    console.log(`🔌 Conectando SIP: ramal=${cfg.numbersip} → wss://app.nvoip.com.br:7443`);

    const socket = new JsSIP.WebSocketInterface('wss://app.nvoip.com.br:7443');
    const sipUri = `sip:${cfg.numbersip}@app.nvoip.com.br`;

    const ua = new JsSIP.UA({
      sockets                         : [socket],
      uri                             : sipUri,
      password                        : cfg.sip_password,
      authorization_user              : String(cfg.numbersip),
      display_name                    : String(cfg.numbersip),
      register                        : true,
      register_expires                : 300,
      session_timers                  : false,
      use_preloaded_route             : false,
      no_answer_timeout               : 60,
      hack_via_tcp                    : false,
      hack_ip_in_contact              : false,
      contact_uri                     : `sip:${cfg.numbersip}@app.nvoip.com.br;transport=ws`,
      connection_recovery_min_interval: 2,
      connection_recovery_max_interval: 30,
      log                             : { builtinEnabled: true, level: 'debug' },
    });

    ua.on('connecting',    () => { console.log('🔗 UA: connecting'); if (mountedRef.current) setSipStatus('conectando'); });
    ua.on('connected',     () => { console.log('✅ UA: connected (WebSocket OK)'); if (mountedRef.current) setSipStatus('conectando'); });
    ua.on('registered',    () => {
      if (!mountedRef.current) return;
      console.log(`✅ REGISTER OK — ramal ${cfg.numbersip} registrado`);
      try { console.log('📋 Contact:', ua.contact?.toString?.()); } catch {}
      setSipStatus('registrado');
      setErroMsg('');
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    });
    ua.on('unregistered', () => {
      console.log('⚠️ UA: unregistered');
      if (mountedRef.current) setSipStatus('conectando');
    });
    ua.on('disconnected', (e) => {
      console.warn('🔌 UA: disconnected', e?.cause);
      if (!mountedRef.current) return;
      setSipStatus('conectando');
      setErroMsg('');
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        if (uaRef.current) {
          try { uaRef.current.start(); } catch {}
        } else if (configRef.current?.sip_password) {
          conectar();
        }
      }, 5000);
    });
    ua.on('registrationFailed', (e) => {
      if (!mountedRef.current) return;
      const code = e?.response?.status_code;
      console.error(`❌ REGISTER falhou — código: ${code}`, e?.cause);
      if (code === 401 || code === 403) {
        setSipStatus('erro');
        setErroMsg('Senha SIP incorreta. Verifique em "Meu Ramal".');
      } else if (code === 404) {
        setSipStatus('erro');
        setErroMsg('Ramal SIP não encontrado no servidor NVOIP.');
      } else {
        setSipStatus('conectando');
        setErroMsg('');
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current && configRef.current?.sip_password) conectar();
        }, 5000);
      }
    });

    // ── CHAMADA ENTRANTE ──────────────────────────────────────────────────
    ua.on('newRTCSession', (data) => {
      const { session, originator } = data;
      console.log(`📞 newRTCSession — originator: ${originator} | direction: ${session?.direction}`);
      if (originator === 'local') return; // saída tratada em realizarChamada

      const origem = session.remote_identity?.uri?.user
        || session.remote_identity?.display_name
        || 'Desconhecido';
      console.log(`📲 Chamada ENTRANTE de: ${origem}`);

      setChamadaEntrante({ session, origem, clienteNome: null, clienteId: null, buscando: true });
      _startRing();

      _buscarCliente(origem).then(c => {
        setChamadaEntrante(prev => {
          if (!prev || prev.session !== session) return prev;
          return { ...prev, clienteNome: c?.nome || null, clienteId: c?.id || null, buscando: false };
        });
      });

      session.on('failed', () => {
        _stopRing();
        _salvarHistorico(origem, 'entrada', 'nao_atendida', 0);
        setChamadaEntrante(null);
      });
      session.on('ended', () => {
        _stopRing();
        setChamadaEntrante(null);
        setChamadaAtiva(null);
        _clearAudio();
      });
    });

    ua.start();
    uaRef.current = ua;
  }, []);

  // Cleanup no unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      _clearCallTimeout();
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
    };
  }, []);

  // Auto-conecta ao receber config válida (1x por combinação numbersip+senha)
  useEffect(() => {
    if (!config?.numbersip) return;
    if (!config?.sip_password) {
      setSipStatus('erro');
      setErroMsg('Senha SIP não configurada. Acesse "Meu Ramal" → preencha a Senha SIP → Salvar.');
      return;
    }
    const key = `${config.numbersip}|${config.sip_password}`;
    if (lastConnectedRef.current === key && uaRef.current) return;
    lastConnectedRef.current = key;
    conectar();
  }, [config?.numbersip, config?.sip_password]); // eslint-disable-line

  // ── CHAMADA DE SAÍDA — WebRTC puro via WSS ────────────────────────────────
  const realizarChamada = useCallback(async (numero) => {
    if (!uaRef.current || sipStatus !== 'registrado') {
      console.warn('⚠️ realizarChamada: UA não registrado');
      return false;
    }

    // Limpa erro anterior
    setErroMsg('');

    // Solicita permissão de microfone ANTES de tentar a chamada
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach(t => t.stop());
      console.log('🎤 Permissão de microfone OK');
    } catch (err) {
      console.warn('🎤 Permissão de microfone negada:', err.message);
      setErroMsg('Permissão de microfone negada. Permita o microfone no navegador e tente novamente.');
      return false;
    }

    const cfg = configRef.current;
    let numLimpo = numero.replace(/\D/g, '');
    const numHistorico = numLimpo;

    // Garante DDI 55 para chamadas brasileiras
    if (!numLimpo.startsWith('55') && numLimpo.length <= 11) {
      numLimpo = '55' + numLimpo;
    }

    const destino = `sip:${numLimpo}@app.nvoip.com.br`;
    console.log(`📞 INVITE SIP → ${destino} | ramal: ${cfg?.numbersip} | DID: ${cfg?.numero_did}`);

    const session = uaRef.current.call(destino, {
      mediaConstraints     : { audio: true, video: false },
      rtcOfferConstraints  : { offerToReceiveAudio: true, offerToReceiveVideo: false },
      pcConfig             : {
        iceServers: [
          { urls: 'stun:app.nvoip.com.br:3478' },
          { urls: 'stun:stun.l.google.com:19302' },
        ],
        iceTransportPolicy : 'all',
        bundlePolicy       : 'balanced',
        rtcpMuxPolicy      : 'require',
      },
      extraHeaders: [
        ...(cfg?.numero_did ? [`X-Caller-ID: ${cfg.numero_did.replace(/\D/g, '')}`] : []),
      ],
    });

    // ── Log SIP detalhado + inicia timeout SOMENTE após INVITE enviado ───────
    session.on('sending', (e) => {
      // Inicia timeout de 60s apenas quando o INVITE já saiu pelo WebSocket
      _startCallTimeout(session, numHistorico);
      try {
        const req = e?.request;
        console.log('📤 SIP INVITE enviado:', {
          to     : req?.to?.toString?.(),
          from   : req?.from?.toString?.(),
          contact: req?.contact?.[0]?.toString?.(),
          ruri   : req?.ruri?.toString?.(),
        });
      } catch {}
    });

    // ── ICE / PeerConnection diagnóstico ──────────────────────────────────
    session.on('peerconnection', (data) => {
      const pc = data.peerconnection;
      if (!pc) return;
      console.log('🔗 PeerConnection criado');
      pc.oniceconnectionstatechange  = () => console.log(`🧊 ICE state: ${pc.iceConnectionState}`);
      pc.onicegatheringstatechange   = () => console.log(`🧊 ICE gathering: ${pc.iceGatheringState}`);
      pc.onconnectionstatechange     = () => console.log(`🔗 Connection state: ${pc.connectionState}`);
      pc.onicecandidate = (e) => {
        if (e.candidate) console.log(`🧊 Candidate: ${e.candidate.type} ${e.candidate.protocol} ${e.candidate.address}`);
        else             console.log('🧊 ICE gathering complete (null candidate)');
      };
      pc.addEventListener('track', (e) => {
        console.log('🔊 PC track event (peerconnection handler):', e.track?.kind);
        if (e.streams?.[0] && audioRef.current) {
          audioRef.current.srcObject = e.streams[0];
          audioRef.current.play().catch(() => {});
        }
      });
    });

    inicioRef.current = null;
    setChamadaAtiva({ session, destino: numHistorico, direcao: 'saida', status: 'chamando' });

    // Timeout iniciado dentro do evento 'sending' (após INVITE efetivamente enviado)
    session.on('progress', (e) => {
      const code = e?.response?.status_code;
      console.log(`📞 SIP ${code} ${e?.response?.reason_phrase || ''}`);
      // 180 Ringing = tocando, 183 Session Progress = conectando mídia
      if (code === 180) {
        setChamadaAtiva(p => p ? { ...p, status: 'tocando' } : null);
      } else {
        setChamadaAtiva(p => p ? { ...p, status: 'chamando' } : null);
      }
    });

    session.on('accepted', (e) => {
      console.log('✅ SIP 200 OK — chamada aceita (accepted)');
      _clearCallTimeout();
      inicioRef.current = Date.now();
      setChamadaAtiva(p => p ? { ...p, status: 'em_ligacao' } : null);
      _attachAudio(session);
    });

    session.on('confirmed', (e) => {
      console.log('✅ SIP ACK enviado — chamada confirmada (confirmed)');
      _clearCallTimeout();
      if (!inicioRef.current) inicioRef.current = Date.now();
      setChamadaAtiva(p => p ? { ...p, status: 'em_ligacao' } : null);
      _attachAudio(session);
    });

    session.on('ended', (e) => {
      console.log('📞 Chamada encerrada:', e?.cause);
      _clearCallTimeout();
      const dur = inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0;
      _salvarHistorico(numHistorico, 'saida', dur > 0 ? 'atendida' : 'nao_atendida', dur);
      setChamadaAtiva(null);
      _clearAudio();
    });

    session.on('failed', (e) => {
      const code = e?.response?.status_code;
      const cause = e?.cause;
      console.warn(`❌ INVITE falhou — código: ${code}, causa: ${cause}`, e?.response?.reason_phrase || '');
      _clearCallTimeout();
      _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
      const msgErro = code === 486 ? 'Ocupado.'
        : code === 404 ? 'Número não encontrado.'
        : code === 403 ? 'Chamada não autorizada.'
        : cause === 'Canceled' ? 'Chamada cancelada.'
        : `Falha na chamada (${code || cause || 'erro desconhecido'})`;
      if (mountedRef.current) setErroMsg(msgErro);
      setChamadaAtiva(null);
      _clearAudio();
    });

    return true;
  }, [sipStatus]);

  // ── ATENDER chamada entrante ──────────────────────────────────────────────
  const atenderChamada = useCallback(() => {
    if (!chamadaEntrante?.session) return;
    _stopRing();
    const { session, origem, clienteId, clienteNome } = chamadaEntrante;

    session.answer({
      mediaConstraints: { audio: true, video: false },
      pcConfig: {
        iceServers: [
          { urls: 'stun:app.nvoip.com.br:3478' },
          { urls: 'stun:stun.l.google.com:19302' },
        ],
        iceTransportPolicy: 'all',
        bundlePolicy      : 'balanced',
        rtcpMuxPolicy     : 'require',
      },
    });

    inicioRef.current = Date.now();
    setChamadaEntrante(null);
    setChamadaAtiva({ session, destino: origem, clienteNome, clienteId, direcao: 'entrada', status: 'em_ligacao' });

    session.on('confirmed', () => _attachAudio(session));
    session.on('ended', () => {
      const dur = inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0;
      _salvarHistorico(origem, 'entrada', 'atendida', dur, clienteId, clienteNome);
      setChamadaAtiva(null);
      _clearAudio();
    });
    session.on('failed', () => { setChamadaAtiva(null); _clearAudio(); });
  }, [chamadaEntrante]);

  // ── REJEITAR chamada entrante ─────────────────────────────────────────────
  const rejeitarChamada = useCallback(() => {
    _stopRing();
    if (chamadaEntrante?.session) {
      try { chamadaEntrante.session.terminate({ status_code: 486, reason_phrase: 'Busy Here' }); } catch {}
      _salvarHistorico(chamadaEntrante.origem, 'entrada', 'nao_atendida', 0, chamadaEntrante.clienteId, chamadaEntrante.clienteNome);
    }
    setChamadaEntrante(null);
  }, [chamadaEntrante]);

  // ── ENCERRAR chamada ativa ────────────────────────────────────────────────
  const encerrarChamada = useCallback(() => {
    _clearCallTimeout();
    if (chamadaAtiva?.session) { try { chamadaAtiva.session.terminate(); } catch {} }
    setChamadaAtiva(null);
    _clearAudio();
  }, [chamadaAtiva]);

  return {
    sipStatus, erroMsg,
    chamadaAtiva, chamadaEntrante,
    conectar, desconectar,
    realizarChamada, atenderChamada, rejeitarChamada, encerrarChamada,
  };
}