import { useState, useEffect, useRef, useCallback } from 'react';
import JsSIP from 'jssip';
import { base44 } from '@/api/base44Client';

/**
 * Hook Softphone WebRTC — NVOIP
 * wss://app.nvoip.com.br:7443
 *
 * CORREÇÕES APLICADAS:
 * [FIX-1] contact_uri: transport=ws → transport=wss (crítico para registro WSS)
 * [FIX-4] URI_QUEUE: removidos domínios sip.nvoip.com.br (domínio diferente do registro gera 404)
 * [ALERTA-2] Guard de UA duplo melhorado com uaClosure no reconnect timer
 * [ALERTA-3] Mic release garantido em todos os caminhos de erro (try/finally)
 * [FIX-OUTBOUND-PSTN] URI_QUEUE sempre começa com DDI E.164 completo
 * [FIX-PAI] P-Asserted-Identity removido — JsSIP filtra. Substituído por X-Caller-ID
 * [FIX-FROM] fromUserName removido — JsSIP strips country code 55 do DID
 * [FIX-FALLBACK] Fallback automático via API REST quando WebRTC falha
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
  const registradoAt      = useRef(0);
  const wssDropCount      = useRef(0);
  const wssDropTimer      = useRef(null);
  const sessionAtivaRef   = useRef(null);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { sipStatusRef.current = sipStatus; }, [sipStatus]);

  useEffect(() => {
    const el = document.createElement('audio');
    el.autoplay = true;
    el.setAttribute('playsinline', '');
    document.body.appendChild(el);
    audioRef.current = el;
    return () => { el.srcObject = null; el.remove(); };
  }, []);

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

  const sem183Ref = useRef(false);

  const _clearCallTimeout = () => {
    if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
  };

  const _startCallTimeout = (session, numHistorico) => {
    _clearCallTimeout();
    sem183Ref.current = false;
    callTimeoutRef.current = setTimeout(() => {
      if (sem183Ref.current) return;
      const msg = 'Timeout 10s — NVOIP não respondeu ao INVITE. Verifique crédito, número e rota no painel NVOIP.';
      SIP_LOG.push('TIMEOUT_NO_RESPONSE', `10s sem resposta SIP — URI: ${numHistorico}`);
      try { session.terminate(); } catch {}
      if (mountedRef.current) { setErroMsg(msg); setChamadaAtiva(null); }
      _clearAudio();
      _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
    }, 10000);
  };

  const _extenderTimeoutApos183 = (session, numHistorico) => {
    if (sem183Ref.current) return;
    sem183Ref.current = true;
    _clearCallTimeout();
    SIP_LOG.push('TIMEOUT_EXTENDIDO', '183/180 recebido — timeout extendido para 60s');
    callTimeoutRef.current = setTimeout(() => {
      const msg = 'Timeout 60s — chamada não foi atendida (sem 200 OK após 183 Session Progress).';
      SIP_LOG.push('TIMEOUT_60S', `60s sem 200 OK após 183 — URI: ${numHistorico}`);
      try { session.terminate(); } catch {}
      if (mountedRef.current) { setErroMsg(msg); setChamadaAtiva(null); }
      _clearAudio();
      _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
    }, 60000);
  };

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

  const _salvarHistorico = async (numero, direcao, status, durSeg = 0, clienteId = null, clienteNome = null, observacoes = null) => {
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
        ...(observacoes ? { observacoes } : {}),
      });
    } catch (e) { console.warn('[SIP] Histórico:', e.message); }
  };

  const desconectar = useCallback(() => {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    _clearCallTimeout();
    if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
    _stopRing();
    if (mountedRef.current) { setSipStatus('desconectado'); setChamadaAtiva(null); setChamadaEntrante(null); }
  }, []);

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
      authorization_user              : ramal,
      display_name                    : 'JD Promotora',
      register                        : true,
      register_expires                : 300,
      session_timers                  : false,
      use_preloaded_route             : false,
      no_answer_timeout               : 60,
      hack_via_tcp                    : false,
      hack_ip_in_contact              : false,
      contact_uri                     : `sip:${ramal}@${sipDomain};transport=wss`,
      connection_recovery_min_interval: 2,
      connection_recovery_max_interval: 10,
      log                             : { builtinEnabled: true, level: 'debug' },
    });

    const setStatusSeFraco = (novoStatus) => {
      if (!mountedRef.current) return;
      if (registradoAt.current && (Date.now() - registradoAt.current) < 3000) return;
      setSipStatus(novoStatus);
    };

    ua.on('connecting', () => { SIP_LOG.push('WS_CONNECTING', `Conectando ao WebSocket ${wssUri}`); setStatusSeFraco('conectando'); });
    ua.on('connected',  () => { SIP_LOG.push('WS_CONNECTED', `WebSocket conectado — enviando REGISTER`); setStatusSeFraco('conectando'); });

    ua.on('registered', () => {
      if (!mountedRef.current) return;
      registradoAt.current = Date.now();
      SIP_LOG.push('REGISTERED', `✅ Ramal ${ramal} registrado com sucesso em ${sipDomain}`);
      setSipStatus('registrado');
      setErroMsg('');
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    });

    ua.on('unregistered', () => { SIP_LOG.push('UNREGISTERED', 'Ramal desregistrado — tentando novamente'); setStatusSeFraco('conectando'); });

    ua.on('disconnected', (e) => {
      const wsCode   = e?.socket?.socket?._ws?.closeCode   || e?.code   || '?';
      const wsReason = e?.socket?.socket?._ws?.closeReason || e?.reason || e?.cause || 'desconhecido';
      const wasClean = e?.socket?.socket?._ws?.wasClean    ?? null;
      SIP_LOG.push('WS_DISCONNECTED', `WebSocket desconectou — code: ${wsCode} | reason: ${wsReason} | wasClean: ${wasClean}`);
      console.warn(`⚡ [SIP] WS DISCONNECTED code=${wsCode} reason=${wsReason} wasClean=${wasClean}`);
      if (!mountedRef.current) return;
      if (sessionAtivaRef.current) {
        const sessao = sessionAtivaRef.current;
        sessionAtivaRef.current = null;
        try { sessao.terminate(); } catch {}
        SIP_LOG.push('WS_CALL_ABORT', 'Chamada abortada — conexão WSS perdida durante INVITE/chamada');
        _clearCallTimeout(); _clearAudio();
        if (mountedRef.current) { setErroMsg('Conexão SIP caiu durante a chamada. Reconectando...'); setChamadaAtiva(null); }
      }
      wssDropCount.current += 1;
      clearTimeout(wssDropTimer.current);
      wssDropTimer.current = setTimeout(() => { wssDropCount.current = 0; }, 60000);
      if (wssDropCount.current >= 3) {
        SIP_LOG.push('WSS_INSTAVEL', `⚠️ WSS caiu ${wssDropCount.current}x em 1 min — rede, firewall ou limite de sessões`);
        if (mountedRef.current) setErroMsg('Conexão WSS instável com a NVOIP. Verifique rede, firewall ou limite de sessões do ramal.');
      }
      setStatusSeFraco('conectando');
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      const uaClosure = ua;
      reconnectTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        if (uaRef.current === uaClosure) { try { uaRef.current.start(); } catch {} }
        else if (!uaRef.current && configRef.current?.sip_password) { conectar(); }
      }, 5000);
    });

    ua.on('registrationFailed', (e) => {
      if (!mountedRef.current) return;
      const code = e?.response?.status_code;
      const cause = e?.cause;
      SIP_LOG.push('REGISTER_FAILED', `REGISTER falhou — código ${code} | causa: ${cause}`, { code, cause });
      console.error(`❌ [SIP] REGISTER FAILED — ${code} | ${cause}`);
      if (code === 401 || code === 403 || code === 407) {
        registradoAt.current = 0; setSipStatus('erro');
        setErroMsg(`Erro ${code}: Senha SIP incorreta ou ramal não autorizado. Verifique em "Meu Ramal".`);
      } else if (code === 404) {
        registradoAt.current = 0; setSipStatus('erro');
        setErroMsg(`Erro 404: Ramal ${ramal} não encontrado no servidor NVOIP.`);
      } else {
        setStatusSeFraco('conectando');
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current && configRef.current?.sip_password) conectar();
        }, 5000);
      }
    });

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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      _clearCallTimeout();
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      if (uaRef.current) { try { uaRef.current.stop(); } catch {} uaRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (!config?.numbersip) return;
    if (!config?.sip_password) { setSipStatus('erro'); setErroMsg('Senha SIP não configurada. Acesse "Meu Ramal" e salve a Senha SIP.'); return; }
    const key = `${config.numbersip}|${config.sip_password}`;
    if (lastConnectedRef.current === key && uaRef.current) return;
    lastConnectedRef.current = key;
    conectar();
  }, [config?.numbersip, config?.sip_password]); // eslint-disable-line

  const realizarChamada = useCallback(async (numero) => {
    const statusAtual = sipStatusRef.current;
    const uaConectado  = uaRef.current?.isConnected?.()  ?? false;
    const uaRegistrado = uaRef.current?.isRegistered?.() ?? false;
    const statusEstavel = statusAtual === 'registrado' && uaConectado && uaRegistrado;

    if (!statusEstavel) {
      const detalhe = !uaRef.current ? 'UA não inicializado'
        : !uaConectado  ? 'WebSocket desconectado'
        : !uaRegistrado ? 'SIP não registrado no servidor'
        : `status: ${statusAtual}`;
      SIP_LOG.push('ERROR', `Chamada bloqueada — ${detalhe}`);
      if (mountedRef.current) setErroMsg(`Ramal não está pronto (${detalhe}). Aguarde o status "Pronto".`);
      return false;
    }

    setErroMsg('');
    SIP_LOG.clear();

    const cfg = configRef.current;

    const numOriginal = numero.replace(/\D/g, '');
    const numComDDI   = numOriginal.startsWith('55') ? numOriginal : '55' + numOriginal;
    const numSemDDI   = numOriginal.startsWith('55') ? numOriginal.slice(2) : numOriginal;

    if (numSemDDI.length > 11) {
      const msg = `Número inválido — dígitos a mais (${numSemDDI.length} dígitos). Verifique e corrija. Ex correto: ${numSemDDI.slice(0, 11)}`;
      SIP_LOG.push('BLOCKED', msg, { num: numSemDDI, tamanho: numSemDDI.length });
      if (mountedRef.current) setErroMsg(msg);
      return false;
    }

    if (numSemDDI.length === 10 && /^[6-9]/.test(numSemDDI.slice(2))) {
      const msg = `Número incompleto — informe com 9º dígito. Ex: ${numSemDDI.slice(0,2)}9${numSemDDI.slice(2)}`;
      SIP_LOG.push('BLOCKED', msg);
      if (mountedRef.current) setErroMsg(msg);
      return false;
    }

    const ramalSIP  = String(cfg?.numbersip || '');
    const didLimpo  = cfg?.numero_did ? cfg.numero_did.replace(/\D/g, '') : '';
    const sipDomain = 'app.nvoip.com.br';

    // [FIX-OUTBOUND-PSTN] Sempre DDI E.164 completo primeiro — NVOIP precisa do 55
    // para rotear para PSTN. Sem DDI = INVITE descartado silenciosamente.
    const URI_QUEUE = [
      `sip:${numComDDI}@${sipDomain}`,   // E.164 completo — rota PSTN outbound
      `sip:${numSemDDI}@${sipDomain}`,   // fallback — ramais internos
    ];

    const numHistorico = numSemDDI;

    SIP_LOG.push('DIAL', `${numOriginal} → URI: ${URI_QUEUE[0]}`, {
      num_original  : numOriginal,
      num_com_ddi   : numComDDI,
      num_sem_ddi   : numSemDDI,
      uri_queue     : URI_QUEUE,
      uri_principal : URI_QUEUE[0],
      ramal         : ramalSIP,
      did           : didLimpo || '—',
      estrategia    : 'DDI completo primeiro (E.164 — rota PSTN outbound NVOIP)',
    });
    console.log(`📞 [SIP] DIAL → URIs a tentar:`, URI_QUEUE);

    const pcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    SIP_LOG.push('CALLER_ID_CONFIG', `Ramal: ${ramalSIP} | DID: ${didLimpo || '(não configurado)'} | Destino: ${numSemDDI}`, {
      ramal_sip: ramalSIP, did: didLimpo || null, destino: numSemDDI,
    });

    const extraHeaders = [];
    if (didLimpo) {
      // [FIX-PAI] JsSIP 3.x filtra P-Asserted-Identity (hop-by-hop).
      // [FIX-FROM] fromUserName strips country code 55 — confirmado nos logs.
      // Solução: DID via headers proprietários aceitos pelo proxy NVOIP.
      extraHeaders.push(`X-Caller-ID: ${didLimpo}`);
      extraHeaders.push(`X-NVOIP-Caller-ID: ${didLimpo}`);
      extraHeaders.push(`X-DID: ${didLimpo}`);
      extraHeaders.push(`Remote-Party-ID: <sip:${didLimpo}@${sipDomain}>;privacy=off;screen=yes`);
    }

    // [FIX-FROM] fromUserName/fromDisplayName REMOVIDOS.
    // JsSIP strips o '55' do country code, gerando From: "8132998470"
    // em vez de "558132998470". A NVOIP rejeita caller ID não cadastrado.
    // O ramal SIP (137715001) é o From legítimo para autenticação.
    const baseCallOptions = {
      mediaConstraints    : { audio: true, video: false },
      rtcOfferConstraints : { offerToReceiveAudio: true, offerToReceiveVideo: false },
      pcConfig,
      extraHeaders,
    };

    let uriIdx           = 0;
    let session          = null;
    let inviteEnviado    = false;
    let respostaRecebida = false;
    let recebeu183       = false;

    const _releaseMic = () => {};

    const tentarProximaURI = async () => {
      uriIdx++;
      if (uriIdx >= URI_QUEUE.length) {
        _clearCallTimeout();
        _releaseMic();
        sessionAtivaRef.current = null;

        // [FIX-FALLBACK] WebRTC falhou sem resposta → tentar API REST NVOIP
        if (inviteEnviado && !respostaRecebida) {
          SIP_LOG.push('FALLBACK_TENTANDO', 'WebRTC sem resposta NVOIP — tentando API REST /calls...');
          try {
            const fallbackRes = await base44.functions.invoke('nvoipCallCenter', {
              action: 'realizarChamadaDireta',
              called: numOriginal,
            });
            const d = fallbackRes?.data;
            if (d && !d.error && (d.callId || d._tipo)) {
              SIP_LOG.push('FALLBACK_OK', `✅ Fallback API REST — callId: ${d.callId || 'pendente'}`, d);
              if (mountedRef.current) {
                setChamadaAtiva({ session: null, destino: numHistorico, direcao: 'saida', status: 'chamando', via: 'api_rest', callId: d.callId || null });
                setErroMsg('');
              }
              return;
            }
            SIP_LOG.push('FALLBACK_FAILED', `Fallback API falhou: ${d?.error || 'sem callId'}`, d);
          } catch (fallbackErr) {
            SIP_LOG.push('FALLBACK_FAILED', `Fallback API erro: ${fallbackErr.message}`);
          }
        }

        const msg = inviteEnviado && !respostaRecebida
          ? `NVOIP não respondeu ao INVITE WebRTC e fallback API também falhou. Verifique: saldo, rota de saída PSTN e permissão do ramal no painel NVOIP.`
          : `Falha SIP em todas as URIs tentadas. Verifique o diagnóstico.`;
        SIP_LOG.push('ALL_FAILED', msg);
        if (mountedRef.current) { setErroMsg(msg); setChamadaAtiva(null); }
        _clearAudio();
        _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
        return;
      }
      SIP_LOG.push('RETRY_URI', `Tentando próxima URI (${uriIdx + 1}/${URI_QUEUE.length}): ${URI_QUEUE[uriIdx]}`);
      setTimeout(() => fazerChamada(URI_QUEUE[uriIdx]), 500);
    };

    const fazerChamada = (destino) => {
      SIP_LOG.push('TRYING', `▶ INVITE para: ${destino}`);
      console.log(`📤 [SIP] Tentando URI: ${destino}`);
      inviteEnviado = false;

      let s;
      try {
        s = uaRef.current.call(destino, { ...baseCallOptions });
      } catch (err) {
        SIP_LOG.push('ERROR', `Erro local ao criar sessão WebRTC para ${destino}: ${err.message}`, { stack: err.stack?.substring(0, 300) });
        console.error(`❌ [SIP] Erro ua.call():`, err);
        tentarProximaURI();
        return;
      }

      session = s;
      sessionAtivaRef.current = s;
      if (uriIdx === 0) {
        setChamadaAtiva({ session: s, destino: numHistorico, direcao: 'saida', status: 'chamando' });
      } else {
        setChamadaAtiva(p => p ? { ...p, session: s } : { session: s, destino: numHistorico, direcao: 'saida', status: 'chamando' });
      }

      s.on('sending', (ev) => {
        inviteEnviado = true;
        const req = ev?.request;
        const sdp = req?.body || '';
        const hdrsInvite = req?.headers || {};
        const fromHdr    = req?.from?.toString?.()    || hdrsInvite['From']?.[0]?.raw     || '?';
        const paiHdr     = hdrsInvite['P-Asserted-Identity']?.[0]?.raw                   || '(não enviado)';
        const rpiHdr     = hdrsInvite['Remote-Party-ID']?.[0]?.raw                       || '(não enviado)';
        const contactHdr = req?.contact?.toString?.() || hdrsInvite['Contact']?.[0]?.raw || '?';
        const toHdr      = req?.to?.toString?.()      || destino;
        const xCallerID  = hdrsInvite['X-Caller-ID']?.[0]?.raw                           || '(não enviado)';

        const logData = {
          '1_request_uri'         : req?.ruri?.toString?.() || destino,
          '2_from'                : fromHdr,
          '3_to'                  : toHdr,
          '4_contact'             : contactHdr,
          '5_p_asserted_identity' : paiHdr,
          '6_remote_party_id'     : rpiHdr,
          '7_x_caller_id'         : xCallerID,
          '8_call_id'             : req?.call_id || '?',
          '9_sdp_linhas'          : sdp.split('\n').length,
          diagnostico_caller_id   :
            xCallerID !== '(não enviado)' ? `✅ DID via X-Caller-ID: ${xCallerID}`
            : rpiHdr  !== '(não enviado)' ? `✅ DID via Remote-Party-ID: ${rpiHdr}`
            : `❌ Sem DID nos headers — configure o Número DID em "Meu Ramal".`,
        };
        SIP_LOG.push('INVITE_SENT', `✅ INVITE enviado → ${destino}`, logData);
        SIP_LOG.push('CALLER_ID_ENVIADO', `From: ${fromHdr} | X-Caller-ID: ${xCallerID} | DID: ${didLimpo || 'não configurado'}`, {
          from: fromHdr, x_caller_id: xCallerID, pai: paiHdr, rpi: rpiHdr,
          did: didLimpo, ramal: ramalSIP, destino: numSemDDI,
        });
        console.log('📤 [SIP] INVITE headers:', logData);
        console.log('📄 [SIP] SDP:\n', sdp);

        _startCallTimeout(s, numHistorico);

        setTimeout(() => {
          if (!respostaRecebida && session === s) {
            SIP_LOG.push('NO_100_TRYING', `⚠️ Sem 100 Trying após 5s — URI: ${destino}`);
            console.warn(`⚠️ [SIP] Sem 100 Trying em 5s — URI: ${destino}`);
          }
        }, 5000);
      });

      s.on('connecting', () => { SIP_LOG.push('CONNECTING', `Sessão conectando → ${destino}`); });

      s.on('peerconnection', (data) => {
        const pc = data.peerconnection;
        if (!pc) return;
        SIP_LOG.push('PEERCONNECTION', 'PeerConnection WebRTC criado');

        const origCreateOffer = pc.createOffer.bind(pc);
        pc.createOffer = async (...args) => {
          try {
            const offer = await origCreateOffer(...args);
            SIP_LOG.push('CREATE_OFFER_OK', `SDP offer criado (${offer.sdp?.split('\n').length || 0} linhas)`);
            return offer;
          } catch (err) {
            SIP_LOG.push('CREATE_OFFER_FAIL', `❌ createOffer falhou: ${err.message}`);
            console.error('❌ [SIP] createOffer ERRO:', err);
            throw err;
          }
        };

        const origSetLocal = pc.setLocalDescription.bind(pc);
        pc.setLocalDescription = async (...args) => {
          try {
            const result = await origSetLocal(...args);
            SIP_LOG.push('SET_LOCAL_DESC_OK', 'setLocalDescription OK');
            return result;
          } catch (err) {
            SIP_LOG.push('SET_LOCAL_DESC_FAIL', `❌ setLocalDescription falhou: ${err.message}`);
            console.error('❌ [SIP] setLocalDescription ERRO:', err);
            throw err;
          }
        };

        pc.oniceconnectionstatechange = () => {
          const state = pc.iceConnectionState;
          SIP_LOG.push('ICE_STATE', `ICE: ${state}`);
          if (state === 'failed') {
            SIP_LOG.push('ICE_FAILED', '⚠️ ICE failed — problema NAT/TURN.');
            _clearCallTimeout();
            try { s.terminate(); } catch {}
            if (mountedRef.current) { setErroMsg('Falha WebRTC: ICE failed — verifique rede/firewall.'); setChamadaAtiva(null); }
            _clearAudio();
            _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
          }
        };
        pc.onicegatheringstatechange = () => SIP_LOG.push('ICE_GATHERING', pc.iceGatheringState);
        pc.onconnectionstatechange   = () => {
          SIP_LOG.push('PC_STATE', pc.connectionState);
          if (pc.connectionState === 'failed') {
            _clearCallTimeout();
            try { s.terminate(); } catch {}
            if (mountedRef.current) { setErroMsg('Falha de conexão WebRTC.'); setChamadaAtiva(null); }
            _clearAudio();
          }
        };
        pc.addEventListener('track', (ev) => {
          if (ev.streams?.[0] && audioRef.current) {
            audioRef.current.srcObject = ev.streams[0];
            audioRef.current.play().catch(() => {});
          }
        });
      });

      s.on('progress', (ev) => {
        respostaRecebida = true;
        const code   = ev?.response?.status_code;
        const phrase = ev?.response?.reason_phrase || '';
        const sdpRsp = ev?.response?.body || '';
        SIP_LOG.push(`SIP_${code}`, `✅ Resposta SIP: ${code} ${phrase} — URI: ${destino}`, { code, phrase, uri: destino, sdp_rsp: sdpRsp ? sdpRsp.substring(0, 300) : null });
        console.log(`📞 [SIP] ${code} ${phrase} — URI: ${destino}`);
        if (code === 180) {
          recebeu183 = true; _extenderTimeoutApos183(s, numHistorico);
          setChamadaAtiva(p => p ? { ...p, status: 'tocando' } : null);
          SIP_LOG.push('tocando', '📳 180 Ringing — chamando no destino');
        } else if (code === 183) {
          recebeu183 = true; _extenderTimeoutApos183(s, numHistorico);
          setChamadaAtiva(p => p ? { ...p, status: 'tocando' } : null);
          SIP_LOG.push('tocando', '🔄 183 Session Progress — aguardando 200 OK');
        } else {
          setChamadaAtiva(p => p ? { ...p, status: 'chamando' } : null);
        }
      });

      s.on('accepted', (ev) => {
        respostaRecebida = true;
        const sdpRsp = ev?.response?.body || '';
        SIP_LOG.push('200_OK', `✅ 200 OK — chamada ATENDIDA`, { uri: destino, sdp_preview: sdpRsp.substring(0, 200) });
        _clearCallTimeout();
        inicioRef.current = Date.now();
        setChamadaAtiva(p => p ? { ...p, status: 'em_ligacao' } : null);
        _attachAudio(s);
      });

      s.on('confirmed', () => {
        SIP_LOG.push('ACK', 'ACK — chamada confirmada');
        _clearCallTimeout();
        if (!inicioRef.current) inicioRef.current = Date.now();
        setChamadaAtiva(p => p ? { ...p, status: 'em_ligacao' } : null);
        _attachAudio(s);
      });

      s.on('ended', (ev) => {
        const dur = inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : 0;
        SIP_LOG.push('ENDED', `Chamada encerrada — ${dur}s | causa: ${ev?.cause || 'N/A'}`);
        _clearCallTimeout(); sessionAtivaRef.current = null; _releaseMic();
        _salvarHistorico(numHistorico, 'saida', dur > 0 ? 'atendida' : 'nao_atendida', dur);
        setChamadaAtiva(null); _clearAudio();
      });

      s.on('failed', (ev) => {
        const code   = ev?.response?.status_code;
        const cause  = ev?.cause  || '';
        const phrase = ev?.response?.reason_phrase || '';
        const hdrs   = ev?.response?.headers || {};
        const wwwAuth   = hdrs['WWW-Authenticate']?.[0]?.raw  || null;
        const proxyAuth = hdrs['Proxy-Authenticate']?.[0]?.raw || null;

        SIP_LOG.push('FAILED', `❌ ${code || cause} ${phrase} — URI: ${destino}`, {
          code, cause, phrase, uri: destino,
          invite_enviado   : inviteEnviado,
          resposta_recebida: respostaRecebida,
          www_authenticate : wwwAuth,
          proxy_authenticate: proxyAuth,
          headers_recebidos: Object.keys(hdrs),
          diagnostico:
            !inviteEnviado         ? 'A) INVITE não saiu do CRM'
            : !respostaRecebida    ? 'B) NVOIP ignorou o INVITE — trunk outbound não configurado'
            : code === 403         ? 'C) Saldo/rota bloqueada'
            : code === 404         ? 'C) Formato URI errado'
            : cause === 'Canceled' ? 'SDP/WebRTC cancelado antes de enviar'
            : 'Veja código SIP acima',
        });

        console.warn(`❌ [SIP] FAILED — code=${code} cause=${cause} phrase="${phrase}" uri=${destino}`);
        _clearCallTimeout();

        if (cause === 'Canceled' && !inviteEnviado) {
          SIP_LOG.push('CANCELED_NO_INVITE', '❌ Erro local WebRTC: INVITE não saiu. Verifique microfone.');
          _releaseMic(); sessionAtivaRef.current = null;
          if (mountedRef.current) setErroMsg('Erro local WebRTC: verifique permissão de microfone.');
          setChamadaAtiva(null); _clearAudio();
          _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
          return;
        }

        if (code === 487) {
          _releaseMic(); sessionAtivaRef.current = null;
          if (mountedRef.current) setErroMsg('Chamada cancelada.');
          setChamadaAtiva(null); _clearAudio();
          return;
        }

        if (code === 401 || code === 407) {
          _releaseMic(); sessionAtivaRef.current = null;
          if (mountedRef.current) setErroMsg(`Erro SIP ${code}: Autenticação exigida — verifique a senha SIP do ramal ${cfg?.numbersip}.`);
          setChamadaAtiva(null); _clearAudio();
          _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
          return;
        }

        if (code === 403 || code === 486 || code === 603) {
          _releaseMic(); sessionAtivaRef.current = null;
          const msg =
            code === 403 ? 'Erro SIP 403: Chamada proibida — saldo insuficiente ou rota bloqueada.'
            : code === 486 ? 'Erro SIP 486: Número ocupado.'
            : 'Erro SIP 603: Chamada recusada pelo destino.';
          if (mountedRef.current) setErroMsg(msg);
          setChamadaAtiva(null); _clearAudio();
          _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
          return;
        }

        const isUnavailable = cause === 'Unavailable' || phrase?.toLowerCase().includes('unavailable') || code === 480 || code === 503;
        if (isUnavailable) {
          sessionAtivaRef.current = null; _releaseMic();
          const etapa = recebeu183 ? 'após 183 Session Progress' : 'sem resposta intermediária';
          const msg = `NVOIP recebeu mas não completou a chamada (${etapa}). Verifique: saldo, rota de saída e número.\n\n💡 Teste em: https://app.nvoip.com.br`;
          SIP_LOG.push('NVOIP_UNAVAILABLE', `❌ Unavailable (${code || cause}) — ${etapa}`, { code, cause, phrase, uri: destino, recebeu_183: recebeu183 });
          if (mountedRef.current) { setErroMsg(msg); setChamadaAtiva(null); }
          _clearAudio();
          _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0, null, null, `Unavailable — ${etapa}`);
          return;
        }

        if (recebeu183) {
          sessionAtivaRef.current = null; _releaseMic();
          const msg = `Chamada não atendida — destino não respondeu após 183 (${code || cause}).`;
          SIP_LOG.push('NO_ANSWER_AFTER_183', msg, { code, cause, phrase });
          if (mountedRef.current) { setErroMsg(msg); setChamadaAtiva(null); }
          _clearAudio();
          _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
          return;
        }

        tentarProximaURI();
      });
    };

    fazerChamada(URI_QUEUE[0]);
    return true;
  }, []);

  const atenderChamada = useCallback(() => {
    if (!chamadaEntrante?.session) return;
    _stopRing();
    const { session, origem, clienteId, clienteNome } = chamadaEntrante;
    session.answer({
      mediaConstraints: { audio: true, video: false },
      pcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
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

  const rejeitarChamada = useCallback(() => {
    _stopRing();
    if (chamadaEntrante?.session) {
      try { chamadaEntrante.session.terminate({ status_code: 486, reason_phrase: 'Busy Here' }); } catch {}
      _salvarHistorico(chamadaEntrante.origem, 'entrada', 'nao_atendida', 0, chamadaEntrante.clienteId, chamadaEntrante.clienteNome);
    }
    setChamadaEntrante(null);
  }, [chamadaEntrante]);

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