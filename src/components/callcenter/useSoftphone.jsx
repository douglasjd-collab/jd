import { useState, useEffect, useRef, useCallback } from 'react';
import JsSIP from 'jssip';
import { base44 } from '@/api/base44Client';

/**
 * Hook Softphone WebRTC — NVOIP
 * wss://app.nvoip.com.br:7443
 *
 * Suporte completo a:
 * - REGISTER com reautenticação automática (401/407)
 * - INVITE com captura de todas as respostas SIP
 * - Duplo formato URI (com/sem DDI 55)
 * - Diagnóstico em tela via SIP_LOG
 */

JsSIP.debug.enable('JsSIP:*');

// ── SIP logger global ─────────────────────────────────────────────────────────
export const SIP_LOG = {
  events: [],
  lastInvite: null,
  lastResponse: null,
  lastError: null,
  lastSessionStatus: null,
  lastUri: null,

  push(tipo, detalhe, extra = null) {
    const entry = { ts: new Date().toISOString(), tipo, detalhe, extra };
    this.events.unshift(entry);
    if (this.events.length > 150) this.events.pop();
    console.log(`[SIP ${tipo}] ${detalhe}`, extra ? JSON.stringify(extra).substring(0, 200) : '');
    if (tipo === 'INVITE')                    this.lastInvite       = entry;
    if (tipo === 'DIAL')                      this.lastUri          = entry;
    if (tipo.match(/^\d{3}$/))                this.lastResponse     = entry;
    if (tipo === 'FAILED' || tipo === 'ERROR' || tipo === 'TIMEOUT') this.lastError = entry;
    if (['chamando','tocando','em_ligacao','encerrado'].includes(tipo)) this.lastSessionStatus = entry;
  },

  clear() {
    this.events = [];
    this.lastInvite = null;
    this.lastResponse = null;
    this.lastError = null;
    this.lastSessionStatus = null;
    this.lastUri = null;
  },

  get() { return [...this.events]; },
};

export default function useSoftphone(config) {
  const [sipStatus, setSipStatus]             = useState('desconectado');
  const [erroMsg, setErroMsg]                 = useState('');
  const [chamadaAtiva, setChamadaAtiva]       = useState(null);
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

  // ── ringtone ──────────────────────────────────────────────────────────────
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

  // ── áudio ────────────────────────────────────────────────────────────────
  const _attachAudio = (session) => {
    const pc = session.connection;
    if (!pc) return;
    const tryAttach = () => {
      const receivers = pc.getReceivers?.() || [];
      const track = receivers.find(r => r.track?.kind === 'audio')?.track;
      if (track && audioRef.current) {
        audioRef.current.srcObject = new MediaStream([track]);
        audioRef.current.play().catch(() => {});
      }
    };
    tryAttach();
    pc.addEventListener('track', (e) => {
      if (e.streams?.[0] && audioRef.current) {
        audioRef.current.srcObject = e.streams[0];
        audioRef.current.play().catch(() => {});
      } else if (e.track?.kind === 'audio' && audioRef.current) {
        audioRef.current.srcObject = new MediaStream([e.track]);
        audioRef.current.play().catch(() => {});
      }
    });
  };

  const _clearAudio = () => { if (audioRef.current) audioRef.current.srcObject = null; };

  // ── timeout de chamada ───────────────────────────────────────────────────
  const _clearCallTimeout = () => {
    if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
  };

  const _startCallTimeout = (session, numHistorico) => {
    _clearCallTimeout();
    callTimeoutRef.current = setTimeout(() => {
      const msg = 'Timeout 30s — sem resposta SIP após INVITE. Verifique crédito NVOIP, formato do número e configuração do ramal.';
      SIP_LOG.push('TIMEOUT', `30s sem resposta — URI: ${SIP_LOG.lastUri?.detalhe || numHistorico}`);
      try { session.terminate(); } catch {}
      if (mountedRef.current) { setErroMsg(msg); setChamadaAtiva(null); }
      _clearAudio();
      _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
    }, 30000);
  };

  // ── colaborador cache ────────────────────────────────────────────────────
  const _getColab = async () => {
    if (colabCacheRef.current) return colabCacheRef.current;
    const me = await base44.auth.me();
    if (!me) return null;
    const colabs = await base44.entities.Colaborador.filter({ user_id: me.id });
    const colab = colabs?.find(c => c.empresa_id && c.status === 'ativo') || colabs?.[0];
    if (colab) colabCacheRef.current = colab;
    return colab;
  };

  const _buscarCliente = async (numero) => {
    try {
      const colab = await _getColab();
      if (!colab?.empresa_id) return null;
      const n = numero.replace(/\D/g, '');
      const variantes = [n];
      if (n.startsWith('55') && n.length >= 12) variantes.push(n.slice(2));
      if (n.length === 13) variantes.push(n.slice(4));
      const clientes = await base44.entities.Cliente.filter({ empresa_id: colab.empresa_id });
      return clientes.find(c => {
        const t = (c.telefone || '').replace(/\D/g, '');
        const cel = (c.celular || '').replace(/\D/g, '');
        return variantes.some(v => v === t || v === cel);
      }) || null;
    } catch { return null; }
  };

  const _salvarHistorico = async (numero, direcao, status, durSeg = 0, clienteId = null, clienteNome = null) => {
    try {
      const colab = await _getColab();
      if (!colab?.empresa_id) return;
      const n = (numero || '').replace(/\D/g, '');
      if (!clienteId) {
        const c = await _buscarCliente(n);
        if (c) { clienteId = c.id; clienteNome = c.nome; }
      }
      await base44.entities.HistoricoChamadaMicroSIP.create({
        empresa_id: colab.empresa_id,
        usuario_id: colab.id,
        usuario_nome: colab.nome,
        direcao, numero: n,
        cliente_id: clienteId, cliente_nome: clienteNome,
        status,
        inicio: new Date(Date.now() - durSeg * 1000).toISOString(),
        fim: new Date().toISOString(),
        duracao_segundos: durSeg,
      });
    } catch (e) { console.warn('[SIP] Histórico:', e.message); }
  };

  // ── desconectar ──────────────────────────────────────────────────────────
  const desconectar = useCallback(() => {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    _clearCallTimeout();
    if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
    _stopRing();
    if (mountedRef.current) { setSipStatus('desconectado'); setChamadaAtiva(null); setChamadaEntrante(null); }
  }, []);

  // ── conectar / registrar ─────────────────────────────────────────────────
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

    const ramal = String(cfg.numbersip);
    const senha = String(cfg.sip_password);
    const sipDomain = 'app.nvoip.com.br';
    const wssUri = `wss://${sipDomain}:7443`;
    const sipUri = `sip:${ramal}@${sipDomain}`;

    SIP_LOG.push('CONNECT', `Registrando ${ramal} → ${wssUri}`);

    const socket = new JsSIP.WebSocketInterface(wssUri);

    const ua = new JsSIP.UA({
      sockets                         : [socket],
      uri                             : sipUri,
      password                        : senha,
      authorization_user              : ramal,          // ← crítico para 407
      display_name                    : 'JD Promotora',
      register                        : true,
      register_expires                : 300,
      session_timers                  : false,
      use_preloaded_route             : false,
      no_answer_timeout               : 60,
      hack_via_tcp                    : false,
      hack_ip_in_contact              : false,
      contact_uri                     : `sip:${ramal}@${sipDomain};transport=ws`,
      connection_recovery_min_interval: 2,
      connection_recovery_max_interval: 30,
      log                             : { builtinEnabled: true, level: 'debug' },
    });

    ua.on('connecting', () => {
      SIP_LOG.push('WS_CONNECTING', `Conectando ao WebSocket ${wssUri}`);
      if (mountedRef.current) setSipStatus('conectando');
    });

    ua.on('connected', () => {
      SIP_LOG.push('WS_CONNECTED', `WebSocket conectado — enviando REGISTER`);
      if (mountedRef.current) setSipStatus('conectando');
    });

    ua.on('registered', () => {
      if (!mountedRef.current) return;
      SIP_LOG.push('REGISTERED', `✅ Ramal ${ramal} registrado com sucesso em ${sipDomain}`);
      setSipStatus('registrado');
      setErroMsg('');
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    });

    ua.on('unregistered', () => {
      SIP_LOG.push('UNREGISTERED', 'Ramal desregistrado — tentando novamente');
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
      const cause = e?.cause;
      SIP_LOG.push('REGISTER_FAILED', `REGISTER falhou — código ${code} | causa: ${cause}`, { code, cause });
      console.error(`❌ [SIP] REGISTER FAILED — ${code} | ${cause}`);

      if (code === 401 || code === 403 || code === 407) {
        setSipStatus('erro');
        setErroMsg(`Erro ${code}: Senha SIP incorreta ou ramal não autorizado. Verifique em "Meu Ramal".`);
      } else if (code === 404) {
        setSipStatus('erro');
        setErroMsg(`Erro 404: Ramal ${ramal} não encontrado no servidor NVOIP.`);
      } else {
        setSipStatus('conectando');
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current && configRef.current?.sip_password) conectar();
        }, 5000);
      }
    });

    // ── CHAMADA ENTRANTE ────────────────────────────────────────────────────
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

  // ── CHAMADA DE SAÍDA ──────────────────────────────────────────────────────
  const realizarChamada = useCallback(async (numero) => {
    const statusAtual = sipStatusRef.current;

    if (!uaRef.current || statusAtual !== 'registrado') {
      const msg = `Ramal não registrado (status: ${statusAtual}). Aguarde o status "Pronto".`;
      SIP_LOG.push('ERROR', msg);
      if (mountedRef.current) setErroMsg(msg);
      return false;
    }

    setErroMsg('');
    SIP_LOG.clear(); // limpa log anterior para novo diagnóstico limpo

    // Permissão de microfone
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach(t => t.stop());
      SIP_LOG.push('MIC_OK', 'Permissão de microfone concedida');
    } catch (err) {
      const msg = 'Permissão de microfone negada. Permita o microfone e tente novamente.';
      SIP_LOG.push('MIC_DENIED', err.message);
      if (mountedRef.current) setErroMsg(msg);
      return false;
    }

    const cfg = configRef.current;
    const sipDomain = 'app.nvoip.com.br';

    // ── Preparar formatos de URI ────────────────────────────────────────────
    let numLimpo = numero.replace(/\D/g, '');

    // Garante DDI 55 para chamadas nacionais
    let numComDDI = numLimpo;
    if (!numLimpo.startsWith('55')) numComDDI = '55' + numLimpo;
    const numSemDDI = numLimpo.startsWith('55') ? numLimpo.slice(2) : numLimpo;

    // Tenta primeiro SEM DDI (formato local), depois COM DDI
    const uriFormatos = [
      `sip:${numSemDDI}@${sipDomain}`,
      `sip:${numComDDI}@${sipDomain}`,
    ];

    const numHistorico = numSemDDI;
    const destino = uriFormatos[0]; // começa sem DDI

    SIP_LOG.push('DIAL', `Discando número: ${numSemDDI} (com DDI: ${numComDDI})`, {
      uri_principal: uriFormatos[0],
      uri_alternativa: uriFormatos[1],
      ramal_origem: cfg?.numbersip,
      did_saida: cfg?.numero_did || 'não configurado',
    });

    console.log(`📞 [SIP] DIAL → ${uriFormatos[0]} | alt: ${uriFormatos[1]}`);
    console.log(`📞 [SIP] Ramal: ${cfg?.numbersip} | DID: ${cfg?.numero_did || 'N/A'}`);

    const pcConfig = {
      iceServers: [
        { urls: 'stun:app.nvoip.com.br:3478' },
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80',   username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443',  username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turns:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      ],
      iceTransportPolicy: 'all',
      bundlePolicy      : 'max-bundle',
      rtcpMuxPolicy     : 'require',
    };

    const callOptions = {
      mediaConstraints    : { audio: true, video: false },
      rtcOfferConstraints : { offerToReceiveAudio: true, offerToReceiveVideo: false },
      pcConfig,
      extraHeaders: [
        ...(cfg?.numero_did ? [`X-Caller-ID: ${cfg.numero_did.replace(/\D/g, '')}`] : []),
      ],
    };

    let session;
    try {
      session = uaRef.current.call(destino, callOptions);
    } catch (err) {
      SIP_LOG.push('ERROR', `Erro ao criar sessão SIP: ${err.message}`);
      if (mountedRef.current) setErroMsg('Erro ao iniciar chamada. Verifique a configuração do ramal.');
      return false;
    }

    inicioRef.current = null;
    setChamadaAtiva({ session, destino: numHistorico, direcao: 'saida', status: 'chamando' });
    _startCallTimeout(session, numHistorico);

    // ── Eventos da sessão ─────────────────────────────────────────────────
    session.on('sending', (e) => {
      try {
        const req = e?.request;
        const sdp = req?.body || '';
        SIP_LOG.push('INVITE', `INVITE → ${destino}`, {
          to     : req?.to?.toString?.(),
          from   : req?.from?.toString?.(),
          ruri   : req?.ruri?.toString?.(),
          sdp_linhas: sdp.split('\n').length,
          sdp_preview: sdp.substring(0, 300),
        });
        console.log('📤 [SIP] INVITE enviado:', { to: req?.to?.toString?.(), ruri: req?.ruri?.toString?.() });
        console.log('📄 [SIP] SDP offer:\n', sdp.split('\n').slice(0, 12).join('\n'));
      } catch {}
    });

    session.on('peerconnection', (data) => {
      const pc = data.peerconnection;
      if (!pc) return;
      SIP_LOG.push('PEERCONNECTION', 'PeerConnection WebRTC criado');

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        SIP_LOG.push('ICE_STATE', `ICE: ${state}`);
        if (state === 'failed') {
          SIP_LOG.push('ICE_FAILED', 'ICE failed — problema NAT/TURN');
          _clearCallTimeout();
          try { session.terminate(); } catch {}
          if (mountedRef.current) { setErroMsg('Falha WebRTC: ICE failed — sem conectividade de mídia.'); setChamadaAtiva(null); }
          _clearAudio();
          _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
        }
      };
      pc.onicegatheringstatechange = () => SIP_LOG.push('ICE_GATHERING', pc.iceGatheringState);
      pc.onconnectionstatechange   = () => {
        SIP_LOG.push('PC_STATE', pc.connectionState);
        if (pc.connectionState === 'failed') {
          _clearCallTimeout();
          try { session.terminate(); } catch {}
          if (mountedRef.current) { setErroMsg('Falha de conexão WebRTC.'); setChamadaAtiva(null); }
          _clearAudio();
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
      const phrase = e?.response?.reason_phrase || '';
      const sdpResp = e?.response?.body || '';

      SIP_LOG.push(`${code}`, `${code} ${phrase}`, {
        uri_usada: destino,
        sdp_preview: sdpResp.substring(0, 300),
      });
      console.log(`📞 [SIP] ${code} ${phrase} — URI: ${destino}`);
      if (sdpResp) console.log('📄 [SIP] SDP resposta:\n', sdpResp.split('\n').slice(0, 8).join('\n'));

      if (code === 180 || code === 183) {
        setChamadaAtiva(p => p ? { ...p, status: 'tocando' } : null);
      } else {
        setChamadaAtiva(p => p ? { ...p, status: 'chamando' } : null);
      }
    });

    session.on('accepted', (e) => {
      const sdpResp = e?.response?.body || '';
      SIP_LOG.push('200_OK', `200 OK — chamada aceita pela NVOIP`, { sdp_preview: sdpResp.substring(0, 300) });
      console.log('✅ [SIP] 200 OK — chamada aceita');
      _clearCallTimeout();
      inicioRef.current = Date.now();
      setChamadaAtiva(p => p ? { ...p, status: 'em_ligacao' } : null);
      _attachAudio(session);
    });

    session.on('confirmed', () => {
      SIP_LOG.push('ACK', 'ACK — chamada confirmada');
      _clearCallTimeout();
      if (!inicioRef.current) inicioRef.current = Date.now();
      setChamadaAtiva(p => p ? { ...p, status: 'em_ligacao' } : null);
      _attachAudio(session);
    });

    session.on('ended', (e) => {
      const dur = inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0;
      SIP_LOG.push('ENDED', `Chamada encerrada — duração ${dur}s | causa: ${e?.cause || 'N/A'}`);
      _clearCallTimeout();
      _salvarHistorico(numHistorico, 'saida', dur > 0 ? 'atendida' : 'nao_atendida', dur);
      setChamadaAtiva(null);
      _clearAudio();
    });

    session.on('failed', (e) => {
      const code   = e?.response?.status_code;
      const cause  = e?.cause;
      const phrase = e?.response?.reason_phrase || '';

      // Capturar cabeçalhos de autenticação
      const headers  = e?.response?.headers || {};
      const wwwAuth  = headers['WWW-Authenticate']?.[0]?.raw  || null;
      const proxyAuth = headers['Proxy-Authenticate']?.[0]?.raw || null;
      const sdpFailed = e?.response?.body || '';

      SIP_LOG.push('FAILED', `${code || cause} ${phrase}`, {
        code,
        cause,
        phrase,
        uri_usada    : destino,
        www_auth     : wwwAuth,
        proxy_auth   : proxyAuth,
        sdp_preview  : sdpFailed.substring(0, 200),
        headers_keys : Object.keys(headers),
      });

      console.warn(`❌ [SIP] FAILED — ${code} ${phrase} | causa: ${cause} | URI: ${destino}`);
      if (wwwAuth)   console.warn(`❌ [SIP] WWW-Authenticate: ${wwwAuth}`);
      if (proxyAuth) console.warn(`❌ [SIP] Proxy-Authenticate: ${proxyAuth}`);
      console.warn(`❌ [SIP] Headers recebidos:`, Object.keys(headers));

      _clearCallTimeout();
      _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);

      // Se 404 com o primeiro formato (sem DDI), tenta com DDI automaticamente
      if (code === 404 && destino === uriFormatos[0]) {
        SIP_LOG.push('RETRY', `404 no formato sem DDI — tentando com DDI: ${uriFormatos[1]}`);
        console.log(`🔄 [SIP] Tentando formato alternativo: ${uriFormatos[1]}`);

        let session2;
        try {
          session2 = uaRef.current.call(uriFormatos[1], callOptions);
        } catch (err) {
          SIP_LOG.push('ERROR', `Erro na tentativa alternativa: ${err.message}`);
          if (mountedRef.current) setErroMsg(`Erro SIP 404: número não encontrado em nenhum formato.`);
          setChamadaAtiva(null);
          return;
        }

        setChamadaAtiva({ session: session2, destino: numHistorico, direcao: 'saida', status: 'chamando' });
        _startCallTimeout(session2, numHistorico);
        _bindSessionEvents(session2, uriFormatos[1], numHistorico);
        return;
      }

      // Mensagem de erro específica e clara
      const msgErro =
        code === 407 ? `Erro SIP 407: Autenticação do INVITE exigida pelo proxy NVOIP. Verifique a senha SIP do ramal ${cfg?.numbersip}.`
        : code === 401 ? `Erro SIP 401: Credenciais rejeitadas pela NVOIP. Verifique a senha SIP em "Meu Ramal".`
        : code === 403 ? `Erro SIP 403: Chamada proibida — saldo insuficiente ou rota bloqueada na NVOIP.`
        : code === 404 ? `Erro SIP 404: Número "${numSemDDI}" / "${numComDDI}" não encontrado na NVOIP.`
        : code === 480 ? `Erro SIP 480: Destino temporariamente indisponível.`
        : code === 486 ? `Erro SIP 486: Número ocupado.`
        : code === 603 ? `Erro SIP 603: Chamada recusada pelo destino.`
        : code === 408 ? `Erro SIP 408: NVOIP não respondeu ao INVITE (timeout do servidor).`
        : code === 503 ? `Erro SIP 503: Servidor NVOIP sobrecarregado ou indisponível.`
        : code === 487 ? `Chamada cancelada.`
        : cause === 'Canceled' ? `Chamada cancelada pelo usuário.`
        : cause === 'No Answer' ? `Sem resposta após timeout.`
        : code ? `Erro SIP ${code} ${phrase} — URI: ${destino}`
        : `Falha SIP: ${cause || 'desconhecido'} — verifique o painel de diagnóstico abaixo.`;

      if (mountedRef.current) setErroMsg(msgErro);
      setChamadaAtiva(null);
      _clearAudio();
    });

    return true;
  }, []);

  // ── Bind eventos para sessão de retry ─────────────────────────────────────
  const _bindSessionEvents = (session, destino, numHistorico) => {
    session.on('sending', (e) => {
      try {
        const req = e?.request;
        SIP_LOG.push('INVITE', `INVITE (retry) → ${destino}`, { ruri: req?.ruri?.toString?.() });
      } catch {}
    });
    session.on('progress', (e) => {
      const code = e?.response?.status_code;
      SIP_LOG.push(`${code}`, `${code} ${e?.response?.reason_phrase || ''} (retry)`, { uri_usada: destino });
      if (code === 180 || code === 183) setChamadaAtiva(p => p ? { ...p, status: 'tocando' } : null);
    });
    session.on('accepted', (e) => {
      SIP_LOG.push('200_OK', `200 OK (retry) — URI: ${destino}`);
      _clearCallTimeout();
      inicioRef.current = Date.now();
      setChamadaAtiva(p => p ? { ...p, status: 'em_ligacao' } : null);
      _attachAudio(session);
    });
    session.on('confirmed', () => {
      SIP_LOG.push('ACK', `ACK (retry) — URI: ${destino}`);
      _clearCallTimeout();
      if (!inicioRef.current) inicioRef.current = Date.now();
      setChamadaAtiva(p => p ? { ...p, status: 'em_ligacao' } : null);
      _attachAudio(session);
    });
    session.on('ended', (e) => {
      const dur = inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0;
      SIP_LOG.push('ENDED', `Chamada encerrada (retry) — duração ${dur}s`);
      _clearCallTimeout();
      _salvarHistorico(numHistorico, 'saida', dur > 0 ? 'atendida' : 'nao_atendida', dur);
      setChamadaAtiva(null);
      _clearAudio();
    });
    session.on('failed', (e) => {
      const code = e?.response?.status_code;
      const cause = e?.cause;
      const phrase = e?.response?.reason_phrase || '';
      SIP_LOG.push('FAILED', `${code || cause} ${phrase} (retry) — URI: ${destino}`, { code, cause });
      _clearCallTimeout();
      _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
      const msg = code
        ? `Erro SIP ${code} ${phrase} (também falhou com DDI alternativo — URI: ${destino})`
        : `Falha SIP: ${cause} — verifique o diagnóstico abaixo.`;
      if (mountedRef.current) setErroMsg(msg);
      setChamadaAtiva(null);
      _clearAudio();
    });
  };

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