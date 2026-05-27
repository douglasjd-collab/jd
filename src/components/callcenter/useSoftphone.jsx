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
  const colabCacheRef = useRef(null); // cache do colaborador para não re-buscar toda chamada

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

  // ── desconectar ────────────────────────────────────────────────────────────
  const desconectar = useCallback(() => {
    if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
    _stopRing();
    setSipStatus('desconectado');
    setChamadaAtiva(null);
    setChamadaEntrante(null);
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
      sockets: [socket],
      uri: `sip:${cfg.numbersip}@app.nvoip.com.br`,
      password: cfg.sip_password,
      authorization_user: String(cfg.numbersip),
      display_name: 'JD Promotora',
      register: true,
      register_expires: 600,
      session_timers: false,
      hackIpAddrAnyEnabled: true,   // necessário para receber chamadas atrás de NAT
      connection_recovery_min_interval: 2,
      connection_recovery_max_interval: 30,
      log: { builtinEnabled: true, level: 'debug' },  // ativo temporariamente para diagnosticar
    });

    ua.on('connecting',    () => setSipStatus('conectando'));
    ua.on('connected',     () => setSipStatus('conectando'));
    ua.on('registered',    () => { setSipStatus('registrado'); setErroMsg(''); console.log(`✅ SIP registrado: ${cfg.numbersip}`); });
    ua.on('unregistered',  () => setSipStatus('desconectado'));
    ua.on('disconnected',  () => { setSipStatus('desconectado'); setErroMsg('WebSocket desconectado. Tentando reconectar...'); });
    ua.on('registrationFailed', (e) => {
      const code = e?.response?.status_code;
      setSipStatus('erro');
      if (code === 401 || code === 403) setErroMsg('Senha SIP incorreta. Verifique em "Meu Ramal".');
      else if (code === 404)            setErroMsg('Ramal SIP não encontrado no servidor NVOIP.');
      else                              setErroMsg(`Falha SIP: ${e?.cause || code || 'erro'}`);
    });

    // ── CHAMADA ENTRANTE ────────────────────────────────────────────────────
    ua.on('newRTCSession', (data) => {
      const { session, originator } = data;
      console.log(`📞 newRTCSession — originator: ${originator}`, session?.remote_identity?.uri?.toString?.());
      // 'remote' = entrante | 'local' = saída (saída já tratada em realizarChamada)
      if (originator === 'local') return;

      // Extrai número de origem
      const origem = session.remote_identity?.uri?.user
        || session.remote_identity?.display_name
        || 'Desconhecido';

      console.log(`📲 Chamada ENTRANTE de: ${origem}`);

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

  // Auto-conecta ao receber config válida
  useEffect(() => {
    if (config?.numbersip && config?.sip_password) {
      conectar();
    } else if (config?.numbersip && !config?.sip_password) {
      setSipStatus('erro');
      setErroMsg('Senha SIP não configurada. Acesse "Meu Ramal".');
    }
    return () => desconectar();
  }, [config?.numbersip, config?.sip_password]);

  // ── CHAMADA DE SAÍDA ──────────────────────────────────────────────────────
  const realizarChamada = useCallback((numero) => {
    if (!uaRef.current || sipStatus !== 'registrado') return false;
    const cfg = configRef.current;
    const numLimpo = numero.replace(/\D/g, '');
    const destino = `sip:${numLimpo}@app.nvoip.com.br`;

    const session = uaRef.current.call(destino, {
      mediaConstraints: { audio: true, video: false },
      rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
      pcConfig: { iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]},
      extraHeaders: cfg?.numero_did ? [`X-Caller-ID: ${cfg.numero_did}`] : [],
    });

    inicioRef.current = null;
    setChamadaAtiva({ session, destino: numLimpo, direcao: 'saida', status: 'chamando' });

    session.on('progress',  () => setChamadaAtiva(p => p ? { ...p, status: 'chamando' } : null));
    session.on('accepted',  () => { inicioRef.current = Date.now(); setChamadaAtiva(p => p ? { ...p, status: 'em_ligacao' } : null); _attachAudio(session); });
    session.on('confirmed', () => { if (!inicioRef.current) inicioRef.current = Date.now(); setChamadaAtiva(p => p ? { ...p, status: 'em_ligacao' } : null); _attachAudio(session); });
    session.on('ended',  () => { const d = inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0; _salvarHistorico(numLimpo, 'saida', d > 0 ? 'atendida' : 'nao_atendida', d); setChamadaAtiva(null); _clearAudio(); });
    session.on('failed', () => { _salvarHistorico(numLimpo, 'saida', 'nao_atendida', 0); setChamadaAtiva(null); _clearAudio(); });

    return true;
  }, [sipStatus]);

  // ── ATENDER chamada entrante ───────────────────────────────────────────────
  const atenderChamada = useCallback(() => {
    if (!chamadaEntrante?.session) return;
    _stopRing();
    const { session, origem, clienteId, clienteNome } = chamadaEntrante;

    session.answer({
      mediaConstraints: { audio: true, video: false },
      rtcAnswerConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
      pcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
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