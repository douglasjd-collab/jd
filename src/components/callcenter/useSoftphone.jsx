import { useState, useEffect, useRef, useCallback } from 'react';
import JsSIP from 'jssip';
import { base44 } from '@/api/base44Client';

/**
 * Hook Softphone WebRTC — NVOIP
 * wss://app.nvoip.com.br:7443 — INVITE SIP direto, sem callback.
 * Suporta chamadas de saída e RECEBIMENTO de chamadas.
 */
export default function useSoftphone(config) {
  const [sipStatus, setSipStatus] = useState('desconectado');
  const [erroMsg, setErroMsg] = useState('');
  const [chamadaAtiva, setChamadaAtiva] = useState(null);
  const [chamadaEntrante, setChamadaEntrante] = useState(null); // { session, origem, clienteNome, clienteId }

  const uaRef = useRef(null);
  const audioRef = useRef(null);
  const ringRef = useRef(null);
  const inicioRef = useRef(null);
  const configRef = useRef(config);
  const colabCacheRef = useRef(null);
  const reconnectTimerRef = useRef(null); // timer de reconexão automática
  const mountedRef = useRef(true); // evita setState após unmount

  useEffect(() => { configRef.current = config; }, [config]);

  // Elemento de áudio remoto persistente
  useEffect(() => {
    audioRef.current = document.createElement('audio');
    audioRef.current.autoplay = true;
    document.body.appendChild(audioRef.current);
    return () => {
      if (audioRef.current) { audioRef.current.srcObject = null; audioRef.current.remove(); }
    };
  }, []);

  // ── ringtone ────────────────────────────────────────────────────────────────
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

  // ── áudio ───────────────────────────────────────────────────────────────────
  const _attachAudio = (session) => {
    const pc = session.connection;
    if (!pc) return;
    const attach = () => {
      const track = (pc.getReceivers?.() || []).find(r => r.track?.kind === 'audio')?.track;
      if (track && audioRef.current) {
        audioRef.current.srcObject = new MediaStream([track]);
        audioRef.current.play().catch(() => {});
      }
    };
    attach();
    pc.ontrack = (e) => {
      if (e.streams?.[0] && audioRef.current) {
        audioRef.current.srcObject = e.streams[0];
        audioRef.current.play().catch(() => {});
      }
    };
  };
  const _clearAudio = () => { if (audioRef.current) audioRef.current.srcObject = null; };

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

  // ── buscar cliente pelo número ───────────────────────────────────────────
  const _buscarCliente = async (numero) => {
    try {
      const colab = await _getColab();
      if (!colab?.empresa_id) return null;
      const numLimpo = numero.replace(/\D/g, '');
      // Tenta sufixos: número completo, sem 55, sem 55+DDD
      const variantes = [numLimpo];
      if (numLimpo.startsWith('55') && numLimpo.length >= 12) variantes.push(numLimpo.slice(2));
      if (numLimpo.length === 13) variantes.push(numLimpo.slice(4)); // sem 55+DDD

      const clientes = await base44.entities.Cliente.filter({ empresa_id: colab.empresa_id });
      const match = clientes.find(c => {
        const t = (c.telefone || '').replace(/\D/g, '');
        const cel = (c.celular || '').replace(/\D/g, '');
        return variantes.some(v => v === t || v === cel);
      });
      return match || null;
    } catch { return null; }
  };

  // ── salvar histórico ────────────────────────────────────────────────────
  const _salvarHistorico = async (numero, direcao, status, durSeg = 0, clienteId = null, clienteNome = null) => {
    try {
      const colab = await _getColab();
      if (!colab?.empresa_id) return;
      const numLimpo = (numero || '').replace(/\D/g, '');

      // Se não passou cliente, tenta buscar
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

  // ── desconectar ─── apenas chamado MANUALMENTE pelo usuário ─────────────────
  const desconectar = useCallback(() => {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
    _stopRing();
    if (mountedRef.current) {
      setSipStatus('desconectado');
      setChamadaAtiva(null);
      setChamadaEntrante(null);
    }
  }, []);

  // ── conectar / registrar ramal ─────────────────────────────────────────────
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

    const socket = new JsSIP.WebSocketInterface('wss://app.nvoip.com.br:7443');
    const ua = new JsSIP.UA({
      sockets              : [socket],
      uri                  : `sip:${cfg.numbersip}@app.nvoip.com.br`,
      password             : cfg.sip_password,
      authorization_user   : String(cfg.numbersip),
      display_name         : String(cfg.numbersip),
      register             : true,
      register_expires     : 600,
      session_timers       : false,
      use_preloaded_route  : false,
      no_answer_timeout    : 60,
      connection_recovery_min_interval: 2,
      connection_recovery_max_interval: 32,
      log                  : { builtinEnabled: false, level: 'error' },
    });

    ua.on('connecting',    () => { if (mountedRef.current) setSipStatus('conectando'); });
    ua.on('connected',     () => { if (mountedRef.current) setSipStatus('conectando'); });
    ua.on('registered',    () => {
      if (!mountedRef.current) return;
      setSipStatus('registrado');
      setErroMsg('');
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      console.log(`✅ SIP registrado: ${cfg.numbersip} — aguardando chamadas entrantes`);
      // Diagnóstico: imprime o Contact header registrado (contém o endereço que o servidor usa para rotear INVITEs)
      try {
        const regContact = ua.contact?.toString?.();
        console.log('📋 Contact registrado:', regContact);
      } catch {}
    });
    ua.on('unregistered',  () => {
      if (!mountedRef.current) return;
      // JsSIP re-registra automaticamente — não destruir o UA
      setSipStatus('conectando');
    });
    ua.on('disconnected',  (e) => {
      if (!mountedRef.current) return;
      const cause = e?.cause || '';
      console.warn('🔌 WebSocket desconectado:', cause);
      setSipStatus('conectando');
      setErroMsg('');
      // NÃO destruir o UA — deixar o JsSIP reconectar sozinho via
      // connection_recovery. Só força nova instância se o UA já foi limpo.
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        // Se o UA ainda existe, ele já está tentando reconectar internamente
        if (uaRef.current) {
          try { uaRef.current.start(); } catch {}
        } else if (configRef.current?.sip_password) {
          console.log('🔄 UA destruído externamente, recriando...');
          conectar();
        }
      }, 5000);
    });
    ua.on('registrationFailed', (e) => {
      if (!mountedRef.current) return;
      const code = e?.response?.status_code;
      // 401/403 = credencial errada → não reconectar automaticamente
      if (code === 401 || code === 403) {
        setSipStatus('erro');
        setErroMsg('Senha SIP incorreta. Verifique em "Meu Ramal".');
      } else if (code === 404) {
        setSipStatus('erro');
        setErroMsg('Ramal SIP não encontrado no servidor NVOIP.');
      } else {
        // Outros erros: tenta reconectar após 5s
        setSipStatus('conectando');
        setErroMsg('');
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current && configRef.current?.sip_password) conectar();
        }, 5000);
      }
    });

    // ── CHAMADA ENTRANTE ────────────────────────────────────────────────────
    ua.on('newRTCSession', (data) => {
      const { session, originator } = data;
      console.log(`📞 newRTCSession — originator: ${originator}`, session?.remote_identity?.uri?.toString?.(), '| direction:', session?.direction);
      if (originator === 'local') return;

      // Extrai número de origem
      const origem = session.remote_identity?.uri?.user
        || session.remote_identity?.display_name
        || 'Desconhecido';

      console.log(`📲 Chamada ENTRANTE de: ${origem}`);

      // Pré-configura ICE para que o SDP de resposta já inclua os servidores STUN
      try {
        session._rtcOfferConstraints = { offerToReceiveAudio: true, offerToReceiveVideo: false };
      } catch {}

      // Coloca como "tocando" sem cliente ainda; busca assíncrona e atualiza
      setChamadaEntrante({ session, origem, clienteNome: null, clienteId: null, buscando: true });
      _startRing();

      // Busca cliente em background e atualiza popup
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
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
    };
  }, []);

  // Auto-conecta ao receber config válida — conecta 1x, sem re-conectar em re-renders
  const lastConnectedRef = useRef('');
  useEffect(() => {
    if (!config?.numbersip || !config?.sip_password) {
      if (config?.numbersip && !config?.sip_password) {
        setSipStatus('erro');
        setErroMsg('Senha SIP não configurada. Acesse "Meu Ramal".');
      }
      return;
    }
    const key = `${config.numbersip}|${config.sip_password}`;
    if (lastConnectedRef.current === key && uaRef.current) return;
    lastConnectedRef.current = key;
    conectar();
  }, [config?.numbersip, config?.sip_password]); // eslint-disable-line

  // ── CHAMADA DE SAÍDA ──────────────────────────────────────────────────────
  const realizarChamada = useCallback(async (numero) => {
    if (!uaRef.current || sipStatus !== 'registrado') return false;

    // Solicita permissão de microfone ANTES de tentar a chamada
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach(t => t.stop()); // libera imediatamente, JsSIP abrirá novo stream
    } catch (err) {
      console.warn('🎤 Permissão de microfone negada:', err.message);
      setErroMsg('Permissão de microfone negada. Clique no ícone de cadeado na barra do navegador e permita o microfone, depois recarregue a página.');
      return false;
    }

    const cfg = configRef.current;
    const numLimpo = numero.replace(/\D/g, '');
    const destino = `sip:${numLimpo}@app.nvoip.com.br`;

    const session = uaRef.current.call(destino, {
      mediaConstraints: { audio: true, video: false },
      rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
      pcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun.nvoip.com.br:3478' },
        ],
      },
      extraHeaders: cfg?.numero_did ? [`X-Caller-ID: ${cfg.numero_did}`] : [],
    });

    // Log de estado ICE para diagnóstico
    session.on('peerconnection', (data) => {
      const pc = data.peerconnection;
      if (!pc) return;
      pc.oniceconnectionstatechange = () => {
        console.log(`🧊 ICE state: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'failed') {
          console.warn('❌ ICE falhou — verifique firewall/NAT');
        }
      };
      pc.onicegatheringstatechange = () => {
        console.log(`🧊 ICE gathering: ${pc.iceGatheringState}`);
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) console.log(`🧊 Candidate: ${e.candidate.type} ${e.candidate.address || ''}`);
      };
    });

    inicioRef.current = null;
    setChamadaAtiva({ session, destino: numLimpo, direcao: 'saida', status: 'chamando' });

    session.on('progress',  (e) => { console.log('📞 progress', e?.response?.status_code); setChamadaAtiva(p => p ? { ...p, status: 'chamando' } : null); });
    session.on('accepted',  () => { inicioRef.current = Date.now(); setChamadaAtiva(p => p ? { ...p, status: 'em_ligacao' } : null); _attachAudio(session); });
    session.on('confirmed', () => { if (!inicioRef.current) inicioRef.current = Date.now(); setChamadaAtiva(p => p ? { ...p, status: 'em_ligacao' } : null); _attachAudio(session); });
    session.on('ended',  (e) => { console.log('📞 ended', e?.cause); const d = inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0; _salvarHistorico(numLimpo, 'saida', d > 0 ? 'atendida' : 'nao_atendida', d); setChamadaAtiva(null); _clearAudio(); });
    session.on('failed', (e) => { console.warn('📞 failed', e?.cause, e?.response?.status_code, e?.message); _salvarHistorico(numLimpo, 'saida', 'nao_atendida', 0); setChamadaAtiva(null); _clearAudio(); });

    return true;
  }, [sipStatus]);

  // ── ATENDER chamada entrante ───────────────────────────────────────────────
  const atenderChamada = useCallback(() => {
    if (!chamadaEntrante?.session) return;
    _stopRing();
    const { session, origem, clienteId, clienteNome } = chamadaEntrante;

    const cfg = configRef.current;
    session.answer({
      mediaConstraints: { audio: true, video: false },
      pcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun.nvoip.com.br:3478' },
          {
            urls: [
              'turn:turn.nvoip.com.br:3478?transport=udp',
              'turn:turn.nvoip.com.br:3478?transport=tcp',
              'turns:turn.nvoip.com.br:5349?transport=tcp',
            ],
            username: String(cfg?.numbersip || ''),
            credential: String(cfg?.sip_password || ''),
          },
        ],
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
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

  // ── REJEITAR chamada entrante ──────────────────────────────────────────────
  const rejeitarChamada = useCallback(() => {
    _stopRing();
    if (chamadaEntrante?.session) {
      try { chamadaEntrante.session.terminate({ status_code: 486, reason_phrase: 'Busy Here' }); } catch {}
      _salvarHistorico(chamadaEntrante.origem, 'entrada', 'nao_atendida', 0, chamadaEntrante.clienteId, chamadaEntrante.clienteNome);
    }
    setChamadaEntrante(null);
  }, [chamadaEntrante]);

  // ── ENCERRAR chamada ativa ─────────────────────────────────────────────────
  const encerrarChamada = useCallback(() => {
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