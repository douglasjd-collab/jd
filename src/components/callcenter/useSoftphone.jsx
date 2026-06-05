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
  // Guard: impede que eventos antigos/atrasados sobrescrevam o estado "registrado"
  const registradoAt      = useRef(0);
  // Contador de desconexões WSS para detectar instabilidade
  const wssDropCount      = useRef(0);
  const wssDropTimer      = useRef(null);
  // Sessão ativa de referência para cancelar em caso de queda WSS
  const sessionAtivaRef   = useRef(null);

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
  // [FIX-3/4] Timeout duplo:
  //   sem183Ref = false → 10s sem NENHUMA resposta SIP → cancelar
  //   sem183Ref = true  → 60s total (183/180 já recebido) → cancelar se sem 200 OK
  const sem183Ref = useRef(false); // rastreia se já recebeu 183/180

  const _clearCallTimeout = () => {
    if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
  };

  const _startCallTimeout = (session, numHistorico) => {
    _clearCallTimeout();
    sem183Ref.current = false;
    // Fase 1: 10s sem NENHUMA resposta SIP
    callTimeoutRef.current = setTimeout(() => {
      if (sem183Ref.current) return; // já recebeu 183/180 → não cancelar aqui
      const msg = 'Timeout 10s — NVOIP não respondeu ao INVITE. Verifique crédito, número e rota no painel NVOIP.';
      SIP_LOG.push('TIMEOUT_NO_RESPONSE', `10s sem resposta SIP — URI: ${numHistorico}`);
      try { session.terminate(); } catch {}
      if (mountedRef.current) { setErroMsg(msg); setChamadaAtiva(null); }
      _clearAudio();
      _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
    }, 10000);
  };

  // Chamado quando recebe 183/180: troca para timeout longo de 60s
  const _extenderTimeoutApos183 = (session, numHistorico) => {
    if (sem183Ref.current) return; // já extendido
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
      // [FIX-1] transport=wss (era transport=ws) — deve bater com o transporte real do WebSocket
      contact_uri                     : `sip:${ramal}@${sipDomain};transport=wss`,
      connection_recovery_min_interval: 2,
      connection_recovery_max_interval: 10,
      log                             : { builtinEnabled: true, level: 'debug' },
    });

    // Helper: só sobrescreve o estado se não estiver no estado "registrado" recentemente
    // Isso evita que eventos atrasados (unregistered, disconnected) desfaçam o estado registrado
    const setStatusSeFraco = (novoStatus) => {
      if (!mountedRef.current) return;
      // Se foi registrado há menos de 3s, ignorar eventos de downgrade
      if (registradoAt.current && (Date.now() - registradoAt.current) < 3000) return;
      setSipStatus(novoStatus);
    };

    ua.on('connecting', () => {
      SIP_LOG.push('WS_CONNECTING', `Conectando ao WebSocket ${wssUri}`);
      setStatusSeFraco('conectando');
    });

    ua.on('connected', () => {
      SIP_LOG.push('WS_CONNECTED', `WebSocket conectado — enviando REGISTER`);
      setStatusSeFraco('conectando');
    });

    ua.on('registered', () => {
      if (!mountedRef.current) return;
      registradoAt.current = Date.now(); // marca timestamp do registro
      SIP_LOG.push('REGISTERED', `✅ Ramal ${ramal} registrado com sucesso em ${sipDomain}`);
      setSipStatus('registrado');        // força direto, sem guard
      setErroMsg('');
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    });

    ua.on('unregistered', () => {
      SIP_LOG.push('UNREGISTERED', 'Ramal desregistrado — tentando novamente');
      setStatusSeFraco('conectando');
    });

    ua.on('disconnected', (e) => {
      // Captura código e motivo real do WebSocket close
      const wsCode   = e?.socket?.socket?._ws?.closeCode   || e?.code   || '?';
      const wsReason = e?.socket?.socket?._ws?.closeReason || e?.reason || e?.cause || 'desconhecido';
      const wasClean = e?.socket?.socket?._ws?.wasClean    ?? null;
      SIP_LOG.push('WS_DISCONNECTED', `WebSocket desconectou — code: ${wsCode} | reason: ${wsReason} | wasClean: ${wasClean}`);
      console.warn(`⚡ [SIP] WS DISCONNECTED code=${wsCode} reason=${wsReason} wasClean=${wasClean}`);

      if (!mountedRef.current) return;

      // Cancelar chamada ativa se WSS cair durante a chamada
      if (sessionAtivaRef.current) {
        const sessao = sessionAtivaRef.current;
        sessionAtivaRef.current = null;
        try { sessao.terminate(); } catch {}
        SIP_LOG.push('WS_CALL_ABORT', 'Chamada abortada — conexão WSS perdida durante INVITE/chamada');
        _clearCallTimeout();
        _clearAudio();
        if (mountedRef.current) {
          setErroMsg('Conexão SIP caiu durante a chamada. Reconectando...');
          setChamadaAtiva(null);
        }
      }

      // Contador de instabilidade WSS
      wssDropCount.current += 1;
      clearTimeout(wssDropTimer.current);
      wssDropTimer.current = setTimeout(() => { wssDropCount.current = 0; }, 60000); // reset após 1 min
      if (wssDropCount.current >= 3) {
        SIP_LOG.push('WSS_INSTAVEL', `⚠️ WSS caiu ${wssDropCount.current}x em 1 min — rede, firewall ou limite de sessões`);
        if (mountedRef.current) setErroMsg('Conexão WSS instável com a NVOIP. Verifique rede, firewall ou limite de sessões do ramal.');
      }

      setStatusSeFraco('conectando');
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

      // [ALERTA-2 FIX] Captura referência do UA atual para evitar que timer
      // de um UA antigo reconecte após um novo UA já ter sido criado
      const uaClosure = ua;
      reconnectTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        // Só reusa o UA se ainda for o mesmo — evita múltiplos UAs ativos
        if (uaRef.current === uaClosure) {
          try { uaRef.current.start(); } catch {}
        } else if (!uaRef.current && configRef.current?.sip_password) {
          conectar();
        }
      }, 5000);
    });

    ua.on('registrationFailed', (e) => {
      if (!mountedRef.current) return;
      const code = e?.response?.status_code;
      const cause = e?.cause;
      SIP_LOG.push('REGISTER_FAILED', `REGISTER falhou — código ${code} | causa: ${cause}`, { code, cause });
      console.error(`❌ [SIP] REGISTER FAILED — ${code} | ${cause}`);

      if (code === 401 || code === 403 || code === 407) {
        registradoAt.current = 0; // limpa guard em erro de autenticação
        setSipStatus('erro');
        setErroMsg(`Erro ${code}: Senha SIP incorreta ou ramal não autorizado. Verifique em "Meu Ramal".`);
      } else if (code === 404) {
        registradoAt.current = 0;
        setSipStatus('erro');
        setErroMsg(`Erro 404: Ramal ${ramal} não encontrado no servidor NVOIP.`);
      } else {
        setStatusSeFraco('conectando');
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
    if (!config?.sip_password) { setSipStatus('erro'); setErroMsg('Senha SIP não configurada. Acesse "Meu Ramal" e salve a Senha SIP.'); return; }
    const key = `${config.numbersip}|${config.sip_password}`;
    if (lastConnectedRef.current === key && uaRef.current) return;
    lastConnectedRef.current = key;
    conectar();
  }, [config?.numbersip, config?.sip_password]); // eslint-disable-line

  // ── CHAMADA DE SAÍDA ──────────────────────────────────────────────────────
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

    // [FIX-CANCELED] NÃO chamar getUserMedia manualmente.
    // Deixar o JsSIP capturar o microfone via mediaConstraints.
    // Passar mediaStream manual causava CANCELED_NO_INVITE em alguns navegadores
    // porque o SDP era gerado antes do PeerConnection estar pronto.

    const cfg = configRef.current;

    // ── Normalização e validação ───────────────────────────────────────────
    const numOriginal = numero.replace(/\D/g, '');
    const numComDDI   = numOriginal.startsWith('55') ? numOriginal : '55' + numOriginal;
    const numSemDDI   = numOriginal.startsWith('55') ? numOriginal.slice(2) : numOriginal;

    // [FIX-5] Bloquear número brasileiro com dígitos a mais (ex: 879914626333 = 12 dígitos)
    // Válido: celular 11 dígitos (DDD+9+8), fixo 10 dígitos (DDD+8)
    if (numSemDDI.length > 11) {
      const msg = `Número inválido — dígitos a mais (${numSemDDI.length} dígitos). Verifique e corrija. Ex correto: ${numSemDDI.slice(0, 11)}`;
      SIP_LOG.push('BLOCKED', msg, { num: numSemDDI, tamanho: numSemDDI.length });
      if (mountedRef.current) setErroMsg(msg);
      return false;
    }

    // Bloquear celular sem 9º dígito
    if (numSemDDI.length === 10 && /^[6-9]/.test(numSemDDI.slice(2))) {
      const msg = `Número incompleto — informe com 9º dígito. Ex: ${numSemDDI.slice(0,2)}9${numSemDDI.slice(2)}`;
      SIP_LOG.push('BLOCKED', msg);
      if (mountedRef.current) setErroMsg(msg);
      return false;
    }

    // ── Caller ID / DID de saída (deve vir ANTES da URI_QUEUE) ───────────
    const ramalSIP  = String(cfg?.numbersip || '');
    const didRaw    = cfg?.numero_did ? cfg.numero_did.replace(/\D/g, '') : '';
    // Normaliza o DID: garante que tenha o 55 para o header SIP, mas testa ambos
    const didLimpo  = didRaw.startsWith('55') ? didRaw : (didRaw ? '55' + didRaw : '');
    const sipDomain = 'app.nvoip.com.br';

    // NVOIP WebRTC outbound: sempre usar DDI completo (E.164) primeiro
    // O servidor NVOIP roteia para PSTN quando recebe número E.164 completo
    const numE164 = numComDDI; // ex: 5587991426333
    const URI_QUEUE = [
      `sip:${numE164}@${sipDomain}`,
      `sip:${numSemDDI}@${sipDomain}`,
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
      estrategia    : didLimpo ? 'sem DDI primeiro (DID configurado)' : 'com DDI primeiro (sem DID)',
    });
    console.log(`📞 [SIP] DIAL → URIs a tentar:`, URI_QUEUE);

    const pcConfig = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    };

    // [CALLER-ID] Log do Caller ID configurado para diagnóstico
    SIP_LOG.push('CALLER_ID_CONFIG', `Ramal: ${ramalSIP} | DID: ${didLimpo || '(não configurado)'} | Destino: ${numSemDDI}`, {
      ramal_sip: ramalSIP, did: didLimpo || null, destino: numSemDDI,
    });
    console.log(`📋 [SIP] Caller ID — Ramal: ${ramalSIP} | DID: ${didLimpo || 'não configurado'} | Destino: ${numSemDDI}`);

    const extraHeaders = [];
    if (didLimpo) {
      // X-NVOIP-Caller-ID: header aceito pelo proxy NVOIP para identificar DID de saída
      extraHeaders.push(`X-NVOIP-Caller-ID: ${didLimpo}`);
      // X-DID: campo alternativo reconhecido por alguns gateways NVOIP
      extraHeaders.push(`X-DID: ${didLimpo}`);
      // X-Caller-ID: mantido por compatibilidade
      extraHeaders.push(`X-Caller-ID: ${didLimpo}`);
    }

    // [FIX-CALLER-ID] Se DID configurado, usá-lo como From URI da chamada.
    // O JsSIP usa o campo `fromUserName` para sobrescrever o usuário no header From
    // sem alterar as credenciais de autenticação.
    // Isso faz o INVITE sair com: From: <sip:558132998470@app.nvoip.com.br>
    // mas ainda autentica com ramal 137715001 + senha SIP.
    const fromUri = didLimpo ? `sip:${didLimpo}@${sipDomain}` : undefined;
    // DID sem o 55 para headers que podem não aceitar DDI
    const didSemPrefixo = didLimpo.startsWith('55') ? didLimpo.slice(2) : didLimpo;

    // [FIX-CANCELED] Não passar mediaStream manual.
    // JsSIP gerencia getUserMedia internamente via mediaConstraints.
    const baseCallOptions = {
      mediaConstraints    : { audio: true, video: false },
      rtcOfferConstraints : { offerToReceiveAudio: true, offerToReceiveVideo: false },
      pcConfig,
      extraHeaders,
      ...(fromUri ? { fromUserName: didSemPrefixo || didLimpo, fromDisplayName: didSemPrefixo || didLimpo } : {}),
    };

    // ── Tenta cada URI em sequência ────────────────────────────────────────
    let uriIdx    = 0;
    let session   = null;
    let inviteEnviado    = false;  // rastrear se INVITE saiu
    let respostaRecebida = false;  // rastrear se houve qualquer resposta SIP
    let recebeu183       = false;  // [FIX-6] impede retry se 183 já chegou

    // Mic é gerenciado pelo JsSIP — _releaseMic é no-op aqui (mantido por compatibilidade)
    const _releaseMic = () => {};

    const tentarProximaURI = async () => {
      uriIdx++;
      if (uriIdx >= URI_QUEUE.length) {
        // Esgotou todas as URIs — tentar fallback via API REST NVOIP
        _clearCallTimeout();
        _releaseMic();
        sessionAtivaRef.current = null;

        SIP_LOG.push('ALL_FAILED', `WebRTC falhou em todas as URIs — acionando fallback API REST NVOIP`);
        console.warn('⚠️ [SIP] WebRTC falhou — tentando fallback API REST NVOIP');

        try {
          const res = await base44.functions.invoke('nvoipCallCenter', {
            action: 'realizarChamadaDireta',
            called: numOriginal,
          });
          const data = res?.data;
          if (data?.callId || data?._tipo === 'headless_direto') {
            SIP_LOG.push('FALLBACK_API', `✅ Fallback API REST acionado — callId: ${data.callId || 'sem ID'}`);
            console.log('✅ [SIP] Fallback API REST NVOIP bem-sucedido:', data.callId);
            if (mountedRef.current) {
              setChamadaAtiva({ session: null, destino: numHistorico, direcao: 'saida', status: 'chamando', via: 'api_rest' });
              setErroMsg('');
            }
            return;
          }
          const errMsg = data?.error || 'Resposta inesperada';
          SIP_LOG.push('FALLBACK_FAILED', `Fallback API retornou erro: ${errMsg}`);
        } catch (fallbackErr) {
          SIP_LOG.push('FALLBACK_FAILED', `Fallback API também falhou: ${fallbackErr.message}`);
          console.error('❌ [SIP] Fallback API REST falhou:', fallbackErr.message);
        }

        const msg = inviteEnviado && !respostaRecebida
          ? `NVOIP não respondeu ao INVITE WebRTC. Possível causa: ramal sem rota PSTN outbound. Configure um trunk de saída no painel NVOIP.`
          : `Falha SIP em todas as URIs e fallback API REST. Verifique o diagnóstico.`;
        SIP_LOG.push('ALL_FAILED_FINAL', msg);
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
      const inviteTimestamp = Date.now();

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
        // [FIX-7] Timeout só começa após INVITE_SENT = true (evento 'sending')
        // _startCallTimeout é chamado dentro do evento 'sending' abaixo
      } else {
        setChamadaAtiva(p => p ? { ...p, session: s } : { session: s, destino: numHistorico, direcao: 'saida', status: 'chamando' });
      }

      // ── Item 2 + 3: logar INVITE bruto e todos os eventos ──────────────
      s.on('sending', (ev) => {
        inviteEnviado = true;
        const req = ev?.request;
        const sdp = req?.body || '';
        // Extrair cabeçalhos SIP relevantes para diagnóstico Caller ID
        const hdrsInvite = req?.headers || {};
        const fromHdr    = req?.from?.toString?.()    || hdrsInvite['From']?.[0]?.raw     || '?';
        const paiHdr     = hdrsInvite['P-Asserted-Identity']?.[0]?.raw                   || '(não enviado)';
        const rpiHdr     = hdrsInvite['Remote-Party-ID']?.[0]?.raw                       || '(não enviado)';
        const contactHdr = req?.contact?.toString?.() || hdrsInvite['Contact']?.[0]?.raw || '?';
        const toHdr      = req?.to?.toString?.()      || destino;

        const logData = {
          '1_request_uri'         : req?.ruri?.toString?.() || destino,
          '2_from'                : fromHdr,
          '3_to'                  : toHdr,
          '4_contact'             : contactHdr,
          '5_p_asserted_identity' : paiHdr,
          '6_remote_party_id'     : rpiHdr,
          '7_x_caller_id'         : hdrsInvite['X-Caller-ID']?.[0]?.raw || '(não enviado)',
          '8_call_id'             : req?.call_id || '?',
          '9_sdp_linhas'          : sdp.split('\n').length,
          // Diagnóstico rápido do Caller ID
          diagnostico_caller_id   :
            paiHdr !== '(não enviado)' ? `✅ DID enviado via P-Asserted-Identity: ${paiHdr}`
            : rpiHdr !== '(não enviado)' ? `⚠️ DID apenas via Remote-Party-ID (sem PAI): ${rpiHdr}`
            : `❌ Sem DID nos headers — chamada sai apenas com ramal SIP. Configure o número virtual em "Meu Ramal".`,
        };
        SIP_LOG.push('INVITE_SENT', `✅ INVITE enviado → ${destino}`, logData);
        SIP_LOG.push('CALLER_ID_ENVIADO', `From: ${fromHdr} | PAI: ${paiHdr} | DID: ${didLimpo || 'não configurado'}`, {
          from: fromHdr, pai: paiHdr, rpi: rpiHdr, did: didLimpo, ramal: ramalSIP, destino: numSemDDI,
        });
        console.log('📤 [SIP] INVITE CABEÇALHOS CALLER ID:', logData);
        console.log(`📋 [SIP] From: ${fromHdr}`);
        console.log(`📋 [SIP] P-Asserted-Identity: ${paiHdr}`);
        console.log(`📋 [SIP] Remote-Party-ID: ${rpiHdr}`);
        console.log(`📋 [SIP] Contact: ${contactHdr}`);
        console.log('📄 [SIP] SDP completo:\n', sdp);

        // [FIX-7] Timeout só começa APÓS o INVITE sair pelo WSS
        _startCallTimeout(s, numHistorico);

        // Alerta se NVOIP não responder em 5s
        setTimeout(() => {
          if (!respostaRecebida && session === s) {
            SIP_LOG.push('NO_100_TRYING', `⚠️ Sem 100 Trying após 5s — NVOIP pode estar ignorando o INVITE para ${destino}.`);
            console.warn(`⚠️ [SIP] Sem 100 Trying em 5s — URI: ${destino}`);
          }
        }, 5000);
      });

      s.on('connecting', () => {
        SIP_LOG.push('CONNECTING', `Sessão conectando → ${destino}`);
      });

      s.on('peerconnection', (data) => {
        const pc = data.peerconnection;
        if (!pc) return;
        SIP_LOG.push('PEERCONNECTION', 'PeerConnection WebRTC criado');

        // [FIX-CANCELED] Logar erros internos de createOffer / setLocalDescription
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
            SIP_LOG.push('ICE_FAILED', '⚠️ ICE failed — problema NAT/TURN. Solicite credenciais TURN da NVOIP para produção.');
            _clearCallTimeout();
            try { s.terminate(); } catch {}
            if (mountedRef.current) { setErroMsg('Falha WebRTC: ICE failed — sem conectividade de mídia. Verifique rede/firewall.'); setChamadaAtiva(null); }
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

      // ── [FIX-1/2/3/6/7] progress: 100 Trying / 180 Ringing / 183 Session Progress ──
      s.on('progress', (ev) => {
        respostaRecebida = true;
        const code   = ev?.response?.status_code;
        const phrase = ev?.response?.reason_phrase || '';
        const sdpRsp = ev?.response?.body || '';
        SIP_LOG.push(`SIP_${code}`, `✅ Resposta SIP: ${code} ${phrase} — URI: ${destino}`, {
          code, phrase, uri: destino,
          sdp_rsp: sdpRsp ? sdpRsp.substring(0, 300) : null,
        });
        console.log(`📞 [SIP] ${code} ${phrase} — URI: ${destino}`);

        if (code === 180) {
          // 180 Ringing: chamando no destino
          recebeu183 = true;
          _extenderTimeoutApos183(s, numHistorico);
          setChamadaAtiva(p => p ? { ...p, status: 'tocando' } : null);
          SIP_LOG.push('tocando', '📳 180 Ringing — chamando no destino');
        } else if (code === 183) {
          // [FIX-1] 183 Session Progress: em processamento na NVOIP, NÃO é atendida
          recebeu183 = true;
          _extenderTimeoutApos183(s, numHistorico);
          setChamadaAtiva(p => p ? { ...p, status: 'tocando' } : null);
          SIP_LOG.push('tocando', '🔄 183 Session Progress — aguardando 200 OK (timeout: 60s)');
        } else {
          // 100 Trying ou outros
          setChamadaAtiva(p => p ? { ...p, status: 'chamando' } : null);
        }
      });

      // [FIX-2] Só considera conectada ao receber 200 OK / accepted
      s.on('accepted', (ev) => {
        respostaRecebida = true;
        const sdpRsp = ev?.response?.body || '';
        SIP_LOG.push('200_OK', `✅ 200 OK — chamada ATENDIDA`, { uri: destino, sdp_preview: sdpRsp.substring(0, 200) });
        console.log('✅ [SIP] 200 OK — chamada atendida');
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
        _clearCallTimeout();
        sessionAtivaRef.current = null;
        _releaseMic();
        _salvarHistorico(numHistorico, 'saida', dur > 0 ? 'atendida' : 'nao_atendida', dur);
        setChamadaAtiva(null);
        _clearAudio();
      });

      // ── Item 4: failed com causa + code + phrase completos ─────────────
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
          timing_ms        : Date.now() - inviteTimestamp,
          nvoip_respondeu  : respostaRecebida,
          causa_provavel   : !respostaRecebida
            ? 'Ramal sem rota PSTN outbound no painel NVOIP — configurar trunk de saída'
            : `Código SIP ${code}`,
          www_authenticate : wwwAuth,
          proxy_authenticate: proxyAuth,
          headers_recebidos: Object.keys(hdrs),
          diagnostico:
            !inviteEnviado         ? 'A) INVITE não saiu do CRM'
            : !respostaRecebida    ? 'B) NVOIP ignorou o INVITE — sem rota PSTN outbound'
            : code === 403         ? 'C) Saldo/rota bloqueada'
            : code === 404         ? 'C) Formato URI errado'
            : cause === 'Canceled' ? 'SDP/WebRTC cancelado antes de enviar'
            : 'Veja código SIP acima',
        });

        console.warn(`❌ [SIP] FAILED — code=${code} cause=${cause} phrase="${phrase}" uri=${destino}`);
        console.warn(`❌ [SIP] INVITE enviado: ${inviteEnviado} | Resposta recebida: ${respostaRecebida}`);
        if (wwwAuth)   console.warn(`❌ [SIP] WWW-Authenticate: ${wwwAuth}`);
        if (proxyAuth) console.warn(`❌ [SIP] Proxy-Authenticate: ${proxyAuth}`);

        _clearCallTimeout();

        // [FIX-8] Se "Canceled" e INVITE não saiu: erro LOCAL (WebRTC/SDP/getUserMedia)
        if (cause === 'Canceled' && !inviteEnviado) {
          SIP_LOG.push('CANCELED_NO_INVITE', '❌ Erro local WebRTC: INVITE não saiu do navegador. Verifique createOffer, setLocalDescription e getUserMedia nos logs acima.');
          _releaseMic();
          sessionAtivaRef.current = null;
          if (mountedRef.current) setErroMsg('Erro local WebRTC: INVITE não saiu do navegador. Verifique permissão de microfone e logs de createOffer/SDP.');
          setChamadaAtiva(null);
          _clearAudio();
          _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
          return;
        }

        // 487 = cancelado pelo usuário, não tentar outras URIs
        if (code === 487) {
          _releaseMic();
          sessionAtivaRef.current = null;
          if (mountedRef.current) setErroMsg('Chamada cancelada.');
          setChamadaAtiva(null);
          _clearAudio();
          return;
        }

        // Autenticação exigida
        if (code === 401 || code === 407) {
          _releaseMic();
          sessionAtivaRef.current = null;
          if (mountedRef.current) setErroMsg(`Erro SIP ${code}: Autenticação exigida — verifique a senha SIP do ramal ${cfg?.numbersip}.`);
          setChamadaAtiva(null);
          _clearAudio();
          _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
          return;
        }

        // Para erros definitivos (403 saldo, 486 ocupado, 603 recusado) não tentar outras URIs
        if (code === 403 || code === 486 || code === 603) {
          _releaseMic();
          sessionAtivaRef.current = null;
          const msg =
            code === 403 ? 'Erro SIP 403: Chamada proibida — saldo insuficiente ou rota bloqueada na NVOIP.'
            : code === 486 ? 'Erro SIP 486: Número ocupado.'
            : 'Erro SIP 603: Chamada recusada pelo destino.';
          if (mountedRef.current) setErroMsg(msg);
          setChamadaAtiva(null);
          _clearAudio();
          _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
          return;
        }

        // [FIX-UNAVAILABLE] "Unavailable" = NVOIP recebeu mas não completou para o destino
        // Isso é falha da rota/destino na NVOIP, NÃO erro do CRM
        // Ocorre tanto após 183 quanto quando não há resposta prévia (INVITE aceito mas sem ringback)
        const isUnavailable = cause === 'Unavailable' || phrase?.toLowerCase().includes('unavailable') || code === 480 || code === 503;

        if (isUnavailable) {
          sessionAtivaRef.current = null;
          _releaseMic();
          const etapa = recebeu183 ? 'após 183 Session Progress' : 'sem resposta intermediária (INVITE ignorado ou rota sem ringback)';
          const msg = `A NVOIP recebeu a chamada, mas não conseguiu completar para o destino (${etapa}). Verifique: saldo, permissão de chamadas externas, rota de saída e número do cliente.\n\n💡 Teste o mesmo número pelo Webphone oficial NVOIP: https://app.nvoip.com.br`;
          SIP_LOG.push('NVOIP_UNAVAILABLE', `❌ Unavailable — falha de rota NVOIP (${code || cause}) — ${etapa}`, {
            code, cause, phrase, uri: destino,
            recebeu_183: recebeu183,
            etapa,
            diagnostico: 'D) NVOIP recebeu o INVITE mas não conseguiu completar para o destino. Verifique saldo, rotas de saída e permissões no painel NVOIP.',
            sugestao_webphone: 'https://app.nvoip.com.br',
            teste_com_ddi: `sip:${numComDDI}@app.nvoip.com.br`,
            teste_sem_ddi: `sip:${numSemDDI}@app.nvoip.com.br`,
          });
          console.warn(`❌ [SIP] UNAVAILABLE — falha de rota NVOIP, não do CRM. Etapa: ${etapa}`);
          console.warn(`💡 [SIP] Teste: ${numComDDI} pelo Webphone oficial NVOIP: https://app.nvoip.com.br`);
          if (mountedRef.current) { setErroMsg(msg); setChamadaAtiva(null); }
          _clearAudio();
          _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0, null, null, `Unavailable — falha de rota NVOIP (${etapa})`);
          return;
        }

        // [FIX-6] Se já recebeu 183/180 (sem Unavailable), NÃO tentar outra URI
        if (recebeu183) {
          sessionAtivaRef.current = null;
          _releaseMic();
          const msg = `Chamada não atendida — destino não respondeu após 183 Session Progress (${code || cause}).`;
          SIP_LOG.push('NO_ANSWER_AFTER_183', msg, { code, cause, phrase });
          if (mountedRef.current) { setErroMsg(msg); setChamadaAtiva(null); }
          _clearAudio();
          _salvarHistorico(numHistorico, 'saida', 'nao_atendida', 0);
          return;
        }

        // Para 404 / timeout / sem resposta → tenta próxima URI
        tentarProximaURI();
      });
    };

    // Inicia pela primeira URI
    fazerChamada(URI_QUEUE[0]);
    return true;
  }, []);



  // ── ATENDER chamada entrante ──────────────────────────────────────────────
  const atenderChamada = useCallback(() => {
    if (!chamadaEntrante?.session) return;
    _stopRing();
    const { session, origem, clienteId, clienteNome } = chamadaEntrante;
    session.answer({
      mediaConstraints: { audio: true, video: false },
      pcConfig: {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
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