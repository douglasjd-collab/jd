import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Phone, MessageSquare, Volume2, History, Settings,
  Loader2, WifiOff, Wallet, PhoneCall, RefreshCw, Hash, Stethoscope, Sparkles
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
import SoftphonePanel from '@/components/callcenter/SoftphonePanel';
import useSoftphone from '@/components/callcenter/useSoftphone';
import AssistenteIALigacao from '@/components/callcenter/AssistenteIALigacao';

export default function CallCenter() {
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [sipConfig, setSipConfig] = useState(null); // config com sip_password para softphone
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saldo, setSaldo] = useState(null);
  const [loadingSaldo, setLoadingSaldo] = useState(false);

  const [configOpen, setConfigOpen] = useState(false);
  const [ramalUsuarioOpen, setRamalUsuarioOpen] = useState(false);
  const [chamadaOpen, setChamadaOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [torpedoOpen, setTorpedoOpen] = useState(false);

  const [chamadaAtiva, setChamadaAtiva] = useState(null);
  const [numeroParaChamar, setNumeroParaChamar] = useState('');
  const [credencialInvalida, setCredencialInvalida] = useState(false);
  const [assistenteIAOpen, setAssistenteIAOpen] = useState(false);

  // Softphone WebRTC — só inicializa se tiver sip_password
  const softphone = useSoftphone(sipConfig?.sip_password ? sipConfig : null);

  const numeroInicial = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('numero') || '').replace(/\D/g, '');
  }, []);

  useEffect(() => {
    if (numeroInicial) {
      setNumeroParaChamar(numeroInicial);
      setChamadaOpen(true);
    }
  }, [numeroInicial]);

  useEffect(() => {
    const init = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);

        let empresaId = me?.empresa_id;
        if (!empresaId) {
          const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
          const colab = colabs?.find(c => c.empresa_id) || colabs?.[0];
          if (colab?.empresa_id) {
            empresaId = colab.empresa_id;
            setUser(prev => ({ ...prev, empresa_id: empresaId }));
          }
        }

        if (empresaId) {
          await carregarConfig(empresaId);
        } else {
          setLoadingConfig(false);
        }

        // Carrega config com sip_password para o softphone
        const sipRes = await base44.functions.invoke('nvoipCallCenter', { action: 'buscarConfigUsuario' });
        const cfgSip = sipRes.data?.config;
        if (cfgSip?.numbersip) {
          setSipConfig(cfgSip); // conecta mesmo sem sip_password — useSoftphone mostrará erro adequado
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

  const carregarSaldo = async () => {
    setLoadingSaldo(true);
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', { action: 'saldo' });
      if (res.data?.error) {
        const err = res.data.error;
        if (err.toLowerCase().includes('invalid user') || err.toLowerCase().includes('forbidden')) {
          setCredencialInvalida(true);
        }
        toast.error('Erro ao consultar saldo: ' + err);
      } else if (res.data?.balance !== undefined) {
        setSaldo(res.data.balance);
      } else {
        const val = res.data?.saldo ?? res.data?.amount ?? res.data?.value;
        if (val !== undefined) {
          setSaldo(val);
        } else {
          toast.error('Erro ao consultar saldo: credenciais inválidas ou expiradas.');
        }
      }
    } catch (e) {
      toast.error('Erro ao consultar saldo: ' + e.message);
    } finally {
      setLoadingSaldo(false);
    }
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

  // Atalho de teclado: Ctrl+L abre modal de ligação
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        const isConfigurado = config && config.numbersip;
        if (isConfigurado) {
          setChamadaOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [config]);

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
          <p className="text-slate-500 text-sm mt-1">Softphone WebRTC — ligações diretas no navegador</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!naoConfigurado && (
            <Badge className="bg-green-100 text-green-700 border-green-200">
              ● {config.numbersip}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => setRamalUsuarioOpen(true)} className="border-green-300 text-green-700 hover:bg-green-50">
            <Phone className="w-4 h-4 mr-1" />
            Meu Ramal
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
            <Settings className="w-4 h-4 mr-1" />
            Configurações
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.location.href = '/DiagnosticoNvoip'} className="border-blue-200 text-blue-700 hover:bg-blue-50">
            <Stethoscope className="w-4 h-4 mr-1" />
            Diagnóstico
          </Button>
          <Button size="sm" onClick={() => setAssistenteIAOpen(true)} className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
            <Sparkles className="w-4 h-4" />
            Assistente IA
          </Button>
        </div>
      </div>

      {/* Banner credencial inválida */}
      {credencialInvalida && !naoConfigurado && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-300 rounded-xl text-sm text-red-800">
          <span className="text-xl">🔑</span>
          <div className="flex-1">
            <p className="font-semibold">Credenciais NVOIP inválidas</p>
            <p className="mt-1 text-red-700">
              A Napikey ou User Token estão incorretos. Acesse o <strong>painel NVOIP → Configurações → API</strong> e copie a Napikey correta.
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

      {/* Não configurado */}
      {naoConfigurado && (
        <div className="space-y-4">
          <Card className="border-dashed border-2 border-slate-300">
            <CardContent className="flex flex-col items-center justify-center py-8 gap-4">
              <WifiOff className="w-12 h-12 text-slate-300" />
              <div className="text-center">
                <h3 className="font-semibold text-slate-600 text-lg">NVOIP não configurado</h3>
                <p className="text-slate-400 text-sm mt-1">
                  Acesse o painel NVOIP abaixo para obter suas credenciais e clique em <strong>Configurações</strong>.
                </p>
              </div>
              <Button onClick={() => setConfigOpen(true)} className="bg-[#10353C] hover:bg-[#10353C]/90 text-white">
                <Settings className="w-4 h-4 mr-2" />
                Configurar Agora
              </Button>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="py-4 px-5">
              <p className="text-sm font-semibold text-blue-800 mb-2">📋 Como configurar em 3 passos:</p>
              <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                <li>No painel NVOIP abaixo, vá em <strong>Configurações → API</strong> e copie o <strong>NumberSIP</strong> e o <strong>User Token</strong>.</li>
                <li>Clique em <strong>"Configurar Agora"</strong> acima e cole as credenciais.</li>
                <li>Clique em <strong>Testar Conexão</strong> e depois em <strong>Salvar</strong>.</li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0 overflow-hidden rounded-xl">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b">
                <PhoneCall className="w-4 h-4 text-[#23BE84]" />
                <span className="text-sm font-medium text-slate-600">Painel NVOIP — <strong>Configurações → API</strong></span>
                <a href="https://painel.nvoip.com.br/chat" target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-blue-500 hover:underline flex-shrink-0">
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

      {/* Conteúdo principal */}
      {!naoConfigurado && (
        <div className="space-y-4">

          {/* Chamada ativa - visível no topo */}
          {chamadaAtiva && (
            <div className="bg-gradient-to-r from-green-50 to-cyan-50 border-2 border-green-300 rounded-xl p-4">
              <ChamadaAtiva
                callId={chamadaAtiva.callId}
                destino={chamadaAtiva.destino}
                nomeContato={chamadaAtiva.nomeContato}
                empresaId={user?.empresa_id}
                usuarioId={user?.id}
                usuarioNome={user?.nome_perfil || user?.full_name}
                clienteId={chamadaAtiva.clienteId}
                clienteNome={chamadaAtiva.nomeContato}
                onEncerrada={() => setChamadaAtiva(null)}
              />
            </div>
          )}

          {/* Layout: Softphone + Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Softphone WebRTC */}
            <div className="lg:col-span-1">
              <SoftphonePanel
                softphone={softphone}
                numbersip={sipConfig?.numbersip || config?.numbersip}
                numeroChip={sipConfig?.numero_chip || config?.numero_chip}
              />
            </div>

            {/* Cards de ação secundária */}
             <div className="lg:col-span-2">
               <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                 <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-blue-300" onClick={() => setSmsOpen(true)}>
                   <CardContent className="flex flex-col items-center justify-center py-6 gap-2">
                     <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                       <MessageSquare className="w-6 h-6 text-blue-600" />
                     </div>
                     <span className="font-semibold text-sm text-slate-700">Enviar SMS</span>
                   </CardContent>
                 </Card>

                 <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-purple-300" onClick={() => setTorpedoOpen(true)}>
                   <CardContent className="flex flex-col items-center justify-center py-6 gap-2">
                     <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                       <Volume2 className="w-6 h-6 text-purple-600" />
                     </div>
                     <span className="font-semibold text-sm text-slate-700">Torpedo de Voz</span>
                   </CardContent>
                 </Card>

                 <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-amber-300" onClick={carregarSaldo}>
                   <CardContent className="flex flex-col items-center justify-center py-6 gap-2">
                     <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                       {loadingSaldo ? <Loader2 className="w-6 h-6 text-amber-600 animate-spin" /> : <Wallet className="w-6 h-6 text-amber-600" />}
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

                 {/* Fallback: API Callback NVOIP */}
                 <Card className="cursor-pointer hover:shadow-md transition-shadow border hover:border-slate-400 opacity-70 hover:opacity-100" onClick={() => setChamadaOpen(true)}>
                   <CardContent className="flex flex-col items-center justify-center py-6 gap-2">
                     <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                       <PhoneCall className="w-6 h-6 text-slate-500" />
                     </div>
                     <span className="font-semibold text-sm text-slate-600">Fallback: API</span>
                     <span className="text-xs text-slate-400 text-center">Callback NVOIP REST</span>
                   </CardContent>
                 </Card>
               </div>
             </div>{/* end lg:col-span-2 */}
          </div>{/* end grid layout */}



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
              <HistoricoChamadas
                empresaId={user?.empresa_id}
                usuarioId={user?.colaborador_id}
                perfil={user?.perfil}
              />
            </TabsContent>
            <TabsContent value="numeros" className="mt-4">
              <MeusNumeros />
            </TabsContent>
          </Tabs>
        </div>
      )}

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
        softphone={softphone}
        onChamadaIniciada={(callId, destino, nomeContato) => {
          if (callId) setChamadaAtiva({ callId, destino, nomeContato });
        }}
      />
      <ConfiguracaoRamalUsuarioModal
        open={ramalUsuarioOpen}
        onOpenChange={setRamalUsuarioOpen}
        onSalvo={async () => {
          // Recarrega sipConfig para o softphone reconectar com nova senha SIP
          const sipRes = await base44.functions.invoke('nvoipCallCenter', { action: 'buscarConfigUsuario' });
          if (sipRes.data?.config?.sip_password) setSipConfig(sipRes.data.config);
        }}
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
      <AssistenteIALigacao
        open={assistenteIAOpen}
        onOpenChange={setAssistenteIAOpen}
        currentUser={user}
      />
    </div>
  );
}