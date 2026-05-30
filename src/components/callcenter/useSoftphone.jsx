import { useState, useEffect, useRef, useCallback } from 'react';
import JsSIP from 'jssip';
import { base44 } from '@/api/base44Client';

/**
 * Hook Softphone WebRTC — NVOIP
 * wss://app.nvoip.com.br:7443
 * Logs SIP completos para diagnóstico.
 */

JsSIP.debug.enable('JsSIP:*');

// ── SIP logger global — armazena últimos eventos para diagnóstico ──────────
const SIP_LOG = {
  events: [],
  lastInvite: null,
  lastResponse: null,
  lastError: null,
  push(tipo, detalhe, extra = null) {
    const entry = { ts: new Date().toISOString(), tipo, detalhe, extra };
    this.events.unshift(entry);
    if (this.events.length > 100) this.events.pop();
    console.log(`[SIP] ${tipo}: ${detalhe}`, extra || '');
    if (tipo === 'INVITE')   this.lastInvite   = entry;
    if (tipo.match(/^\d{3}/)) this.lastResponse = entry;
    if (tipo === 'FAILED' || tipo === 'ERROR') this.lastError = entry;
  },
  get() { return [...this.events]; },
};

export { SIP_LOG };

export default function useSoftphone(config) {
  const [sipStatus, setSipStatus]         = useState('desconectado');
  const [erroMsg, setErroMsg]             = useState('');
  const [chamadaAtiva, setChamadaAtiva]   = useState(null);
  const [chamadaEntrante, setChamadaEntrante] = useState(null);

  const uaRef             = useRef(null);
  const audioRef          = useRef(null);
  const ringRef           = useRef(null);
  const inicioRef         = useRef(null);
  const callTimeoutRef    = useRef(null);
  const configRef         = useRef(config);
  const colabCacheRef     = useRef(null);
  const reconnectTimerRef = useRef(null);
  const mountedRef        = useRef(true);
  const lastConnectedRef  = useRef('');
  const sipStatusRef      = useRef('desconectado');

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { sipStatusRef.current = sipStatus; }, [sipStatus]);

  // Elemento de áudio remoto persistente
  useEffect(() => {
    const el = document.createElement('audio');
    el.autoplay = true;
    el.setAttribute('playsinline', '');
    document.body.appendChild(el);
    audioRef.current = el;
    return () => { el.srcObject = null; el.remove(); };
  }, []);

  // ── ringtone ───────────────────────────────────────────────────────────────
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

  // ── áudio ──────────────────────────────────────────────────────────────────
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
    tryAttach();
    pc.addEventListener('track', (e) => {
      console.log('🔊 ontrack event:', e.track?.kind);
      if (e.streams?.[0] && audioRef.current) {
        audioRef.current.srcObject = e.streams[0];
        audioRef.current.play().catch(err => console.warn('play() err:', err));
      } else if (e.track?.kind === 'audio' && audioRef.current) {
        audioRef.current.srcObject = new MediaStream([e.track]);
        audioRef.current.play().catch(err => console.warn('play() err:', err));
      }
    });
  };

  const _clearAudio = () => { if (audioRef.current) audioRef.current.srcObject = null; };

  // ── timeout de chamada ────────────────────────────────────────────────────
  const _startCallTimeout = (session, numHistorico) => {
    _clearCallTimeout();
    callTimeoutRef.current = setTimeout(() => {
      const msg = 'Sem resposta da NVOIP após 30 segundos. Possíveis causas: número inválido, crédito insuficiente, ou rota bloqueada. Verifique o console do navegador (F12) para o log SIP completo.';
      console.warn('⏰ [SIP] TIMEOUT 30s — INVITE sem resposta');
      SIP_LOG.push('TIMEOUT', `30s sem resposta para ${numHistorico}`);
      try { session.terminate(); } catch {}
      if (mountedRef.current) { setErroMsg(msg); setChamadaAtiva(null); }
      _clearAudio();
      _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
    }, 30000);
  };

  const _clearCallTimeout = () => {
    if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
  };

  // ── buscar colaborador (cache) ─────────────────────────────────────────────
  const _getColab = async () => {
    if (colabCacheRef.current) return colabCacheRef.current;
    const me = await base44.auth.me();
    if (!me) return null;
    const colabs = await base44.entities.Colaborador.filter({ user_id: me.id });
    const colab = colabs?.find(c => c.empresa_id && c.status === 'ativo') || colabs?.[0];
    if (colab) colabCacheRef.current = colab;
    return colab;
  };

  // ── buscar cliente pelo número ─────────────────────────────────────────────
  const _buscarCliente = async (numero) => {
    try {
      const colab = await _getColab();
      if (!colab?.empresa_id) return null;
      const numLimpo = numero.replace(/\D/g, '');
      const variantes = [numLimpo];
      if (numLimpo.startsWith('55') && numLimpo.length >= 12) variantes.push(numLimpo.slice(2));
      if (numLimpo.length === 13) variantes.push(numLimpo.slice(4));
      const clientes = await base44.entities.Cliente.filter({ empresa_id: colab.empresa_id });
      return clientes.find(c => {
        const t = (c.telefone || '').replace(/\D/g, '');
        const cel = (c.celular || '').replace(/\D/g, '');
        return variantes.some(v => v === t || v === cel);
      }) || null;
    } catch { return null; }
  };

  // ── salvar histórico ───────────────────────────────────────────────────────
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
        direcao, numero: numLimpo,
        cliente_id: clienteId, cliente_nome: clienteNome,
        status,
        inicio: new Date(Date.now() - durSeg * 1000).toISOString(),
        fim: new Date().toISOString(),
        duracao_segundos: durSeg,
      });
    } catch (e) { console.warn('Histórico chamada:', e.message); }
  };

  // ── desconectar (manual) ───────────────────────────────────────────────────
  const desconectar = useCallback(() => {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    _clearCallTimeout();
    if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
    _stopRing();
    if (mountedRef.current) { setSipStatus('desconectado'); setChamadaAtiva(null); setChamadaEntrante(null); }
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

    SIP_LOG.push('CONNECT', `Conectando ramal ${cfg.numbersip} → wss://app.nvoip.com.br:7443`);
    console.log(`🔌 [SIP] REGISTER: ramal=${cfg.numbersip} | wss://app.nvoip.com.br:7443`);

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

    ua.on('connecting',    () => { SIP_LOG.push('WS_CONNECTING', 'WebSocket conectando...'); if (mountedRef.current) setSipStatus('conectando'); });
    ua.on('connected',     () => { SIP_LOG.push('WS_CONNECTED',  'WebSocket OK'); if (mountedRef.current) setSipStatus('conectando'); });
    ua.on('registered',    () => {
      if (!mountedRef.current) return;
      SIP_LOG.push('REGISTERED', `Ramal ${cfg.numbersip} registrado com sucesso`);
      console.log(`✅ [SIP] REGISTER OK — ramal ${cfg.numbersip}`);
      setSipStatus('registrado');
      setErroMsg('');
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    });
    ua.on('unregistered', () => {
      SIP_LOG.push('UNREGISTERED', 'Ramal desregistrado');
      if (mountedRef.current) setSipStatus('conectando');
    });
    ua.on('disconnected', (e) => {
      SIP_LOG.push('WS_DISCONNECTED', `WebSocket desconectou: ${e?.cause || 'desconhecido'}`);
      if (!mountedRef.current) return;
      setSipStatus('conectando');
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        if (uaRef.current) { try { uaRef.current.start(); } catch {} }
        else if (configRef.current?.sip_password) conectar();
      }, 5000);
    });
    ua.on('registrationFailed', (e) => {
      if (!mountedRef.current) return;
      const code = e?.response?.status_code;
      SIP_LOG.push('REGISTER_FAILED', `Código ${code} — ${e?.cause || 'sem causa'}`, { code, cause: e?.cause });
      console.error(`❌ [SIP] REGISTER FAILED — código: ${code}`, e?.cause);
      if (code === 401 || code === 403) { setSipStatus('erro'); setErroMsg('Senha SIP incorreta. Verifique em "Meu Ramal".'); }
      else if (code === 404) { setSipStatus('erro'); setErroMsg('Ramal SIP não encontrado no servidor NVOIP.'); }
      else {
        setSipStatus('conectando');
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current && configRef.current?.sip_password) conectar();
        }, 5000);
      }
    });

    // ── CHAMADA ENTRANTE ───────────────────────────────────────────────────
    ua.on('newRTCSession', (data) => {
      const { session, originator } = data;
      SIP_LOG.push('NEW_SESSION', `originator=${originator} direction=${session?.direction}`);
      if (originator === 'local') return;

      const origem = session.remote_identity?.uri?.user || session.remote_identity?.display_name || 'Desconhecido';
      SIP_LOG.push('INCOMING', `Chamada entrante de ${origem}`);

      setChamadaEntrante({ session, origem, clienteNome: null, clienteId: null, buscando: true });
      _startRing();

      _buscarCliente(origem).then(c => {
        setChamadaEntrante(prev => {
          if (!prev || prev.session !== session) return prev;
          return { ...prev, clienteNome: c?.nome || null, clienteId: c?.id || null, buscando: false };
        });
      });

      session.on('failed', () => { _stopRing(); _salvarHistorico(origem, 'entrada', 'nao_atendida', 0); setChamadaEntrante(null); });
      session.on('ended',  () => { _stopRing(); setChamadaEntrante(null); setChamadaAtiva(null); _clearAudio(); });
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

  // Auto-conecta ao receber config válida
  useEffect(() => {
    if (!config?.numbersip) return;
    if (!config?.sip_password) { setSipStatus('erro'); setErroMsg('Senha SIP não configurada.'); return; }
    const key = `${config.numbersip}|${config.sip_password}`;
    if (lastConnectedRef.current === key && uaRef.current) return;
    lastConnectedRef.current = key;
    conectar();
  }, [config?.numbersip, config?.sip_password]); // eslint-disable-line

  // ── CHAMADA DE SAÍDA ───────────────────────────────────────────────────────
  const realizarChamada = useCallback(async (numero) => {
    const statusAtual = sipStatusRef.current;
    console.log(`📞 [SIP] realizarChamada — status: ${statusAtual}`);

    if (!uaRef.current || statusAtual !== 'registrado') {
      const msg = `Ramal não registrado (${statusAtual}). Aguarde o status "Pronto".`;
      SIP_LOG.push('ERROR', msg);
      if (mountedRef.current) setErroMsg(msg);
      return false;
    }

    setErroMsg('');

    // Permissão de microfone
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach(t => t.stop());
      SIP_LOG.push('MIC_OK', 'Permissão de microfone concedida');
    } catch (err) {
      const msg = 'Permissão de microfone negada. Permita o microfone e tente novamente.';
      SIP_LOG.push('MIC_DENIED', err.message);
      setErroMsg(msg);
      return false;
    }

    const cfg = configRef.current;

    // ── Formatação e log de todos os formatos testados ─────────────────────
    let numLimpo = numero.replace(/\D/g, '');
    const numOriginal = numLimpo;

    // Se já começa com 55 e tem 13 dígitos (55 + DDD 2 + 9 + número 8) — tudo OK
    // Se não tem 55, adiciona
    if (!numLimpo.startsWith('55') && numLimpo.length <= 11) {
      numLimpo = '55' + numLimpo;
    }

    const formatosSIP = [
      `sip:${numLimpo}@app.nvoip.com.br`,
      `sip:${numOriginal}@app.nvoip.com.br`,
    ];
    const numHistorico = numOriginal;
    const destino = formatosSIP[0];

    SIP_LOG.push('DIAL', `Discando: original=${numOriginal} | com DDI=${numLimpo}`, {
      formatos_testados: formatosSIP,
      ramal_origem: cfg?.numbersip,
      did_saida: cfg?.numero_did || 'não configurado',
    });

    console.log(`📞 [SIP] INVITE → ${destino}`);
    console.log(`📞 [SIP] Ramal origem: ${cfg?.numbersip} | DID saída: ${cfg?.numero_did || 'N/A'}`);
    console.log(`📞 [SIP] Formatos testados:`, formatosSIP);

    let session;
    try {
      session = uaRef.current.call(destino, {
        mediaConstraints    : { audio: true, video: false },
        rtcOfferConstraints : { offerToReceiveAudio: true, offerToReceiveVideo: false },
        pcConfig: {
          iceServers: [
            { urls: 'stun:app.nvoip.com.br:3478' },
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80',   username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443',  username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turns:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
          ],
          iceTransportPolicy: 'all',
          bundlePolicy      : 'max-bundle',
          rtcpMuxPolicy     : 'require',
        },
        extraHeaders: [
          ...(cfg?.numero_did ? [`X-Caller-ID: ${cfg.numero_did.replace(/\D/g, '')}`] : []),
        ],
      });
    } catch (err) {
      SIP_LOG.push('ERROR', `Erro ao criar sessão SIP: ${err.message}`);
      console.error('❌ [SIP] Erro ao criar sessão:', err);
      if (mountedRef.current) setErroMsg('Erro ao iniciar chamada. Verifique a configuração do ramal.');
      return false;
    }

    // Marca chamada ativa e inicia timeout imediatamente
    inicioRef.current = null;
    setChamadaAtiva({ session, destino: numHistorico, direcao: 'saida', status: 'chamando' });
    _startCallTimeout(session, numHistorico);

    // ── Eventos da sessão com logs completos ────────────────────────────────
    session.on('sending', (e) => {
      try {
        const req = e?.request;
        const sdp = req?.body || '';
        SIP_LOG.push('INVITE', `INVITE → ${destino}`, {
          to     : req?.to?.toString?.(),
          from   : req?.from?.toString?.(),
          contact: req?.contact?.[0]?.toString?.(),
          ruri   : req?.ruri?.toString?.(),
          sdp_linhas: sdp.split('\n').length,
          sdp_preview: sdp.substring(0, 200),
        });
        console.log('📤 [SIP] INVITE enviado:', {
          to: req?.to?.toString?.(), from: req?.from?.toString?.(),
          ruri: req?.ruri?.toString?.(),
        });
        console.log('📄 [SIP] SDP offer (primeiras linhas):\n', sdp.split('\n').slice(0, 10).join('\n'));
      } catch {}
    });

    session.on('peerconnection', (data) => {
      const pc = data.peerconnection;
      if (!pc) return;
      SIP_LOG.push('PEERCONNECTION', 'PeerConnection WebRTC criado');

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        SIP_LOG.push('ICE_STATE', state);
        console.log(`🧊 [SIP] ICE: ${state}`);
        if (state === 'failed') {
          SIP_LOG.push('ICE_FAILED', 'ICE connection failed — problema de NAT/TURN');
          _clearCallTimeout();
          try { session.terminate(); } catch {}
          if (mountedRef.current) {
            setErroMsg('Falha WebRTC (ICE failed): sem conectividade de mídia. Verifique firewall/NAT.');
            setChamadaAtiva(null);
          }
          _clearAudio();
          _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
        }
      };
      pc.onicegatheringstatechange = () => {
        SIP_LOG.push('ICE_GATHERING', pc.iceGatheringState);
        console.log(`🧊 [SIP] ICE gathering: ${pc.iceGatheringState}`);
      };
      pc.onconnectionstatechange = () => {
        SIP_LOG.push('PC_STATE', pc.connectionState);
        console.log(`🔗 [SIP] PC state: ${pc.connectionState}`);
        if (pc.connectionState === 'failed') {
          _clearCallTimeout();
          try { session.terminate(); } catch {}
          if (mountedRef.current) { setErroMsg('Falha de conexão WebRTC.'); setChamadaAtiva(null); }
          _clearAudio();
        }
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          console.log(`🧊 [SIP] Candidate: ${e.candidate.type} ${e.candidate.protocol} ${e.candidate.address}`);
        } else {
          SIP_LOG.push('ICE_COMPLETE', 'ICE gathering completo');
          console.log('🧊 [SIP] ICE gathering complete');
        }
      };
      pc.addEventListener('track', (e) => {
        if (e.streams?.[0] && audioRef.current) {
          audioRef.current.srcObject = e.streams[0];
          audioRef.current.play().catch(() => {});
        }
      });
    });

    session.on('progress', (e) => {
      const code = e?.response?.status_code;
      const sdpResp = e?.response?.body || '';
      SIP_LOG.push(`${code}`, `${code} ${e?.response?.reason_phrase || ''}`, {
        sdp_preview: sdpResp.substring(0, 200),
      });
      console.log(`📞 [SIP] ${code} ${e?.response?.reason_phrase || ''}`);
      if (sdpResp) console.log('📄 [SIP] SDP answer preview:\n', sdpResp.split('\n').slice(0, 8).join('\n'));
      if (code === 180) setChamadaAtiva(p => p ? { ...p, status: 'tocando' } : null);
      else setChamadaAtiva(p => p ? { ...p, status: 'chamando' } : null);
    });

    session.on('accepted', (e) => {
      const sdpResp = e?.response?.body || '';
      SIP_LOG.push('200_OK', '200 OK — chamada aceita', { sdp_preview: sdpResp.substring(0, 200) });
      console.log('✅ [SIP] 200 OK — chamada aceita');
      _clearCallTimeout();
      inicioRef.current = Date.now();
      setChamadaAtiva(p => p ? { ...p, status: 'em_ligacao' } : null);
      _attachAudio(session);
    });

    session.on('confirmed', (e) => {
      SIP_LOG.push('ACK', 'ACK enviado — chamada confirmada');
      console.log('✅ [SIP] ACK — chamada confirmada');
      _clearCallTimeout();
      if (!inicioRef.current) inicioRef.current = Date.now();
      setChamadaAtiva(p => p ? { ...p, status: 'em_ligacao' } : null);
      _attachAudio(session);
    });

    session.on('ended', (e) => {
      const dur = inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0;
      SIP_LOG.push('ENDED', `Chamada encerrada — duração ${dur}s | causa: ${e?.cause || 'N/A'}`);
      console.log('📞 [SIP] ENDED:', e?.cause);
      _clearCallTimeout();
      _salvarHistorico(numHistorico, 'saida', dur > 0 ? 'atendida' : 'nao_atendida', dur);
      setChamadaAtiva(null);
      _clearAudio();
    });

    session.on('failed', (e) => {
      const code = e?.response?.status_code;
      const cause = e?.cause;
      const phrase = e?.response?.reason_phrase || '';
      SIP_LOG.push('FAILED', `${code || cause} ${phrase}`, {
        code, cause, phrase,
        response_headers: e?.response?.headers ? Object.keys(e.response.headers) : null,
      });
      console.warn(`❌ [SIP] FAILED — código: ${code} | causa: ${cause} | motivo: ${phrase}`);
      _clearCallTimeout();
      _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);

      // Mensagem de erro específica por código SIP
      const msgErro =
        code === 486 ? `486 Busy Here — número ocupado`
        : code === 603 ? `603 Decline — chamada recusada`
        : code === 404 ? `404 Not Found — número "${numLimpo}" não encontrado na NVOIP. Tente sem DDI ou verifique o formato.`
        : code === 480 ? `480 Temporarily Unavailable — destino temporariamente indisponível`
        : code === 408 ? `408 Timeout — servidor NVOIP não respondeu a tempo`
        : code === 403 ? `403 Forbidden — chamada não autorizada (saldo insuficiente ou rota bloqueada?)`
        : code === 503 ? `503 Service Unavailable — servidor NVOIP sobrecarregado`
        : code === 487 ? `Chamada cancelada`
        : cause === 'Canceled' ? `Chamada cancelada`
        : cause === 'No Answer' ? `Sem resposta (timeout)`
        : code ? `Erro SIP ${code} ${phrase}`
        : `Falha SIP: ${cause || 'desconhecido'} — abra o console (F12) para detalhes`;

      if (mountedRef.current) setErroMsg(msgErro);
      setChamadaAtiva(null);
      _clearAudio();
    });

    return true;
  }, []);

  // ── ATENDER chamada entrante ───────────────────────────────────────────────
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
          { urls: 'turn:openrelay.metered.ca:80',   username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443',  username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turns:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        ],
        iceTransportPolicy: 'all', bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require',
      },
    });
    inicioRef.current = Date.now();
    setChamadaEntrante(null);
    setChamadaAtiva({ session, destino: origem, clienteNome, clienteId, direcao: 'entrada', status: 'em_ligacao' });
    session.on('confirmed', () => _attachAudio(session));
    session.on('ended', () => {
      const dur = inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0;
      _salvarHistorico(origem, 'entrada', 'atendida', dur, clienteId, clienteNome);
      setChamadaAtiva(null); _clearAudio();
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