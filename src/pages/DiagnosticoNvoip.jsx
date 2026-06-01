import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import JsSIP from 'jssip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  CheckCircle2, XCircle, Loader2, AlertTriangle,
  Wifi, Phone, Mic, Radio, Key, RefreshCw, ChevronDown, ChevronUp,
  Terminal, PhoneCall
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS = { idle: 'idle', running: 'running', ok: 'ok', warn: 'warn', fail: 'fail' };

function StatusIcon({ status }) {
  const cls = 'w-5 h-5 shrink-0';
  if (status === STATUS.running) return <Loader2 className={cn(cls, 'animate-spin text-blue-500')} />;
  if (status === STATUS.ok)      return <CheckCircle2 className={cn(cls, 'text-green-600')} />;
  if (status === STATUS.warn)    return <AlertTriangle className={cn(cls, 'text-amber-500')} />;
  if (status === STATUS.fail)    return <XCircle className={cn(cls, 'text-red-500')} />;
  return <div className="w-4 h-4 rounded-full bg-slate-200 shrink-0" />;
}

function Row({ label, status, detail, extra }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn(
      'border rounded-lg px-4 py-3 transition-colors',
      status === STATUS.ok      && 'bg-green-50  border-green-200',
      status === STATUS.warn    && 'bg-amber-50  border-amber-200',
      status === STATUS.fail    && 'bg-red-50    border-red-200',
      status === STATUS.running && 'bg-blue-50   border-blue-200',
      status === STATUS.idle    && 'bg-slate-50  border-slate-200',
    )}>
      <div className="flex items-center gap-3">
        <StatusIcon status={status} />
        <span className="font-medium text-sm flex-1">{label}</span>
        {detail && <span className="text-xs text-slate-500 max-w-[280px] truncate text-right">{detail}</span>}
        {extra && (
          <button onClick={() => setOpen(o => !o)} className="text-slate-400 hover:text-slate-600 ml-1">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>
      {open && extra && (
        <pre className="mt-2 text-xs bg-white rounded p-2 border overflow-auto max-h-64 text-slate-700 whitespace-pre-wrap break-all">
          {typeof extra === 'string' ? extra : JSON.stringify(extra, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function DiagnosticoNvoip() {
  const [checks, setChecks] = useState({});
  const [running, setRunning] = useState(false);
  const [numTeste, setNumTeste] = useState('');
  const [sipLogs, setSipLogs] = useState([]);
  const [testInviteRunning, setTestInviteRunning] = useState(false);
  const [testInviteResult, setTestInviteResult] = useState(null);
  const uaTestRef = useRef(null);
  const logIntervalRef = useRef(null);

  // Importa SIP_LOG do hook após mount
  useEffect(() => {
    logIntervalRef.current = setInterval(() => {
      try {
        // Tenta importar dinamicamente
        import('@/components/callcenter/useSoftphone').then(m => {
          if (m.SIP_LOG) setSipLogs(m.SIP_LOG.get().slice(0, 30));
        });
      } catch {}
    }, 1000);
    return () => clearInterval(logIntervalRef.current);
  }, []);

  const set = (key, status, detail = '', extra = null) =>
    setChecks(prev => ({ ...prev, [key]: { status, detail, extra } }));
  const g = (key) => checks[key] || { status: STATUS.idle, detail: '', extra: null };

  // ── 1. Config ──────────────────────────────────────────────────────────────
  async function checkConfig() {
    set('config', STATUS.running, 'Buscando configuração...');
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', { action: 'buscarConfigUsuario' });
      const cfg = res.data?.config;
      if (!cfg) { set('config', STATUS.fail, 'Nenhuma configuração encontrada', res.data); return null; }
      const faltam = [];
      if (!cfg.numbersip)    faltam.push('NumberSIP');
      if (!cfg.sip_password) faltam.push('Senha SIP');
      if (!cfg.user_token && !cfg.napikey) faltam.push('User Token ou Napikey');
      const safe = { ...cfg, sip_password: cfg.sip_password ? '●●●●' : null, user_token: cfg.user_token ? '●●●●' : null };
      if (faltam.length > 0) set('config', STATUS.warn, `Faltam: ${faltam.join(', ')}`, safe);
      else set('config', STATUS.ok, `Ramal ${cfg.numbersip} | DID ${cfg.numero_did || '—'}`, safe);
      return cfg;
    } catch (e) { set('config', STATUS.fail, e.message); return null; }
  }

  // ── 2. OAuth ───────────────────────────────────────────────────────────────
  async function checkOAuth(cfg) {
    set('oauth', STATUS.running, 'Autenticando OAuth NVOIP...');
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', {
        action: 'testarConexao', numbersip: cfg.numbersip,
        user_token: cfg.user_token, napikey: cfg.napikey,
      });
      if (res.data?.success) set('oauth', STATUS.ok, res.data.message || 'OAuth OK');
      else set('oauth', STATUS.fail, res.data?.error || 'Falha', res.data);
    } catch (e) { set('oauth', STATUS.fail, e.message); }
  }

  // ── 3. Saldo ───────────────────────────────────────────────────────────────
  async function checkSaldo() {
    set('saldo', STATUS.running, 'Consultando saldo...');
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', { action: 'saldo' });
      const d = res.data;
      if (d?.error) { set('saldo', STATUS.fail, d.error, d); return; }
      const valor = d?.balance ?? d?.saldo ?? d?.amount ?? '?';
      set('saldo', STATUS.ok, `R$ ${valor}`, d);
    } catch (e) { set('saldo', STATUS.fail, e.message); }
  }

  // ── 4. Ramais ──────────────────────────────────────────────────────────────
  async function checkRamais(cfg) {
    set('ramais', STATUS.running, 'Listando ramais SIP...');
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', { action: 'listarUsuarios' });
      const users = res.data?.users || [];
      if (!users.length) { set('ramais', STATUS.warn, 'Sem ramais listados', res.data); return; }
      const ramal = users.find(u => String(u.numbersip) === String(cfg?.numbersip));
      if (ramal) {
        const webphone = ramal.webphone ? '✓ Webphone ativo' : '⚠ Webphone DESATIVADO';
        set('ramais', ramal.webphone ? STATUS.ok : STATUS.warn, `Ramal ${cfg.numbersip} — ${webphone}`, ramal);
      } else {
        set('ramais', STATUS.warn, `Ramal ${cfg?.numbersip} não encontrado (${users.length} ramal(is))`, users.map(u => u.numbersip));
      }
    } catch (e) { set('ramais', STATUS.fail, e.message); }
  }

  // ── 5. WebSocket ───────────────────────────────────────────────────────────
  async function checkWss() {
    set('wss', STATUS.running, 'Testando WSS...');
    return new Promise((resolve) => {
      const timeout = setTimeout(() => { set('wss', STATUS.fail, 'Timeout 6s — WSS não respondeu'); resolve(false); }, 6000);
      try {
        const ws = new WebSocket('wss://app.nvoip.com.br:7443');
        ws.onopen  = () => { clearTimeout(timeout); set('wss', STATUS.ok, 'WebSocket conectado OK'); ws.close(); resolve(true); };
        ws.onerror = () => { clearTimeout(timeout); set('wss', STATUS.fail, 'Falha WSS — verifique firewall/proxy'); resolve(false); };
      } catch (e) { clearTimeout(timeout); set('wss', STATUS.fail, e.message); resolve(false); }
    });
  }

  // ── 6. Registro SIP ────────────────────────────────────────────────────────
  async function checkSipRegister(cfg) {
    if (!cfg?.numbersip || !cfg?.sip_password) {
      set('sip_reg', STATUS.warn, 'Ramal ou Senha SIP não configurados');
      return false;
    }
    set('sip_reg', STATUS.running, `Registrando ramal ${cfg.numbersip}...`);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        set('sip_reg', STATUS.fail, 'Timeout 12s — sem registro SIP');
        try { ua?.stop(); } catch {}
        resolve(false);
      }, 12000);
      let ua;
      try {
        const socket = new JsSIP.WebSocketInterface('wss://app.nvoip.com.br:7443');
        ua = new JsSIP.UA({
          sockets: [socket], uri: `sip:${cfg.numbersip}@app.nvoip.com.br`,
          password: cfg.sip_password, authorization_user: String(cfg.numbersip),
          register: true, register_expires: 60, session_timers: false,
          log: { builtinEnabled: false, level: 'error' },
        });
        ua.on('registered', () => {
          clearTimeout(timeout);
          set('sip_reg', STATUS.ok, `Ramal ${cfg.numbersip} REGISTRADO com sucesso`);
          ua.stop(); resolve(true);
        });
        ua.on('registrationFailed', (e) => {
          clearTimeout(timeout);
          const code = e?.response?.status_code;
          const msg = code === 401 || code === 403 ? `Senha SIP inválida (${code})`
            : code === 404 ? `Ramal não encontrado (${code})`
            : `Falha ${code || e?.cause}`;
          set('sip_reg', STATUS.fail, msg, { code, cause: e?.cause });
          ua.stop(); resolve(false);
        });
        ua.on('disconnected', () => { clearTimeout(timeout); set('sip_reg', STATUS.fail, 'WebSocket desconectou'); resolve(false); });
        ua.start();
        uaTestRef.current = ua;
      } catch (e) { clearTimeout(timeout); set('sip_reg', STATUS.fail, e.message); resolve(false); }
    });
  }

  // ── 7. Microfone ───────────────────────────────────────────────────────────
  async function checkMic() {
    set('mic', STATUS.running, 'Verificando microfone...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      set('mic', STATUS.ok, 'Microfone disponível com permissão');
      return true;
    } catch (e) {
      const msg = e.name === 'NotAllowedError'
        ? 'Permissão NEGADA — clique no cadeado e permita o microfone'
        : `Indisponível: ${e.message}`;
      set('mic', STATUS.fail, msg);
      return false;
    }
  }

  // ── 8. Teste INVITE avançado — testa 4 URIs, captura SIP bruto, SDP, erros ─
  async function testarInviteWebRTC(cfg) {
    const num = numTeste.replace(/\D/g, '');
    if (!num || num.length < 8) {
      set('sip_invite', STATUS.warn, 'Número de teste não informado — teste de INVITE ignorado');
      return;
    }
    if (!cfg?.sip_password) {
      set('sip_invite', STATUS.warn, 'Senha SIP necessária para testar INVITE');
      return;
    }

    set('sip_invite', STATUS.running, `Testando INVITE avançado para ${num}...`);
    setTestInviteRunning(true);
    setTestInviteResult(null);

    // Normalização
    const numSemDDI = num.startsWith('55') ? num.slice(2) : num;
    const numComDDI = num.startsWith('55') ? num : '55' + num;

    // 4 URIs a testar (item 6 do pedido)
    const URIS_TESTE = [
      { label: 'Com DDI + app', uri: `sip:${numComDDI}@app.nvoip.com.br` },
      { label: 'Com DDI + sip', uri: `sip:${numComDDI}@sip.nvoip.com.br` },
      { label: 'Sem DDI + app', uri: `sip:${numSemDDI}@app.nvoip.com.br` },
      { label: 'Sem DDI + sip', uri: `sip:${numSemDDI}@sip.nvoip.com.br` },
    ];

    const logs = [];
    const addLog = (tipo, msg, data = null) => {
      const entry = { ts: new Date().toISOString().split('T')[1].split('.')[0], tipo, msg, data };
      logs.push(entry);
      setTestInviteResult([...logs]);
      console.log(`[TEST-INVITE] ${tipo}: ${msg}`, data || '');
    };

    addLog('START', `Ramal ${cfg.numbersip} | Destino: ${numComDDI} / ${numSemDDI}`);
    addLog('URIS', `4 URIs a testar:`, URIS_TESTE.map(u => u.uri));

    // Obtém microfone
    let micStream = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      addLog('MIC', 'Microfone OK');
    } catch (e) {
      addLog('MIC_FAIL', `Microfone negado: ${e.message}`);
      set('sip_invite', STATUS.fail, 'Microfone negado — permita o acesso ao microfone');
      setTestInviteRunning(false);
      return;
    }

    return new Promise((resolve) => {
      let uriIdx = 0;         // índice da URI atual
      let currentSession = null;
      let resolved = false;
      let ua = null;

      const finish = (status, label) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(globalTimeout);
        micStream?.getTracks().forEach(t => t.stop());
        try { currentSession?.terminate(); } catch {}
        try { ua?.stop(); } catch {}
        set('sip_invite', status, label, { logs });
        setTestInviteRunning(false);
        resolve();
      };

      // Timeout global de 45s para testar todas as URIs
      const globalTimeout = setTimeout(() => {
        addLog('TIMEOUT', `45s — nenhuma das ${URIS_TESTE.length} URIs retornou resposta SIP.`);
        addLog('TIMEOUT_DETALHE', 'INVITE foi enviado mas NVOIP ignorou. Causas prováveis: saldo zerado, rota de saída não configurada, DID sem permissão de originação, ramal sem webphone, IP bloqueado.');
        finish(STATUS.fail, `TIMEOUT 45s — INVITE enviado para ${URIS_TESTE.length} URIs, nenhuma resposta recebida`);
      }, 45000);

      const dispararParaUri = (uriObj) => {
        addLog('TRYING_URI', `▶ Testando URI ${uriIdx + 1}/${URIS_TESTE.length}: ${uriObj.uri} (${uriObj.label})`);

        let session;
        try {
          session = ua.call(uriObj.uri, {
            mediaStream        : micStream,
            mediaConstraints   : { audio: true, video: false },
            rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
            pcConfig: {
              iceServers: [
                { urls: 'stun:app.nvoip.com.br:3478' },
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
                { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
              ],
              iceTransportPolicy: 'all',
            },
            extraHeaders: cfg.numero_did ? [`X-Caller-ID: ${cfg.numero_did.replace(/\D/g, '')}`] : [],
          });
        } catch (e) {
          addLog('ERROR', `Erro ao criar sessão para ${uriObj.uri}: ${e.message}`);
          tryNext();
          return;
        }
        currentSession = session;

        // ── Item 1,2,3,4,5: Captura do INVITE bruto + headers + SDP ──
        session.on('sending', (ev) => {
          const req = ev?.request;
          const sdpCompleto = req?.body || '';
          const requestLine = `${req?.method || 'INVITE'} ${req?.ruri?.toString?.() || uriObj.uri} SIP/2.0`;
          addLog('SIP_BRUTO', `INVITE bruto enviado:`, {
            '1_request_line' : requestLine,
            '2_request_uri'  : req?.ruri?.toString?.() || uriObj.uri,
            '3_from'         : req?.from?.toString?.() || `sip:${cfg.numbersip}@app.nvoip.com.br`,
            '4_to'           : req?.to?.toString?.()   || uriObj.uri,
            '5_contact'      : req?.contact?.toString?.() || `sip:${cfg.numbersip}@app.nvoip.com.br;transport=ws`,
            'call_id'        : req?.call_id || '?',
            'cseq'           : req?.cseq || '?',
            'via'            : req?.getHeader?.('via') || req?.headers?.Via?.[0]?.raw || '?',
            'content_type'   : req?.getHeader?.('content-type') || 'application/sdp',
          });
          // Item 9: SDP completo
          if (sdpCompleto) {
            addLog('SDP_ENVIADO', `SDP Offer completo (${sdpCompleto.split('\n').length} linhas):`, sdpCompleto);
          }
        });

        // Item 7: qualquer resposta do servidor
        session.on('progress', (ev) => {
          const code   = ev?.response?.status_code;
          const phrase = ev?.response?.reason_phrase || '';
          const sdpRsp = ev?.response?.body || '';
          const hdrs   = ev?.response?.headers || {};
          addLog(`SIP_${code}`, `✅ RESPOSTA DO SERVIDOR: ${code} ${phrase} — URI: ${uriObj.uri}`, {
            code, phrase,
            headers : Object.fromEntries(Object.entries(hdrs).map(([k, v]) => [k, v?.[0]?.raw || v])),
            sdp_rsp : sdpRsp || null,
          });
          if (code === 100) addLog('100', '100 Trying — servidor processando INVITE');
          if (code === 180 || code === 183) {
            finish(STATUS.ok, `${code} ${phrase} — URI OK: ${uriObj.uri} ✅ INVITE chegou ao destino!`);
          }
        });

        session.on('accepted', (ev) => {
          addLog('200_OK', `✅ 200 OK — chamada aceita! URI: ${uriObj.uri}`);
          finish(STATUS.ok, `200 OK — chamada aceita! URI: ${uriObj.uri}`);
        });

        session.on('failed', (ev) => {
          const code   = ev?.response?.status_code;
          const cause  = ev?.cause  || '';
          const phrase = ev?.response?.reason_phrase || '';
          const hdrs   = ev?.response?.headers || {};
          const wwwAuth   = hdrs['WWW-Authenticate']?.[0]?.raw || null;
          const proxyAuth = hdrs['Proxy-Authenticate']?.[0]?.raw || null;
          const sdpFail   = ev?.response?.body || '';

          // Item 8: todos os tipos de erro especificados
          if (cause === 'Request Timeout' || code === 408) {
            addLog('REQUEST_TIMEOUT', `⏱ Request Timeout — servidor não respondeu a este INVITE`, { uri: uriObj.uri, code, cause });
          } else if (cause === 'Connection Error' || cause === 'Transport Error') {
            addLog('TRANSPORT_ERROR', `🔌 Transport Error — falha de transporte WebSocket`, { uri: uriObj.uri, cause });
          } else if (cause === 'Dialog Error') {
            addLog('DIALOG_ERROR', `💬 Dialog Error — erro de diálogo SIP`, { uri: uriObj.uri, cause });
          } else if (code === 401 || code === 407 || wwwAuth || proxyAuth) {
            addLog('AUTH_ERROR', `🔐 Autenticação exigida: ${code} ${phrase}`, { wwwAuth, proxyAuth, uri: uriObj.uri });
          } else {
            addLog(`SIP_${code || cause}`, `❌ FAILED: ${code || cause} ${phrase} — URI: ${uriObj.uri}`, {
              code, cause, phrase,
              headers: Object.keys(hdrs),
              www_authenticate: wwwAuth,
              proxy_authenticate: proxyAuth,
              sdp_resposta: sdpFail || null,
            });
          }

          // 486/480/603 = bom sinal (chegou lá)
          const chegou = code === 486 || code === 480 || code === 603 || code === 404;
          if (chegou && (code === 486 || code === 480 || code === 603)) {
            finish(STATUS.ok, `${code} ${phrase} — INVITE chegou ao destino! URI: ${uriObj.uri}`);
            return;
          }

          // Tenta próxima URI
          tryNext();
        });

        session.on('ended', (ev) => {
          addLog('ENDED', `Sessão encerrada: ${ev?.cause || 'N/A'}`);
        });

        // PeerConnection
        session.on('peerconnection', (ev) => {
          const pc = ev.peerconnection;
          addLog('PEERCONN', 'PeerConnection WebRTC criado');
          pc.oniceconnectionstatechange = () => addLog('ICE', `ICE state: ${pc.iceConnectionState}`);
          pc.onicegatheringstatechange  = () => addLog('ICE_GATHER', `ICE gathering: ${pc.iceGatheringState}`);
          pc.onicecandidate = (e) => { if (!e.candidate) addLog('ICE_DONE', 'ICE gathering completo'); };
        });
      };

      const tryNext = () => {
        if (resolved) return;
        try { currentSession?.terminate(); } catch {}
        currentSession = null;
        uriIdx++;
        if (uriIdx < URIS_TESTE.length) {
          addLog('NEXT_URI', `↩ Tentando próxima URI (${uriIdx + 1}/${URIS_TESTE.length})...`);
          setTimeout(() => { if (!resolved) dispararParaUri(URIS_TESTE[uriIdx]); }, 800);
        } else {
          addLog('ALL_FAILED', `Todas as ${URIS_TESTE.length} URIs testadas sem resposta positiva.`);
          finish(STATUS.fail, `Todas as ${URIS_TESTE.length} URIs falharam — veja log detalhado`);
        }
      };

      // Inicializa UA e dispara após registro
      try {
        const socket = new JsSIP.WebSocketInterface('wss://app.nvoip.com.br:7443');
        ua = new JsSIP.UA({
          sockets            : [socket],
          uri                : `sip:${cfg.numbersip}@app.nvoip.com.br`,
          password           : cfg.sip_password,
          authorization_user : String(cfg.numbersip),
          display_name       : String(cfg.numbersip),
          register           : true,
          register_expires   : 60,
          session_timers     : false,
          log                : { builtinEnabled: true, level: 'debug' },
        });

        ua.on('registered', () => {
          addLog('REGISTERED', `✅ Ramal ${cfg.numbersip} registrado — iniciando sequência de INVITEs`);
          dispararParaUri(URIS_TESTE[0]);
        });

        ua.on('registrationFailed', (ev) => {
          const code = ev?.response?.status_code;
          addLog('REG_FAIL', `Registro SIP falhou: ${code} ${ev?.cause}`);
          finish(STATUS.fail, `Registro SIP falhou (${code}) — sem como enviar INVITE`);
        });

        ua.on('disconnected', () => {
          if (!resolved) {
            addLog('TRANSPORT_ERROR', '🔌 WebSocket desconectou durante o teste de INVITE');
          }
        });

        ua.start();
      } catch (e) {
        addLog('ERROR', e.message);
        finish(STATUS.fail, e.message);
      }
    });
  }

  // ── Run ALL ────────────────────────────────────────────────────────────────
  async function runDiagnostico() {
    setRunning(true);
    setChecks({});
    setTestInviteResult(null);

    const cfg = await checkConfig();
    await Promise.all([checkWss(), checkMic()]);
    if (cfg) {
      await checkOAuth(cfg);
      await Promise.all([checkSaldo(), checkRamais(cfg)]);
      await checkSipRegister(cfg);
      await testarInviteWebRTC(cfg);
    }

    setRunning(false);
  }

  const allChecks = Object.values(checks);
  const totalOk   = allChecks.filter(c => c.status === STATUS.ok).length;
  const totalFail = allChecks.filter(c => c.status === STATUS.fail).length;
  const totalWarn = allChecks.filter(c => c.status === STATUS.warn).length;
  const hasRun    = allChecks.length > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6 px-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#10353C] rounded-xl flex items-center justify-center shrink-0">
          <Radio className="w-5 h-5 text-[#23BE84]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Diagnóstico NVOIP — Webphone</h1>
          <p className="text-sm text-slate-500">Verifica registro SIP, INVITE WebRTC e todos os componentes de chamada</p>
        </div>
      </div>

      {/* Número de teste + botão */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-2">
          <div className="flex gap-3 items-center">
            <PhoneCall className="w-4 h-4 text-slate-400 shrink-0" />
            <Input
              placeholder="Número para testar INVITE WebRTC (DDD + número, ex: 87991234567)"
              value={numTeste}
              onChange={e => setNumTeste(e.target.value.replace(/\D/g, ''))}
              className="flex-1"
              disabled={running}
            />
            <Button
              onClick={runDiagnostico}
              disabled={running}
              className="bg-[#10353C] hover:bg-[#1a4d57] text-white shrink-0"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              {running ? 'Testando...' : 'Diagnosticar'}
            </Button>
          </div>
          <p className="text-xs text-slate-400 ml-7">
            ⚠️ Informe um número real — o teste vai enviar um INVITE SIP real e aguardar 180 Ringing para confirmar que a chamada chega ao destino. A ligação será cancelada automaticamente em 3s.
          </p>
        </CardContent>
      </Card>

      {/* Resumo */}
      {hasRun && !running && (
        <div className={cn(
          'rounded-xl p-4 flex items-center gap-4 border',
          totalFail > 0 ? 'bg-red-50 border-red-200' :
          totalWarn > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
        )}>
          {totalFail > 0 ? <XCircle className="w-8 h-8 text-red-500 shrink-0" />
            : totalWarn > 0 ? <AlertTriangle className="w-8 h-8 text-amber-500 shrink-0" />
            : <CheckCircle2 className="w-8 h-8 text-green-600 shrink-0" />}
          <div>
            <p className="font-bold text-slate-800">
              {totalFail > 0 ? `${totalFail} problema(s) crítico(s)` : totalWarn > 0 ? 'Funcional com avisos' : 'Todos os testes passaram!'}
            </p>
            <p className="text-sm text-slate-500">✓ {totalOk} OK &nbsp;|&nbsp; ⚠ {totalWarn} avisos &nbsp;|&nbsp; ✗ {totalFail} falhas</p>
          </div>
        </div>
      )}

      {/* Config & Auth */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Key className="w-4 h-4" /> Configuração & Autenticação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row label="Configuração salva (ramal SIP, senha, token)" {...g('config')} />
          <Row label="Autenticação OAuth REST NVOIP v2" {...g('oauth')} />
          <Row label="Saldo da conta NVOIP" {...g('saldo')} />
          <Row label="Ramal SIP listado na conta (webphone ativo?)" {...g('ramais')} />
        </CardContent>
      </Card>

      {/* Conectividade */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Wifi className="w-4 h-4" /> Conectividade WebRTC / SIP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row label="WebSocket WSS (wss://app.nvoip.com.br:7443)" {...g('wss')} />
          <Row label="Registro SIP via JsSIP (REGISTER)" {...g('sip_reg')} />
          <Row label="Permissão de microfone no navegador" {...g('mic')} />
        </CardContent>
      </Card>

      {/* Teste INVITE */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="w-4 h-4" /> Diagnóstico INVITE SIP Avançado — 4 URIs, SIP Bruto, SDP
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row
            label={numTeste ? `INVITE SIP WebRTC para ${numTeste}` : 'INVITE SIP WebRTC (número não informado)'}
            {...g('sip_invite')}
          />
          {/* Log detalhado do INVITE */}
          {testInviteResult && testInviteResult.length > 0 && (
            <div className="mt-2 bg-slate-900 rounded-lg p-3 overflow-auto max-h-[500px]">
              <p className="text-xs text-slate-400 mb-2 flex items-center gap-1">
                <Terminal className="w-3 h-3" /> Log SIP Avançado — {testInviteResult.length} eventos
              </p>
              {testInviteResult.map((entry, i) => {
                const isError = ['FAILED','TIMEOUT','ERROR','MIC_FAIL','ALL_FAILED','REQUEST_TIMEOUT','TRANSPORT_ERROR','DIALOG_ERROR','AUTH_ERROR','REG_FAIL'].includes(entry.tipo) || entry.tipo.startsWith('SIP_4') || entry.tipo.startsWith('SIP_5');
                const isOk    = ['REGISTERED','200_OK','MIC','NEXT_URI'].includes(entry.tipo) || entry.tipo.startsWith('SIP_18') || entry.tipo.startsWith('SIP_1');
                const isInvite = ['SIP_BRUTO','SDP_ENVIADO','INVITE','TRYING_URI'].includes(entry.tipo);
                const isInfo   = ['URIS','START','PEERCONN','ICE','ICE_GATHER','ICE_DONE','ENDED'].includes(entry.tipo);
                const colorCls = isError ? 'text-red-400' : isOk ? 'text-green-400' : isInvite ? 'text-yellow-300' : isInfo ? 'text-slate-400' : 'text-blue-300';
                return (
                  <div key={i} className="mb-1">
                    <div className="flex gap-2 text-xs font-mono items-start">
                      <span className="text-slate-500 shrink-0">{entry.ts}</span>
                      <span className={cn('shrink-0 font-bold', colorCls)}>[{entry.tipo}]</span>
                      <span className="text-slate-200 break-all flex-1">{entry.msg}</span>
                      {entry.data && (
                        <details className="shrink-0">
                          <summary className="text-slate-500 cursor-pointer hover:text-slate-300">▶ ver</summary>
                          <pre className="text-slate-300 mt-1 whitespace-pre-wrap text-[10px] max-h-64 overflow-auto">
                            {typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log SIP em tempo real do Webphone */}
      {sipLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="w-4 h-4" /> Log SIP em Tempo Real (Webphone ativo)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-900 rounded-lg p-3 overflow-auto max-h-64">
              {sipLogs.map((entry, i) => (
                <div key={i} className="flex gap-2 text-xs font-mono">
                  <span className="text-slate-500 shrink-0">{entry.ts?.split('T')[1]?.split('.')[0] || ''}</span>
                  <span className={cn(
                    'shrink-0',
                    entry.tipo === 'FAILED' || entry.tipo === 'ERROR' || entry.tipo === 'ICE_FAILED' || entry.tipo === 'TIMEOUT' ? 'text-red-400'
                    : entry.tipo === 'REGISTERED' || entry.tipo === '200_OK' || entry.tipo === 'ACK' ? 'text-green-400'
                    : entry.tipo === 'INVITE' || entry.tipo === 'INVITE_SENT' ? 'text-yellow-400'
                    : 'text-slate-300'
                  )}>[{entry.tipo}]</span>
                  <span className="text-slate-200">{entry.detalhe}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1">Atualiza a cada 1s. Faça uma chamada no Webphone para ver os eventos SIP aqui.</p>
          </CardContent>
        </Card>
      )}

      {/* Guia de solução */}
      {hasRun && !running && (totalFail > 0 || totalWarn > 0) && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Como resolver
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-amber-900 space-y-2">
            {g('config').status !== STATUS.ok && <div><strong>📋 Configuração:</strong> Call Center → "Meu Ramal" → preencha Ramal SIP, Senha SIP e User Token.</div>}
            {g('oauth').status === STATUS.fail && <div><strong>🔑 OAuth:</strong> User Token incorreto. No painel NVOIP: Conta → Perfil → "User Token".</div>}
            {g('wss').status === STATUS.fail && <div><strong>🌐 WSS:</strong> WebSocket bloqueado. Tente em 4G ou outro navegador. Verifique proxy corporativo.</div>}
            {g('sip_reg').status === STATUS.fail && g('sip_reg').detail?.includes('Senha') && <div><strong>🔐 Senha SIP:</strong> Diferente do User Token. No painel NVOIP: Ramais → editar ramal → campo "Senha SIP".</div>}
            {g('mic').status === STATUS.fail && <div><strong>🎤 Microfone:</strong> Clique no cadeado na barra de endereço → Microfone → Permitir → atualize a página.</div>}
            {g('ramais').status === STATUS.warn && g('ramais').detail?.includes('DESATIVADO') && <div><strong>📡 Webphone:</strong> No painel NVOIP: Ramais → editar → ativar "Webphone/WebRTC".</div>}
            {g('saldo').status === STATUS.fail && <div><strong>💰 Saldo:</strong> Saldo insuficiente ou credenciais de API inválidas. Recarregue o saldo no painel NVOIP.</div>}
            {g('sip_invite').status === STATUS.fail && g('sip_invite').detail?.includes('TIMEOUT') && (
              <div><strong>📞 INVITE sem resposta:</strong> O INVITE SIP saiu pelo WebSocket mas a NVOIP não retornou nada. Possíveis causas:
                <ul className="list-disc ml-4 mt-1 space-y-0.5">
                  <li>Número inválido (tente com e sem DDI 55)</li>
                  <li>Saldo insuficiente na conta NVOIP</li>
                  <li>Rota de saída não configurada no painel NVOIP</li>
                  <li>DID não associado ao ramal</li>
                  <li>Webphone desativado no ramal</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Arquitetura */}
      <Card className="bg-slate-50">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mb-2">
            {['Navegador (JsSIP)', '→ WSS :7443', '→ REGISTER SIP', '→ INVITE SIP', '→ Servidor NVOIP', '→ PSTN', '→ Destino'].map((s, i) => (
              <Badge key={i} variant="outline" className="text-xs font-mono">{s}</Badge>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            O Webphone registra via WebSocket SIP (REGISTER). Ao discar, envia INVITE direto. Se o INVITE não recebe resposta, o problema está na rota NVOIP — não no navegador.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}