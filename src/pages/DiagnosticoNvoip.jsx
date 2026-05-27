import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import JsSIP from 'jssip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  CheckCircle2, XCircle, Loader2, AlertTriangle,
  Wifi, Phone, Mic, Radio, Server, Key, RefreshCw, ChevronDown, ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── helpers ──────────────────────────────────────────────────────────────────
const STATUS = { idle: 'idle', running: 'running', ok: 'ok', warn: 'warn', fail: 'fail' };

function StatusIcon({ status, className }) {
  const cls = cn('w-5 h-5 shrink-0', className);
  if (status === STATUS.running) return <Loader2 className={cn(cls, 'animate-spin text-blue-500')} />;
  if (status === STATUS.ok)      return <CheckCircle2 className={cn(cls, 'text-green-600')} />;
  if (status === STATUS.warn)    return <AlertTriangle className={cn(cls, 'text-amber-500')} />;
  if (status === STATUS.fail)    return <XCircle className={cn(cls, 'text-red-500')} />;
  return <div className={cn('w-4 h-4 rounded-full bg-slate-200', className)} />;
}

function Row({ label, status, detail, extra }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn(
      'border rounded-lg px-4 py-3 transition-colors',
      status === STATUS.ok   && 'bg-green-50  border-green-200',
      status === STATUS.warn && 'bg-amber-50  border-amber-200',
      status === STATUS.fail && 'bg-red-50    border-red-200',
      status === STATUS.running && 'bg-blue-50 border-blue-200',
      status === STATUS.idle && 'bg-slate-50  border-slate-200',
    )}>
      <div className="flex items-center gap-3">
        <StatusIcon status={status} />
        <span className="font-medium text-sm flex-1">{label}</span>
        {detail && <span className="text-xs text-slate-500 max-w-[240px] truncate text-right">{detail}</span>}
        {extra && (
          <button onClick={() => setOpen(o => !o)} className="text-slate-400 hover:text-slate-600">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>
      {open && extra && (
        <pre className="mt-2 text-xs bg-white rounded p-2 border overflow-auto max-h-48 text-slate-700">
          {typeof extra === 'string' ? extra : JSON.stringify(extra, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function DiagnosticoNvoip() {
  const [checks, setChecks] = useState({});
  const [running, setRunning] = useState(false);
  const [numTeste, setNumTeste] = useState('');
  const uaRef = useRef(null);

  const set = (key, status, detail = '', extra = null) =>
    setChecks(prev => ({ ...prev, [key]: { status, detail, extra } }));

  const g = (key) => checks[key] || { status: STATUS.idle, detail: '', extra: null };

  // ── 1. Config salva no banco ────────────────────────────────────────────────
  async function checkConfig() {
    set('config', STATUS.running, 'Buscando configuração...');
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', { action: 'buscarConfigUsuario' });
      const cfg = res.data?.config;
      if (!cfg) {
        set('config', STATUS.fail, 'Nenhuma configuração encontrada', res.data);
        return null;
      }
      const campos = [];
      if (!cfg.numbersip)    campos.push('NumberSIP');
      if (!cfg.sip_password) campos.push('Senha SIP');
      if (!cfg.user_token && !cfg.napikey) campos.push('User Token ou Napikey');

      if (campos.length > 0) {
        set('config', STATUS.warn,
          `Configurado (faltam: ${campos.join(', ')})`,
          { ...cfg, sip_password: cfg.sip_password ? '●●●●' : null, user_token: cfg.user_token ? '●●●●' : null }
        );
      } else {
        set('config', STATUS.ok,
          `Ramal ${cfg.numbersip} | DID ${cfg.numero_did || '—'}`,
          { ...cfg, sip_password: cfg.sip_password ? '●●●●' : null, user_token: cfg.user_token ? '●●●●' : null }
        );
      }
      return cfg;
    } catch (e) {
      set('config', STATUS.fail, e.message);
      return null;
    }
  }

  // ── 2. OAuth REST (autenticar na NVOIP) ─────────────────────────────────────
  async function checkOAuth(cfg) {
    set('oauth', STATUS.running, 'Autenticando via OAuth na API NVOIP...');
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', {
        action: 'testarConexao',
        numbersip: cfg.numbersip,
        user_token: cfg.user_token,
        napikey: cfg.napikey,
      });
      if (res.data?.success) {
        set('oauth', STATUS.ok, res.data.message || 'OAuth OK');
      } else {
        set('oauth', STATUS.fail, res.data?.error || 'Falha na autenticação', res.data);
      }
    } catch (e) {
      set('oauth', STATUS.fail, e.message);
    }
  }

  // ── 3. Saldo da conta ────────────────────────────────────────────────────────
  async function checkSaldo() {
    set('saldo', STATUS.running, 'Consultando saldo...');
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', { action: 'saldo' });
      const d = res.data;
      if (d?.error) { set('saldo', STATUS.fail, d.error, d); return; }
      const valor = d?.balance ?? d?.saldo ?? d?.amount ?? '?';
      set('saldo', STATUS.ok, `R$ ${valor}`, d);
    } catch (e) {
      set('saldo', STATUS.fail, e.message);
    }
  }

  // ── 4. Listar ramais SIP ─────────────────────────────────────────────────────
  async function checkRamais(cfg) {
    set('ramais', STATUS.running, 'Listando ramais SIP...');
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', { action: 'listarUsuarios' });
      const users = res.data?.users || [];
      if (!users.length) {
        set('ramais', STATUS.warn, 'Sem ramais listados', res.data);
        return;
      }
      const ramal = users.find(u => String(u.numbersip) === String(cfg?.numbersip));
      if (ramal) {
        const webphone = ramal.webphone ? '✓ Webphone ativo' : '⚠ Webphone desativado';
        set('ramais', STATUS.ramal?.webphone ? STATUS.ok : STATUS.warn,
          `Ramal ${cfg.numbersip} encontrado — ${webphone}`,
          ramal
        );
        set('ramais', ramal.webphone ? STATUS.ok : STATUS.warn,
          `Ramal ${cfg.numbersip} — ${webphone}`,
          ramal
        );
      } else {
        set('ramais', STATUS.warn,
          `Ramal ${cfg?.numbersip} não encontrado entre ${users.length} ramal(is)`,
          users.map(u => u.numbersip)
        );
      }
    } catch (e) {
      set('ramais', STATUS.fail, e.message);
    }
  }

  // ── 5. WebSocket WSS ─────────────────────────────────────────────────────────
  async function checkWss() {
    set('wss', STATUS.running, 'Testando WSS wss://app.nvoip.com.br:7443...');
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        set('wss', STATUS.fail, 'Timeout: sem resposta em 6s do WSS NVOIP');
        resolve(false);
      }, 6000);
      try {
        const ws = new WebSocket('wss://app.nvoip.com.br:7443');
        ws.onopen = () => {
          clearTimeout(timeout);
          set('wss', STATUS.ok, 'WebSocket conectado (wss://app.nvoip.com.br:7443)');
          ws.close();
          resolve(true);
        };
        ws.onerror = (e) => {
          clearTimeout(timeout);
          set('wss', STATUS.fail, 'Falha ao conectar WebSocket — verifique firewall/proxy do navegador');
          resolve(false);
        };
      } catch (e) {
        clearTimeout(timeout);
        set('wss', STATUS.fail, e.message);
        resolve(false);
      }
    });
  }

  // ── 6. Registro SIP via JsSIP ────────────────────────────────────────────────
  async function checkSipRegister(cfg) {
    if (!cfg?.numbersip || !cfg?.sip_password) {
      set('sip', STATUS.warn, 'Ramal SIP ou Senha SIP não configurados — ignorando teste SIP');
      return false;
    }
    set('sip', STATUS.running, `Tentando registrar ramal ${cfg.numbersip}...`);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        set('sip', STATUS.fail, 'Timeout: sem registro SIP em 12s');
        try { ua?.stop(); } catch {}
        resolve(false);
      }, 12000);

      let ua;
      try {
        const socket = new JsSIP.WebSocketInterface('wss://app.nvoip.com.br:7443');
        ua = new JsSIP.UA({
          sockets: [socket],
          uri: `sip:${cfg.numbersip}@app.nvoip.com.br`,
          password: cfg.sip_password,
          authorization_user: String(cfg.numbersip),
          register: true,
          register_expires: 60,
          session_timers: false,
          log: { builtinEnabled: false, level: 'error' },
        });
        ua.on('registered', () => {
          clearTimeout(timeout);
          set('sip', STATUS.ok, `Ramal ${cfg.numbersip} REGISTRADO com sucesso no servidor SIP NVOIP`);
          ua.stop();
          resolve(true);
        });
        ua.on('registrationFailed', (e) => {
          clearTimeout(timeout);
          const code = e?.response?.status_code;
          let msg = `Falha no registro SIP: ${e?.cause || code}`;
          if (code === 401 || code === 403) msg = `Senha SIP inválida (${code}) — verifique em "Meu Ramal"`;
          if (code === 404) msg = `Ramal ${cfg.numbersip} não encontrado no servidor NVOIP`;
          set('sip', STATUS.fail, msg, { cause: e?.cause, code });
          ua.stop();
          resolve(false);
        });
        ua.on('disconnected', () => {
          clearTimeout(timeout);
          set('sip', STATUS.fail, 'WebSocket desconectou antes de completar o registro');
          resolve(false);
        });
        ua.start();
        uaRef.current = ua;
      } catch (e) {
        clearTimeout(timeout);
        set('sip', STATUS.fail, e.message);
        resolve(false);
      }
    });
  }

  // ── 7. Permissão de Microfone ────────────────────────────────────────────────
  async function checkMic() {
    set('mic', STATUS.running, 'Verificando permissão de microfone...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      set('mic', STATUS.ok, 'Microfone disponível e com permissão concedida');
      return true;
    } catch (e) {
      const msg = e.name === 'NotAllowedError'
        ? 'Permissão de microfone NEGADA — clique no cadeado da barra de endereço e permita'
        : `Microfone indisponível: ${e.message}`;
      set('mic', STATUS.fail, msg);
      return false;
    }
  }

  // ── 8. Chamada de teste (opcional) ──────────────────────────────────────────
  async function checkChamadaTeste(cfg) {
    const num = numTeste.replace(/\D/g, '');
    if (!num || num.length < 8) {
      set('chamada', STATUS.warn, 'Número de teste não informado — etapa ignorada');
      return;
    }
    set('chamada', STATUS.running, `Iniciando chamada de teste para ${num}...`);
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', {
        action: 'realizarChamada',
        called: num,
      });
      const d = res.data;
      if (d?.error || d?._error_type) {
        set('chamada', STATUS.fail, d.error || d._error_type, d);
      } else {
        set('chamada', STATUS.ok, `Chamada iniciada — callId: ${d?.callId || '(sem ID)'}`, d);
      }
    } catch (e) {
      set('chamada', STATUS.fail, e.message);
    }
  }

  // ── Run ALL ──────────────────────────────────────────────────────────────────
  async function runDiagnostico() {
    setRunning(true);
    setChecks({});

    const cfg = await checkConfig();
    await Promise.all([checkWss(), checkMic()]);
    if (cfg) {
      await checkOAuth(cfg);
      await Promise.all([checkSaldo(), checkRamais(cfg)]);
      await checkSipRegister(cfg);
    }
    await checkChamadaTeste(cfg);

    setRunning(false);
  }

  // ── Resumo ──────────────────────────────────────────────────────────────────
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
          <p className="text-sm text-slate-500">Verifica todos os componentes necessários para ligações diretas no CRM</p>
        </div>
      </div>

      {/* Número de teste (opcional) */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3 items-center">
            <Phone className="w-4 h-4 text-slate-400 shrink-0" />
            <Input
              placeholder="Número para chamada de teste (opcional) — DDD + número"
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
              {running ? 'Testando...' : 'Iniciar Diagnóstico'}
            </Button>
          </div>
          <p className="text-xs text-slate-400 mt-1 ml-7">Se informar um número, o diagnóstico também testa uma chamada real via API NVOIP</p>
        </CardContent>
      </Card>

      {/* Resumo */}
      {hasRun && !running && (
        <div className={cn(
          'rounded-xl p-4 flex items-center gap-4 border',
          totalFail > 0 ? 'bg-red-50 border-red-200' :
          totalWarn > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
        )}>
          {totalFail > 0
            ? <XCircle className="w-8 h-8 text-red-500 shrink-0" />
            : totalWarn > 0
            ? <AlertTriangle className="w-8 h-8 text-amber-500 shrink-0" />
            : <CheckCircle2 className="w-8 h-8 text-green-600 shrink-0" />
          }
          <div>
            <p className="font-bold text-slate-800">
              {totalFail > 0
                ? `${totalFail} problema(s) crítico(s) encontrado(s)`
                : totalWarn > 0
                ? 'Integração funcional com avisos'
                : 'Todos os testes passaram — Webphone pronto!'}
            </p>
            <p className="text-sm text-slate-500">
              ✓ {totalOk} OK &nbsp;|&nbsp; ⚠ {totalWarn} avisos &nbsp;|&nbsp; ✗ {totalFail} falhas
            </p>
          </div>
        </div>
      )}

      {/* Checks */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="w-4 h-4" /> Configuração & Autenticação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row label="Configuração salva (ramal SIP, senha, token)" {...g('config')} />
          <Row label="Autenticação OAuth REST na API NVOIP v2" {...g('oauth')} />
          <Row label="Saldo da conta NVOIP" {...g('saldo')} />
          <Row label="Ramal SIP listado na conta" {...g('ramais')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wifi className="w-4 h-4" /> Conectividade WebRTC / SIP
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row label="WebSocket WSS (wss://app.nvoip.com.br:7443)" {...g('wss')} />
          <Row label="Registro SIP via JsSIP (WebRTC direto)" {...g('sip')} />
          <Row label="Permissão de microfone no navegador" {...g('mic')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="w-4 h-4" /> Chamada de Teste
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row label={numTeste ? `Chamada API para ${numTeste}` : 'Chamada de teste (número não informado)'} {...g('chamada')} />
        </CardContent>
      </Card>

      {/* Guia de solução */}
      {hasRun && !running && (totalFail > 0 || totalWarn > 0) && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Como resolver os problemas encontrados
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-amber-900 space-y-2">
            {g('config').status !== STATUS.ok && (
              <div><strong>📋 Configuração:</strong> Acesse Call Center → botão "Meu Ramal" → preencha Ramal SIP, Senha SIP e User Token.</div>
            )}
            {g('oauth').status === STATUS.fail && (
              <div><strong>🔑 OAuth:</strong> User Token incorreto. No painel NVOIP: Conta → Perfil → "User Token". Copie e cole exatamente.</div>
            )}
            {g('wss').status === STATUS.fail && (
              <div><strong>🌐 WSS:</strong> O WebSocket está bloqueado. Verifique se o navegador tem acesso à porta 7443 (pode ser bloqueio de proxy/VPN corporativa). Tente em rede 4G.</div>
            )}
            {g('sip').status === STATUS.fail && g('sip').detail?.includes('Senha') && (
              <div><strong>🔐 Senha SIP:</strong> A senha SIP é diferente do User Token. No painel NVOIP: Ramais → clique no ramal → campo "Senha" (não é a senha de login). Atualize em "Meu Ramal".</div>
            )}
            {g('sip').status === STATUS.fail && g('sip').detail?.includes('não encontrado') && (
              <div><strong>📞 Ramal:</strong> O número do ramal SIP não existe na conta NVOIP. Verifique em NVOIP → Ramais quais estão disponíveis.</div>
            )}
            {g('mic').status === STATUS.fail && (
              <div><strong>🎤 Microfone:</strong> Permissão negada. Clique no cadeado (🔒) na barra de endereço do navegador → Microfone → Permitir → atualize a página.</div>
            )}
            {g('ramais').status === STATUS.warn && g('ramais').detail?.includes('Webphone') && (
              <div><strong>📡 Webphone:</strong> O Webphone está desativado no ramal. No painel NVOIP: Ramais → editar ramal → ativar "Webphone/WebRTC".</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Arquitetura */}
      <Card className="bg-slate-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-slate-400 uppercase tracking-wide">Como funciona a ligação direta</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {['CRM (navegador)', '→ WSS :7443', '→ Registro SIP', '→ SIP INVITE', '→ Servidor NVOIP', '→ PSTN', '→ Cliente'].map((s, i) => (
              <React.Fragment key={i}>
                <Badge variant="outline" className="text-xs font-mono">{s}</Badge>
              </React.Fragment>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3">
            O CRM registra o ramal SIP via WebSocket seguro. Ao discar, envia um SIP INVITE direto pelo WSS — sem callback, sem celular físico, sem MicroSIP. O áudio (RTP/SRTP) trafega pelo navegador.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}