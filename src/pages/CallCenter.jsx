import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Phone, MessageSquare, Volume2, History, Settings,
  Loader2, WifiOff, Wallet, PhoneCall, RefreshCw, Hash, Smartphone
} from 'lucide-react';
import { toast } from 'sonner';

import ConfiguracaoNvoipModal from '@/components/callcenter/ConfiguracaoNvoipModal';
import RealizarChamadaModal from '@/components/callcenter/RealizarChamadaModal';
import ConfiguracaoRamalUsuarioModal from '@/components/callcenter/ConfiguracaoRamalUsuarioModal';
import EnviarSmsModal from '@/components/callcenter/EnviarSmsModal';
import TorpedoVozModal from '@/components/callcenter/TorpedoVozModal';
import HistoricoChamadas from '@/components/callcenter/HistoricoChamadas';
import MeusNumeros from '@/components/callcenter/MeusNumeros';
import ChamadaAtiva from '@/components/callcenter/ChamadaAtiva';
import useSoftphone from '@/components/callcenter/useSoftphone';

// MicroSIP
import useMicroSIP from '@/components/callcenter/microsip/useMicroSIP';
import ChamadaEntrantePopup from '@/components/callcenter/microsip/ChamadaEntrantePopup';
import ChamadaAtivaBar from '@/components/callcenter/microsip/ChamadaAtivaBar';
import ConfiguracaoMicroSIPModal from '@/components/callcenter/microsip/ConfiguracaoMicroSIPModal';
import MicroSIPDiscador from '@/components/callcenter/microsip/MicroSIPDiscador';
import HistoricoChamadasMicroSIP from '@/components/callcenter/microsip/HistoricoChamadasMicroSIP';

export default function CallCenter() {
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saldo, setSaldo] = useState(null);
  const [loadingSaldo, setLoadingSaldo] = useState(false);

  const [configOpen, setConfigOpen] = useState(false);
  const [ramalUsuarioOpen, setRamalUsuarioOpen] = useState(false);
  const [chamadaOpen, setChamadaOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [torpedoOpen, setTorpedoOpen] = useState(false);

  const [chamadaAtiva, setChamadaAtiva] = useState(null); // { callId, destino }
  const [numeroParaChamar, setNumeroParaChamar] = useState('');
  const [ramalStatus, setRamalStatus] = useState(null); // 'Online' | 'Offline' | null
  const [credencialInvalida, setCredencialInvalida] = useState(false);
  const [modoMicroSIP, setModoMicroSIP] = useState(() => {
    return localStorage.getItem('callcenter_modo') === 'microsip';
  });
  const [microSIPConfigOpen, setMicroSIPConfigOpen] = useState(false);
  const [sipConfigOk, setSipConfigOk] = useState(() => {
    const c = localStorage.getItem('microsip_config_local');
    if (!c) return false;
    try { const p = JSON.parse(c); return !!(p.sip_user && p.sip_password && p.sip_domain); } catch { return false; }
  });

  // Puxar parâmetros da URL
  const numeroInicial = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('numero') || '').replace(/\D/g, '');
  }, []);

  // Se URL tem parâmetros do MicroSIP (incoming/answer/hangup/outgoing):
  // Retransmite via BroadcastChannel + localStorage para a aba principal e fecha esta aba
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incoming = params.get('incoming');
    const answer   = params.get('answer');
    const hangup   = params.get('hangup');
    const outgoing = params.get('outgoing');

    if (!incoming && !answer && !hangup && !outgoing) return;

    setModoMicroSIP(true);
    localStorage.setItem('callcenter_modo', 'microsip');

    // Envia evento via BroadcastChannel para aba principal
    if (window.BroadcastChannel) {
      const ch = new BroadcastChannel('microsip_events');
      if (incoming) ch.postMessage({ type: 'incoming', numero: incoming });
      else if (answer) ch.postMessage({ type: 'answered', numero: answer });
      else if (hangup) ch.postMessage({ type: 'hangup', numero: hangup });
      else if (outgoing) ch.postMessage({ type: 'outgoing', numero: outgoing });
      ch.close();
    }

    // Também via localStorage como fallback
    if (incoming) localStorage.setItem('microsip_incoming', incoming);
    else if (hangup) localStorage.setItem('microsip_hangup', hangup);

    // Fecha esta aba (aberta pelo MicroSIP) após retransmitir
    setTimeout(() => window.close(), 300);
  }, []);

  // Hook WebRTC Softphone — ativo no modo NVOIP quando sip_password estiver configurado
  const softphone = useSoftphone(
    config?.sip_password ? { numbersip: config.numbersip, sip_password: config.sip_password } : null
  );

  // Popup de chamada entrante WebRTC — converte para o formato do ChamadaEntrantePopup
  const chamadaEntranteWebRTC = softphone.chamadaEntrante ? {
    numero: softphone.chamadaEntrante.origem,
    clienteNome: null,
    clienteId: null,
  } : null;

  const atenderWebRTC = () => softphone.atenderChamada();
  const ignorarWebRTC = () => softphone.rejeitarChamada();

  // Hook MicroSIP — sempre ativo para detectar chamadas entrantes em qualquer modo
  const microSIP = useMicroSIP({
    empresaId: user?.empresa_id,
    usuario: user,
    sipConfig: null,
  });

  // Ligar via MicroSIP (chamado por vários pontos)
  const ligarViaMicroSIP = (numero, clienteNome = null, clienteId = null) => {
    microSIP.ligar(numero, clienteNome, clienteId);
  };

  // Detectar número da URL — funciona em ambos os modos
  useEffect(() => {
    if (!numeroInicial) return;
    if (modoMicroSIP) microSIP.ligar(numeroInicial);
  }, [numeroInicial, modoMicroSIP]);

  useEffect(() => {
    const init = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);

        let empresaId = me?.empresa_id;

        // Se não veio empresa_id no user, busca pelo colaborador
        if (!empresaId) {
          const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
          const colab = colabs?.find(c => c.empresa_id) || colabs?.[0];
          if (colab?.empresa_id) {
            empresaId = colab.empresa_id;
            // Atualiza o user local com empresa_id correto
            setUser(prev => ({ ...prev, empresa_id: empresaId }));
          }
        }

        if (empresaId) {
          await carregarConfig(empresaId);
        } else {
          setLoadingConfig(false);
        }
      } catch (e) {
        console.error('Erro ao inicializar CallCenter:', e);
        setLoadingConfig(false);
      }
    };
    init();
  }, []);

  const carregarConfig = async (empresaId) => {
    setLoadingConfig(true);
    try {
      const configs = await base44.entities.ConfiguracaoNvoip.filter({ empresa_id: empresaId });
      setConfig(configs.length > 0 ? configs[0] : null);
    } catch (e) {
      console.error('Erro ao carregar config NVOIP:', e);
      setConfig(null);
    }
    setLoadingConfig(false);
  };

  const verificarRamalStatus = async () => {
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', { action: 'listarUsuarios' });
      if (res.data?.error) {
        const err = res.data.error;
        if (err.toLowerCase().includes('invalid user') || err.toLowerCase().includes('forbidden')) {
          setCredencialInvalida(true);
        }
        return;
      }
      const users = res.data?.users || [];
      const meuRamal = users.find(u => u.numbersip === config?.numbersip);
      if (meuRamal) setRamalStatus(meuRamal.status);
    } catch {}
  };

  useEffect(() => {
    if (config?.numbersip && !naoConfigurado) {
      verificarRamalStatus();
    }
  }, [config?.numbersip]);

  const carregarSaldo = async () => {
    setLoadingSaldo(true);
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', { action: 'saldo' });
      if (res.data?.error) {
        const err = res.data.error;
        const isInvalid = err.toLowerCase().includes('invalid user') || err.toLowerCase().includes('forbidden');
        if (isInvalid) setCredencialInvalida(true);
        toast.error('Erro ao consultar saldo: ' + err);
      } else if (res.data?.balance !== undefined) {
        setSaldo(res.data.balance);
      } else {
        // Tenta outros campos possíveis da API NVOIP
        const val = res.data?.saldo ?? res.data?.amount ?? res.data?.value;
        if (val !== undefined) {
          setSaldo(val);
        } else {
          toast.error('Erro ao consultar saldo: credenciais inválidas ou expiradas. Reconfigure o NVOIP.');
        }
      }
    } catch (e) {
      toast.error('Erro ao consultar saldo: ' + e.message);
    } finally {
      setLoadingSaldo(false);
    }
  };

  const toggleModo = () => {
    const novo = !modoMicroSIP;
    setModoMicroSIP(novo);
    localStorage.setItem('callcenter_modo', novo ? 'microsip' : 'nvoip');
  };

  const handleConfigSalva = async () => {
    let empresaId = user?.empresa_id;
    if (!empresaId) {
      const me = await base44.auth.me();
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      const colab = colabs?.find(c => c.empresa_id) || colabs?.[0];
      empresaId = colab?.empresa_id;
    }
    if (empresaId) carregarConfig(empresaId);
  };

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const naoConfigurado = !config || !config.numbersip;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <PhoneCall className="w-7 h-7 text-[#23BE84]" />
            Call Center
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {modoMicroSIP ? 'Modo MicroSIP Local — chamadas diretas sem callback' : 'Modo NVOIP API — chamadas via callback'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle de modo */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => { setModoMicroSIP(false); localStorage.setItem('callcenter_modo', 'nvoip'); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${!modoMicroSIP ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              NVOIP API
            </button>
            <button
              onClick={() => { setModoMicroSIP(true); localStorage.setItem('callcenter_modo', 'microsip'); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${modoMicroSIP ? 'bg-[#10353C] shadow text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              MicroSIP Local
            </button>
          </div>

          {modoMicroSIP ? (
            <Button variant="outline" size="sm" onClick={() => setMicroSIPConfigOpen(true)}>
              <Settings className="w-4 h-4 mr-1" />
              Config MicroSIP
            </Button>
          ) : (
            <>
              {!naoConfigurado && (
                <Badge className="bg-green-100 text-green-700 border-green-200">
                  ● {config.numbersip}
                </Badge>
              )}
              {/* Badge status WebRTC */}
              {config?.sip_password && (
                <Badge className={
                  softphone.sipStatus === 'registrado' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                  softphone.sipStatus === 'conectando' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                  'bg-slate-100 text-slate-500'
                }>
                  {softphone.sipStatus === 'registrado' ? '🔵 WebRTC Online' :
                   softphone.sipStatus === 'conectando' ? '⏳ Conectando...' : '⚪ WebRTC Off'}
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={() => setRamalUsuarioOpen(true)} className="border-green-300 text-green-700 hover:bg-green-50">
                <Phone className="w-4 h-4 mr-1" />
                Meu Ramal
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
                <Settings className="w-4 h-4 mr-1" />
                Config Empresa
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Popup chamada entrante WebRTC (NVOIP direto no browser) */}
      {!modoMicroSIP && (
        <ChamadaEntrantePopup
          chamadaEntrante={chamadaEntranteWebRTC}
          onAtender={atenderWebRTC}
          onIgnorar={ignorarWebRTC}
        />
      )}

      {/* Popup chamada entrante MicroSIP */}
      {modoMicroSIP && (
        <ChamadaEntrantePopup
          chamadaEntrante={microSIP.chamadaEntrante}
          onAtender={microSIP.atenderChamada}
          onIgnorar={microSIP.ignorarChamada}
        />
      )}

      {/* Barra de chamada ativa WebRTC (NVOIP direto) */}
      {!modoMicroSIP && softphone.chamadaAtiva && (
        <ChamadaAtivaBar
          chamadaAtiva={{ numero: softphone.chamadaAtiva.destino, direcao: softphone.chamadaAtiva.direcao, status: softphone.chamadaAtiva.status === 'em_ligacao' ? 'atendida' : 'chamando' }}
          duracao={0}
          onEncerrar={softphone.encerrarChamada}
        />
      )}

      {/* Barra de chamada ativa MicroSIP */}
      {modoMicroSIP && microSIP.chamadaAtiva && (
        <ChamadaAtivaBar
          chamadaAtiva={microSIP.chamadaAtiva}
          duracao={microSIP.duracao}
          onEncerrar={microSIP.encerrarChamada}
        />
      )}

      {/* Banner de credencial inválida — só no modo NVOIP */}
      {credencialInvalida && !naoConfigurado && !modoMicroSIP && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-300 rounded-xl text-sm text-red-800">
          <span className="text-xl">🔑</span>
          <div className="flex-1">
            <p className="font-semibold">Credenciais NVOIP inválidas</p>
            <p className="mt-1 text-red-700">
              A Napikey ou User Token configurados estão incorretos. Acesse o <strong>painel NVOIP → Configurações → API</strong> e copie a Napikey correta, depois clique em <strong>Config Empresa</strong> para atualizar.
            </p>
          </div>
          <button
            onClick={() => setConfigOpen(true)}
            className="shrink-0 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
          >
            Reconfigurar
          </button>
        </div>
      )}





      {/* Não configurado (NVOIP) — só mostra no modo NVOIP */}
      {naoConfigurado && !modoMicroSIP && (
        <div className="space-y-4">
          <Card className="border-dashed border-2 border-slate-300">
            <CardContent className="flex flex-col items-center justify-center py-8 gap-4">
              <WifiOff className="w-12 h-12 text-slate-300" />
              <div className="text-center">
                <h3 className="font-semibold text-slate-600 text-lg">NVOIP não configurado</h3>
                <p className="text-slate-400 text-sm mt-1">
                  Faça login no painel NVOIP abaixo para obter suas credenciais, depois clique em <strong>Configurar Agora</strong>.
                </p>
              </div>
              <Button onClick={() => setConfigOpen(true)} className="bg-[#10353C] hover:bg-[#10353C]/90 text-white">
                <Settings className="w-4 h-4 mr-2" />
                Configurar Agora
              </Button>
            </CardContent>
          </Card>

          {/* Instruções passo a passo */}
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="py-4 px-5">
              <p className="text-sm font-semibold text-blue-800 mb-2">📋 Como configurar em 3 passos:</p>
              <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                <li>No painel NVOIP abaixo, vá em <strong>Configurações → API</strong> e copie o <strong>NumberSIP</strong> e o <strong>User Token</strong>.</li>
                <li>Clique no botão <strong>"Configurar Agora"</strong> acima e cole as credenciais.</li>
                <li>Clique em <strong>Testar Conexão</strong> e depois em <strong>Salvar</strong> — pronto para fazer ligações!</li>
              </ol>
            </CardContent>
          </Card>

          {/* Painel NVOIP embutido para login */}
          <Card>
            <CardContent className="p-0 overflow-hidden rounded-xl">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b">
                <PhoneCall className="w-4 h-4 text-[#23BE84]" />
                <span className="text-sm font-medium text-slate-600">Painel NVOIP — navegue até <strong>Configurações → API</strong> para copiar suas credenciais</span>
                <a
                  href="https://painel.nvoip.com.br/chat"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-xs text-blue-500 hover:underline flex-shrink-0"
                >
                  Abrir em nova aba ↗
                </a>
              </div>
              <iframe
                src="https://painel.nvoip.com.br/chat"
                title="Painel NVOIP"
                className="w-full"
                style={{ height: '600px', border: 'none' }}
                allow="microphone; camera"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── MODO MICROSIP ──────────────────────────────────────────────────── */}
      {modoMicroSIP && (
        <div className="space-y-4">
          {/* Chamada ativa bar */}
          {microSIP.chamadaAtiva && (
            <ChamadaAtivaBar
              chamadaAtiva={microSIP.chamadaAtiva}
              duracao={microSIP.duracao}
              onEncerrar={microSIP.encerrarChamada}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Discador */}
            <div className="lg:col-span-1">
              <MicroSIPDiscador
                onLigar={ligarViaMicroSIP}
                onConfigOpen={() => setMicroSIPConfigOpen(true)}
                sipConfigOk={sipConfigOk}
              />

              {/* Botão de teste para simular chamada entrante */}
              <div className="mt-3 p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                <p className="text-xs text-slate-500 font-medium mb-2">🧪 Simular chamada entrante (teste):</p>
                <div className="flex gap-2">
                  <input
                    className="flex-1 text-xs border rounded px-2 py-1"
                    placeholder="81999991234"
                    id="sim-numero-input"
                  />
                  <button
                    onClick={() => {
                      const n = document.getElementById('sim-numero-input')?.value;
                      microSIP.simularEntrada(n);
                    }}
                    className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                  >
                    Simular
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Ou configure o MicroSIP para abrir:<br/>
                  <code className="bg-slate-200 px-1 rounded">...CallCenter?incoming=%CallerID%</code>
                </p>
              </div>
            </div>

            {/* Histórico */}
            <div className="lg:col-span-2">
              <div className="bg-white border rounded-2xl p-4">
                <HistoricoChamadasMicroSIP empresaId={user?.empresa_id} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODO NVOIP (existente) ──────────────────────────────────────────── */}
      {/* Conteúdo principal */}
      {!naoConfigurado && !modoMicroSIP && (
        <>
          {/* Layout principal */}
          <div className="grid grid-cols-1 gap-6">
            {/* Ações + histórico */}
            <div className="space-y-4">

          {/* Cards de ação rápida */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow border-2 border-green-400 hover:border-green-500 bg-green-50"
              onClick={() => setChamadaOpen(true)}
            >
              <CardContent className="flex flex-col items-center justify-center py-6 gap-2">
                <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                  <Phone className="w-6 h-6 text-white" />
                </div>
                <span className="font-semibold text-sm text-slate-700">Nova Chamada</span>
                <span className="text-xs text-green-600 font-medium">Clique para ligar</span>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-blue-300"
              onClick={() => setSmsOpen(true)}
            >
              <CardContent className="flex flex-col items-center justify-center py-6 gap-2">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-blue-600" />
                </div>
                <span className="font-semibold text-sm text-slate-700">Enviar SMS</span>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-purple-300"
              onClick={() => setTorpedoOpen(true)}
            >
              <CardContent className="flex flex-col items-center justify-center py-6 gap-2">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <Volume2 className="w-6 h-6 text-purple-600" />
                </div>
                <span className="font-semibold text-sm text-slate-700">Torpedo de Voz</span>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-amber-300"
              onClick={carregarSaldo}
            >
              <CardContent className="flex flex-col items-center justify-center py-6 gap-2">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                  {loadingSaldo
                    ? <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
                    : <Wallet className="w-6 h-6 text-amber-600" />
                  }
                </div>
                {saldo !== null
                  ? <span className="font-bold text-green-600">R$ {saldo}</span>
                  : <span className="font-semibold text-sm text-slate-700">Ver Saldo</span>
                }
                {saldo !== null && (
                  <button onClick={(e) => { e.stopPropagation(); setSaldo(null); carregarSaldo(); }}>
                    <RefreshCw className="w-3 h-3 text-slate-400" />
                  </button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Chamada ativa */}
          {chamadaAtiva && (
            <div className="max-w-sm">
              <ChamadaAtiva
                callId={chamadaAtiva.callId}
                destino={chamadaAtiva.destino}
                nomeContato={chamadaAtiva.nomeContato}
                onEncerrada={() => setChamadaAtiva(null)}
              />
            </div>
          )}

          {/* Tabs */}
          <Tabs defaultValue="historico">
            <TabsList>
              <TabsTrigger value="historico">
                <History className="w-4 h-4 mr-1.5" />
                Histórico de Chamadas
              </TabsTrigger>
              <TabsTrigger value="numeros">
                <Hash className="w-4 h-4 mr-1.5" />
                Meus Números
              </TabsTrigger>
            </TabsList>
            <TabsContent value="historico" className="mt-4">
              <HistoricoChamadas />
            </TabsContent>
            <TabsContent value="numeros" className="mt-4">
              <MeusNumeros />
            </TabsContent>
          </Tabs>

            </div>
          </div>{/* fim grid */}
        </>
      )}

      {/* Modal MicroSIP Config */}
      <ConfiguracaoMicroSIPModal
        open={microSIPConfigOpen}
        onOpenChange={setMicroSIPConfigOpen}
        empresaId={user?.empresa_id}
        onSalvo={() => {
          const c = localStorage.getItem('microsip_config_local');
          if (c) { try { const p = JSON.parse(c); setSipConfigOk(!!(p.sip_user && p.sip_password && p.sip_domain)); } catch {} }
        }}
      />

      {/* Modais */}
      <ConfiguracaoNvoipModal
        open={configOpen}
        onOpenChange={setConfigOpen}
        config={config}
        onSalvo={handleConfigSalva}
      />
      <RealizarChamadaModal
        open={chamadaOpen}
        onOpenChange={(v) => { setChamadaOpen(v); if (!v) setNumeroParaChamar(''); }}
        numeroInicial={numeroParaChamar}
        onChamadaIniciada={(callId, destino, nomeContato) => {
          // callId=null significa chamada via microsip: — não ativa o painel NVOIP
          if (callId) setChamadaAtiva({ callId, destino, nomeContato });
        }}
      />
      <ConfiguracaoRamalUsuarioModal
        open={ramalUsuarioOpen}
        onOpenChange={setRamalUsuarioOpen}
        onSalvo={() => {}}
      />
      <EnviarSmsModal
        open={smsOpen}
        onOpenChange={setSmsOpen}
      />
      <TorpedoVozModal
        open={torpedoOpen}
        onOpenChange={setTorpedoOpen}
        numbersip={config?.numbersip}
      />
    </div>
  );
}