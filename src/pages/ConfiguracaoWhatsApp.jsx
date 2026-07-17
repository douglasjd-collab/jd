import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, Copy, AlertCircle, Loader2, MessageSquare, XCircle, Wifi, QrCode, RefreshCw, WifiOff, Plus } from 'lucide-react';
import { toast } from 'sonner';
import LoginMetaOficialButton from '@/components/configuracoes/LoginMetaOficialButton';
import InstanciasWhatsAppMeta from '@/components/configuracoes/InstanciasWhatsAppMeta';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function ConfiguracaoWhatsApp() {
  const [copied, setCopied] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [evolutionUrl, setEvolutionUrl] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [tempUrl, setTempUrl] = useState('');
  const [tempInstance, setTempInstance] = useState('');
  const [tempApiKey, setTempApiKey] = useState('');
  const [tempWhatsappAccessToken, setTempWhatsappAccessToken] = useState('');
  const [tempWhatsappPhoneNumberId, setTempWhatsappPhoneNumberId] = useState('');
  const [tempWhatsappBusinessAccountId, setTempWhatsappBusinessAccountId] = useState('');
  const [tempWhatsappVerifyToken, setTempWhatsappVerifyToken] = useState('');
  const [whatsappAccessToken, setWhatsappAccessToken] = useState('');
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState('');
  const [whatsappBusinessAccountId, setWhatsappBusinessAccountId] = useState('');
  const [whatsappVerifyToken, setWhatsappVerifyToken] = useState('');
  const [tokenTipo, setTokenTipo] = useState('permanente');
  const [tokenAtualizadoEm, setTokenAtualizadoEm] = useState(null);
  const [tempTokenTipo, setTempTokenTipo] = useState('permanente');
  const [saving, setSaving] = useState(false);
  const [atualizandoWebhook, setAtualizandoWebhook] = useState(false);
  const [testandoMeta, setTestandoMeta] = useState(false);
  const [statusMeta, setStatusMeta] = useState(null); // null | {success, phone_number, verified_name, quality_rating, error}
  const [user, setUser] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [apiTab, setApiTab] = useState('evolution');
  const [apiPreferida, setApiPreferida] = useState('auto');
  const [tempApiPreferida, setTempApiPreferida] = useState('auto');
  const [qrCode, setQrCode] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrStatus, setQrStatus] = useState(null); // null | 'connected' | 'waiting'
  const [qrPolling, setQrPolling] = useState(null);
  const [criandoInstancia, setCriandoInstancia] = useState(false);
  const [desconectando, setDesconectando] = useState(false);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);

      let empId = null;

      // Buscar colaborador ativo deste usuário
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      const colab = colabs?.[0];
      empId = colab?.empresa_id || null;

      // Se não achou empresa pelo colaborador, tentar pelo campo empresa_id do usuário
      if (!empId) {
        empId = me.empresa_id || null;
      }

      // Se ainda não achou (super_admin sem empresa vinculada), buscar empresa pelo email do usuário
      if (!empId && me.email) {
        const resp = await base44.functions.invoke('listarEmpresas', {});
        const todasEmpresas = resp?.data?.empresas || [];
        // Empresa do super_admin: aquela cujo email_admin bate com o email do usuário
        const empresaDoAdmin = todasEmpresas.find(e =>
          e.email_admin === me.email || e.email === me.email
        );
        empId = empresaDoAdmin?.id || null;
      }

      if (empId) {
        const emps = await base44.entities.Empresa.filter({ id: empId });
        if (emps && emps.length > 0) {
          carregarEmpresa(emps[0]);
        }
      } else {
        toast.error('Não foi possível identificar a empresa. Verifique seu cadastro.');
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const carregarEmpresa = (empresaData) => {
    setEmpresa(empresaData);
    // Carregar APENAS as credenciais específicas desta empresa
    // Não herdar da super conta
    setEvolutionUrl(empresaData.evolution_url || '');
    setInstanceName(empresaData.evolution_instance_name || '');
    setApiKey(empresaData.evolution_api_key || '');
    setWhatsappAccessToken(empresaData.whatsapp_access_token || '');
    setWhatsappPhoneNumberId(empresaData.whatsapp_phone_number_id || '');
    setWhatsappBusinessAccountId(empresaData.whatsapp_business_account_id || '');
    setWhatsappVerifyToken(empresaData.whatsapp_verify_token || '');
    setApiPreferida(empresaData.whatsapp_api_preferida || 'auto');
    
    // Gerar URL webhook com nome da instância DESTA EMPRESA
    // Cada empresa tem sua própria URL com sua instância
    const webhookGerada = gerarUrlWebhook(empresaData.evolution_instance_name);
    setWebhookUrl(webhookGerada);
  };

  const gerarVerifyTokenPadrao = () => {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return token;
  };

  // URL BASE FIXA - NUNCA DEVE SER ALTERADA
  const BASE_WEBHOOK_URL = 'https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp';

  const gerarUrlWebhook = (instancia) => {
    if (!instancia) return BASE_WEBHOOK_URL;
    // Usar query string padrão ?instance=NOME (mais compatível com Evolution API)
    return `${BASE_WEBHOOK_URL}?instance=${encodeURIComponent(instancia)}`;
  };

  const obterUrlCorretaAuto = async () => {
    try {
      if (instanceName) {
        const urlCorreta = gerarUrlWebhook(instanceName);
        console.log('✅ URL Webhook Gerada:', urlCorreta);
        setWebhookUrl(urlCorreta);
      }
    } catch (error) {
      console.error('Erro ao gerar URL:', error);
    }
  };

  const handleEditMode = () => {
    if (!editMode) {
      setTempUrl(evolutionUrl);
      setTempInstance(instanceName);
      setTempApiKey(apiKey);
      setTempWhatsappAccessToken(whatsappAccessToken);
      setTempWhatsappPhoneNumberId(whatsappPhoneNumberId);
      setTempWhatsappBusinessAccountId(whatsappBusinessAccountId);
      setTempWhatsappVerifyToken(whatsappVerifyToken);
      setTempTokenTipo(tokenTipo || 'permanente');
      setTempApiPreferida(apiPreferida || 'auto');
    }
    setEditMode(!editMode);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const empresaId = empresa?.id;

      if (!empresaId) {
        toast.error('Erro: Empresa não definida');
        return;
      }

      // IMPORTANTE: Cada empresa tem suas próprias credenciais isoladas
      // Super conta e subcontas NÃO compartilham Evolution
      const resp = await base44.functions.invoke('salvarConfigWhatsApp', {
        empresa_id: empresaId,
        evolution_url: tempUrl,
        evolution_instance_name: tempInstance,
        evolution_api_key: tempApiKey,
        whatsapp_access_token: tempWhatsappAccessToken,
        whatsapp_phone_number_id: tempWhatsappPhoneNumberId,
        whatsapp_business_account_id: tempWhatsappBusinessAccountId,
        whatsapp_verify_token: tempWhatsappVerifyToken || 'WAZE_CRM_WEBHOOK_2024',
        whatsapp_token_tipo: tempTokenTipo || 'permanente',
        whatsapp_token_atualizado_em: new Date().toISOString(),
        whatsapp_api_preferida: tempApiPreferida || 'auto',
      });

      if (!resp.data?.success) {
        throw new Error(resp.data?.error || 'Erro ao salvar');
      }

      // Atualizar estado local com os valores salvos
      setEvolutionUrl(tempUrl);
      setInstanceName(tempInstance);
      setApiKey(tempApiKey);
      setWhatsappAccessToken(tempWhatsappAccessToken);
      setWhatsappPhoneNumberId(tempWhatsappPhoneNumberId);
      setWhatsappBusinessAccountId(tempWhatsappBusinessAccountId);
      setWhatsappVerifyToken(tempWhatsappVerifyToken || 'WAZE_CRM_WEBHOOK_2024');
      setTokenTipo(tempTokenTipo || 'permanente');
      setTokenAtualizadoEm(new Date().toISOString());
      setApiPreferida(tempApiPreferida || 'auto');

      // Atualizar objeto empresa no estado
      setEmpresa(prev => ({
        ...prev,
        evolution_url: tempUrl,
        evolution_instance_name: tempInstance,
        evolution_api_key: tempApiKey,
        whatsapp_access_token: tempWhatsappAccessToken,
        whatsapp_phone_number_id: tempWhatsappPhoneNumberId,
        whatsapp_business_account_id: tempWhatsappBusinessAccountId,
        whatsapp_token_tipo: tempTokenTipo || 'permanente',
      }));
      
      const novaUrl = gerarUrlWebhook(tempInstance);
      setWebhookUrl(novaUrl);
      
      setEditMode(false);
      toast.success('✅ Configurações salvas com sucesso! Cada empresa tem suas credenciais isoladas.');
      
      // 🔄 Ativar todos os eventos automaticamente
      try {
        const resEventos = await base44.functions.invoke('ativarTodosEventosWebhook', {});
        if (resEventos?.data?.success) {
          toast.success(`📡 ${resEventos.data.message}`);
        }
      } catch (e) {
        console.warn('⚠️ Aviso ao ativar eventos:', e.message);
        // Não falhar a configuração se os eventos não ativarem
      }
    } catch (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text, name) => {
    navigator.clipboard.writeText(text);
    setCopied(name);
    toast.success('Copiado!');
    setTimeout(() => setCopied(null), 2000);
  };

  const gerarVerifyToken = () => {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    setTempWhatsappVerifyToken(token);
    return token;
  };

  const WEBHOOK_URL_OFICIAL = 'https://app--waze-crm.base44.app/api/apps/6950a9860c8af0e2ff10fc9e/functions/webhookMetaPublico';
  const VERIFY_TOKEN_FIXO = 'WAZE_CRM_WEBHOOK_2024';

  // QR Code: buscar/atualizar
  // Usa a chave salva na empresa, ou fallback para a chave padrão
  const getEvolutionKey = () => apiKey || tempApiKey;
  const getEvolutionHeaders = () => ({
    'apikey': getEvolutionKey(),
    'Content-Type': 'application/json',
  });
  // Remove /manager/ e trailing slash da URL da Evolution API
  const limparUrlEvolution = (url) => url?.replace(/\/manager\/?$/, '').replace(/\/manager\//, '/').replace(/\/$/, '') || '';

  const buscarQrCode = async () => {
    const url = evolutionUrl || tempUrl;
    const instance = instanceName || tempInstance;
    if (!url || !instance) {
      toast.error('Preencha a URL da API e o Nome da Instância primeiro');
      return;
    }
    setQrLoading(true);
    setQrCode(null);
    setQrStatus(null);
    try {
      // Usa backend function para evitar CORS
      const resp = await base44.functions.invoke('gerarQrCodeEvolution', {
        empresa_id: empresa?.id,
      });
      const data = resp.data;

      if (data?.state === 'open') {
        setQrStatus('connected');
        return;
      }

      if (data?.base64 || data?.code) {
        const qr = data.base64 || data.code;
        setQrCode(qr);
        setQrStatus('waiting');
        iniciarPolling();
      } else {
        toast.error(data?.erro || data?.error || 'QR Code não disponível. Tente novamente.');
      }
    } catch (e) {
      toast.error('Erro ao gerar QR Code: ' + e.message);
    } finally {
      setQrLoading(false);
    }
  };

  const verificarStatus = async () => {
    try {
      const resp = await base44.functions.invoke('gerarQrCodeEvolution', { empresa_id: empresa?.id });
      const data = resp.data;
      if (data?.state === 'open') {
        setQrStatus('connected');
        setQrCode(null);
        return true;
      }
    } catch {}
    return false;
  };

  const iniciarPolling = () => {
    if (qrPolling) clearInterval(qrPolling);
    const interval = setInterval(async () => {
      const conectado = await verificarStatus();
      if (conectado) clearInterval(interval);
    }, 4000);
    setQrPolling(interval);
  };

  const desconectarWhatsApp = async () => {
    const url = evolutionUrl || tempUrl;
    const instance = instanceName || tempInstance;
    if (!url || !instance) {
      toast.error('Instância não configurada');
      return;
    }
    if (!window.confirm('Deseja realmente desconectar o WhatsApp? Você precisará escanear o QR Code novamente para reconectar.')) return;
    setDesconectando(true);
    try {
      const resp = await base44.functions.invoke('desconectarWhatsappEvolution', {
        evolution_url: url,
        instance_name: instance,
        api_key: apiKey || tempApiKey,
      });
      if (resp.data?.success) {
        setQrStatus(null);
        setQrCode(null);
        toast.success('WhatsApp desconectado com sucesso!');
      } else {
        toast.error('Erro ao desconectar: ' + (resp.data?.error || 'Erro desconhecido'));
      }
    } catch (e) {
      toast.error('Erro ao desconectar: ' + e.message);
    } finally {
      setDesconectando(false);
    }
  };

  const criarInstancia = async () => {
    const url = evolutionUrl || tempUrl;
    const chaveApi = apiKey || tempApiKey;
    const nomeInstancia = instanceName || tempInstance || empresa?.nome?.replace(/\s+/g, '').toUpperCase();

    if (!url) { toast.error('Preencha a URL da API antes de criar a instância'); return; }
    if (!chaveApi) { toast.error('Preencha a Chave de API antes de criar a instância'); return; }
    if (!nomeInstancia) { toast.error('Preencha o Nome da Instância ou salve as configurações primeiro'); return; }

    setCriandoInstancia(true);
    try {
      const base = limparUrlEvolution(url);
      const resp = await fetch(`${base}/instance/create`, {
        method: 'POST',
        headers: { 'apikey': chaveApi, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: nomeInstancia,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      });
      const data = await resp.json();
      if (data?.instance?.instanceName || data?.hash || data?.instanceName) {
        toast.success(`✅ Instância "${nomeInstancia}" criada com sucesso! Agora gere o QR Code para conectar.`);
        // Se retornou QR Code já, exibir
        const qr = data?.qrcode?.base64 || data?.base64;
        if (qr) { setQrCode(qr); setQrStatus('waiting'); iniciarPolling(url, nomeInstancia); }
      } else if (resp.status === 409 || data?.error?.includes?.('already')) {
        toast.info('Instância já existe. Tente gerar o QR Code diretamente.');
      } else {
        toast.error('Erro ao criar instância: ' + JSON.stringify(data).slice(0, 200));
      }
    } catch (e) {
      toast.error('Erro ao criar instância: ' + e.message);
    } finally {
      setCriandoInstancia(false);
    }
  };

  const testarConexaoMeta = async () => {
    if (!whatsappPhoneNumberId || !whatsappAccessToken) {
      toast.error('Preencha o Phone Number ID e o Access Token antes de testar');
      return;
    }
    setTestandoMeta(true);
    setStatusMeta(null);
    const resp = await base44.functions.invoke('testarConexaoMetaOficial', {
      phone_number_id: whatsappPhoneNumberId,
      access_token: whatsappAccessToken,
    });
    setStatusMeta(resp.data);
    setTestandoMeta(false);
  };

  // Sincroniza o status atual do número conectado direto na API Meta
  // (telefone, qualité, status) e persiste na empresa.
  const [sincronizandoMeta, setSincronizandoMeta] = useState(false);
  const sincronizarStatusMeta = async () => {
    if (!empresa?.id) return;
    setSincronizandoMeta(true);
    try {
      const resp = await base44.functions.invoke('metaEmbeddedSignup', {
        action: 'get_status',
        empresa_id: empresa.id,
      });
      if (resp.data?.ok || resp.data?.conectado !== undefined) {
        setStatusMeta({
          success: !!resp.data.conectado,
          phone_number: resp.data.display_phone_number,
          verified_name: resp.data.verified_name,
          quality_rating: resp.data.quality_rating,
          account_mode: resp.data.phone_status,
          error: !resp.data.conectado ? (resp.data.erro || 'Sem credenciais salvas pelo login da Meta.') : undefined,
        });
        setEmpresa(prev => prev ? {
          ...prev,
          meta_display_phone_number: resp.data.display_phone_number || prev.meta_display_phone_number,
          meta_verified_name: resp.data.verified_name || prev.meta_verified_name,
          meta_quality_rating: resp.data.quality_rating || prev.meta_quality_rating,
          meta_phone_status: resp.data.phone_status || prev.meta_phone_status,
          whatsapp_conectado: resp.data.conectado,
        } : prev);
        toast.success(resp.data.conectado ? '✅ Conexão confirmada com a Meta.' : 'Status sincronizado.');
      } else {
        setStatusMeta({ success: false, error: resp.data?.error || 'Falha ao consultar a Meta' });
        toast.error('Erro ao sincronizar: ' + (resp.data?.error || 'Falha'));
      }
    } catch (e) {
      setStatusMeta({ success: false, error: e.message });
      toast.error('Erro ao sincronizar: ' + e.message);
    } finally {
      setSincronizandoMeta(false);
    }
  };

  // Limpa as credenciais da API Oficial Meta salvas nesta empresa — útil quando
  // o número exibido pertence a outro App da Meta e você quer reconectar com o
  // app atual (coexistência). Após limpar, faça o login com a Meta novamente.
  const [desconectandoMeta, setDesconectandoMeta] = useState(false);
  const desconectarMeta = async () => {
    if (!empresa?.id) {
      toast.error('Empresa não identificada');
      return;
    }
    if (!window.confirm('Isso vai apagar o Access Token, Phone Number ID e WABA ID salvos desta empresa (API Oficial Meta). O número conectado em outro App da Meta deixará de aparecer aqui. Deseja continuar?')) return;
    setDesconectandoMeta(true);
    try {
      const resp = await base44.functions.invoke('metaEmbeddedSignup', {
        action: 'desconectar',
        empresa_id: empresa.id,
      });
      if (resp.data?.ok) {
        setStatusMeta(null);
        setWhatsappAccessToken('');
        setWhatsappPhoneNumberId('');
        setWhatsappBusinessAccountId('');
        setEmpresa(prev => prev ? {
          ...prev,
          whatsapp_access_token: '',
          whatsapp_phone_number_id: '',
          whatsapp_business_account_id: '',
          whatsapp_conectado: false,
          meta_display_phone_number: '',
          meta_verified_name: '',
        } : prev);
        toast.success('✅ Credenciais da API Oficial Meta removidas. Agora faça o login com o App atual da Meta.');
      } else {
        toast.error('Erro: ' + (resp.data?.error || 'Falha ao desconectar'));
      }
    } catch (e) {
      toast.error('Erro ao desconectar: ' + e.message);
    } finally {
      setDesconectandoMeta(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuração WhatsApp"
        subtitle={empresa ? `Integração com Evolution API — ${empresa.nome}` : "Carregando..."}
      />

      <div className="grid grid-cols-1 gap-6">

        {/* Status da Conexão */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <CardTitle>Status da Conexão</CardTitle>
            </div>
            <CardDescription>Configurações ativas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm"><strong>Empresa:</strong> {empresa?.nome || '—'}</p>
              <p className="text-sm"><strong>Instância:</strong> {instanceName || <span className="text-red-500">Não configurada</span>}</p>
              <p className="text-sm"><strong>Status:</strong> {instanceName ? <span className="text-green-600 font-semibold">Configurado</span> : <span className="text-red-500 font-semibold">Não configurado</span>}</p>
            </div>
          </CardContent>
        </Card>

        {/* Webhook Meta - SEMPRE VISÍVEL */}
        <Card className="border-2 border-purple-500 bg-gradient-to-br from-purple-50 to-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-900">
              🔗 Webhook da Meta (API Oficial)
            </CardTitle>
            <CardDescription className="text-purple-700 font-medium">
              Cole estes valores em Meta for Developers → Seu App → Configuration → Webhooks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-2 block font-semibold text-purple-900">📲 Callback URL</Label>
              <div className="flex gap-2">
                <Input
                  value={WEBHOOK_URL_OFICIAL}
                  readOnly
                  className="bg-white border-2 border-purple-400 font-mono text-sm text-purple-700"
                />
                <Button
                  variant="default"
                  className="bg-purple-600 hover:bg-purple-700 whitespace-nowrap"
                  onClick={() => { copyToClipboard(WEBHOOK_URL_OFICIAL, 'webhook-oficial'); toast.success('✅ Callback URL copiada!'); }}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar
                </Button>
              </div>
            </div>
            <div>
              <Label className="mb-2 block font-semibold text-purple-900">🔐 Verify Token</Label>
              <div className="flex gap-2">
                <Input
                  value={VERIFY_TOKEN_FIXO}
                  readOnly
                  className="bg-white border-2 border-purple-400 font-mono text-base font-bold text-purple-900"
                />
                <Button
                  variant="default"
                  className="bg-purple-600 hover:bg-purple-700 whitespace-nowrap flex-shrink-0"
                  onClick={() => { copyToClipboard(VERIFY_TOKEN_FIXO, 'verify'); toast.success('✅ Token copiado! Cole na Meta'); }}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Seletor de API Preferida */}
        <Card className="border-2 border-blue-400 bg-gradient-to-br from-blue-50 to-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              🔀 Qual API usar para enviar e receber mensagens?
            </CardTitle>
            <CardDescription className="text-blue-700">
              Escolha qual API o sistema deve usar. Você pode ter ambas configuradas e trocar quando quiser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  value: 'evolution',
                  label: '🟣 Evolution API',
                  desc: 'API não oficial — conecta pelo QR Code. Mais recursos (grupos, fotos, histórico).',
                  color: 'purple',
                },
                {
                  value: 'meta_oficial',
                  label: '🟢 API Oficial Meta',
                  desc: 'API oficial do WhatsApp Business — exige aprovação da Meta. Mais estável e segura.',
                  color: 'green',
                },
                {
                  value: 'auto',
                  label: '⚡ Automático',
                  desc: 'O sistema detecta: usa Evolution se configurada, caso contrário usa Meta Oficial.',
                  color: 'slate',
                },
              ].map(opt => {
                const isActive = (editMode ? tempApiPreferida : apiPreferida) === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={!editMode}
                    onClick={() => editMode && setTempApiPreferida(opt.value)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      isActive
                        ? opt.color === 'purple' ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-300'
                          : opt.color === 'green' ? 'border-green-500 bg-green-50 ring-2 ring-green-300'
                          : 'border-blue-500 bg-blue-50 ring-2 ring-blue-300'
                        : 'border-slate-200 bg-white opacity-70'
                    } ${editMode ? 'cursor-pointer hover:opacity-100' : 'cursor-default'}`}
                  >
                    <p className="font-bold text-sm mb-1">{opt.label}</p>
                    <p className="text-xs text-slate-600">{opt.desc}</p>
                    {isActive && <p className="text-xs font-bold mt-2 text-blue-700">✅ SELECIONADA</p>}
                  </button>
                );
              })}
            </div>
            {!editMode && (
              <p className="text-xs text-slate-500 mt-3 text-center">Clique em "Editar" nas credenciais abaixo para alterar a API preferida.</p>
            )}
          </CardContent>
        </Card>

        {/* Abas de APIs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <span>⚙️</span> Credenciais WhatsApp
              </CardTitle>
              <Button
                variant={editMode ? 'outline' : 'default'}
                size="sm"
                onClick={handleEditMode}
                disabled={saving}
              >
                {editMode ? 'Cancelar' : 'Editar'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="oficial" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="oficial">🟢 Meta Oficial</TabsTrigger>
                <TabsTrigger value="conexoes">🔗 Conexões</TabsTrigger>
              </TabsList>

              {/* TAB API OFICIAL */}
              <TabsContent value="oficial" className="space-y-4 mt-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-green-900 font-semibold mb-2">🟢 API Oficial do WhatsApp (Meta)</p>
                  <p className="text-sm text-green-800">Faça login com sua conta Meta Business — as credenciais abaixo são preenchidas automaticamente, sem precisar copiar nada manualmente.</p>
                </div>

                <LoginMetaOficialButton empresaId={empresa?.id} onSuccess={carregarDados} />

                {whatsappPhoneNumberId && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    Credenciais conectadas e salvas com segurança.
                  </div>
                )}

                </TabsContent>

                {/* TAB CONEXÕES */}
                <TabsContent value="conexoes" className="space-y-4 mt-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-blue-900 font-semibold mb-2">🔗 Gerenciador de Conexões WhatsApp</p>
                    <p className="text-sm text-blue-800">
                      Configure múltiplas conexões WhatsApp (D-API, Evolution, Meta Oficial) e gerencie suas instâncias.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={() => window.location.href = '/ConfiguracaoWhatsAppConexoes'}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Gerenciar Conexões
                    </Button>
                  </div>

                  <Card className="border-2 border-slate-200">
                    <CardHeader>
                      <CardTitle className="text-sm">Status das Conexões</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-slate-600">
                        Acesse a página de gerenciamento para:
                      </p>
                      <ul className="text-sm text-slate-700 mt-2 space-y-1 list-disc list-inside">
                        <li>Criar nova conexão D-API</li>
                        <li>Testar conexão com health check</li>
                        <li>Gerar QR Code</li>
                        <li>Enviar mensagens de teste</li>
                        <li>Visualizar logs de conexão</li>
                      </ul>
                    </CardContent>
                  </Card>
                </TabsContent>
            </Tabs>

            {editMode && (
              <div className="flex gap-2 justify-end pt-4 border-t mt-4">
                <Button
                  variant="outline"
                  onClick={handleEditMode}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instâncias WhatsApp — só aparece quando há credenciais salvas */}
        <InstanciasWhatsAppMeta
          empresa={empresa}
          onSync={sincronizarStatusMeta}
          syncLoading={sincronizandoMeta}
          onDesconectar={desconectarMeta}
        />

        {/* Status da API Oficial Meta */}
        <Card className={`border-2 ${statusMeta?.success ? 'border-green-500 bg-gradient-to-br from-green-50 to-white' : statusMeta?.error ? 'border-red-400 bg-gradient-to-br from-red-50 to-white' : 'border-slate-200'}`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Wifi className="w-5 h-5" />
                Status da API Oficial (Meta)
              </CardTitle>
              {/* Botões removidos a pedido — nenhuma ação manual neste card. */}
            </div>
            <CardDescription>
              Verifica se as credenciais da API Oficial estão corretas e funcionando
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(whatsappPhoneNumberId && whatsappAccessToken) ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-green-100 rounded-lg border border-green-300">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-bold text-green-800">✅ Conexão ativa — credenciais salvas pelo login da Meta</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-white rounded-lg border border-green-200">
                    <p className="text-xs text-slate-500 mb-1">Número de Telefone</p>
                    <p className="font-bold text-green-700">{empresa?.meta_display_phone_number || '—'}</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-green-200">
                    <p className="text-xs text-slate-500 mb-1">Nome Verificado</p>
                    <p className="font-bold text-green-700">{empresa?.meta_verified_name || '—'}</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-green-200">
                    <p className="text-xs text-slate-500 mb-1">Qualidade</p>
                    <p className="font-bold text-green-700">{empresa?.meta_quality_rating || '—'}</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-green-200">
                    <p className="text-xs text-slate-500 mb-1">Status do número</p>
                    <p className="font-bold text-green-700">{empresa?.meta_phone_status || '—'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <Wifi className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-600">Sem credenciais salvas pelo login da Meta</p>
                  <p className="text-xs text-slate-500">
                    Faça o login com a Meta acima para conectar automaticamente.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Eventos Suportados */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>📨</span> Eventos Suportados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">Mensagens de texto</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">Mensagens com imagem</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">Mensagens com áudio</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">Mensagens com vídeo</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">Mensagens com PDF</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">Confirmação de entrega</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Próximos Passos */}
        <Card className="bg-gradient-to-br from-purple-50 to-white border-l-4 border-l-purple-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>✨</span> Próximos Passos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-700">
              Após configurar o webhook no Evolution API, você poderá:
            </p>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold">1.</span>
                <span>Receber mensagens de clientes em tempo real no módulo Bate-papo</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold">2.</span>
                <span>Responder clientes via WhatsApp diretamente da plataforma</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold">3.</span>
                <span>Compartilhar arquivos (PDF, imagens, vídeos, áudios)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold">4.</span>
                <span>Manter histórico completo de conversas</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}