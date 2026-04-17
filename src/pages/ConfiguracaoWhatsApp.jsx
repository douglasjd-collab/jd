import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, Copy, AlertCircle, Loader2, MessageSquare, XCircle, Wifi } from 'lucide-react';
import { toast } from 'sonner';
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

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);

      // Buscar empresa do usuário logado
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      const empId = colabs?.[0]?.empresa_id || me.empresa_id;

      if (empId) {
        const emps = await base44.entities.Empresa.filter({ id: empId });
        if (emps && emps.length > 0) {
          carregarEmpresa(emps[0]);
        }
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
    setEvolutionUrl(empresaData.evolution_url || '');
    setInstanceName(empresaData.evolution_instance_name || '');
    setApiKey(empresaData.evolution_api_key || '');
    setWhatsappAccessToken(empresaData.whatsapp_access_token || '');
    setWhatsappPhoneNumberId(empresaData.whatsapp_phone_number_id || '');
    setWhatsappBusinessAccountId(empresaData.whatsapp_business_account_id || '');
    setWhatsappVerifyToken(empresaData.whatsapp_verify_token || '');
    setApiPreferida(empresaData.whatsapp_api_preferida || 'auto');
    
    // Gerar URL webhook com nome da instância
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

  const BASE_WEBHOOK_URL = 'https://app--waze-crm.base44.app/api/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp';

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

      // Salvar via função backend para garantir que passa pela regra de segurança
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
        whatsapp_access_token: tempWhatsappAccessToken,
        whatsapp_phone_number_id: tempWhatsappPhoneNumberId,
        whatsapp_business_account_id: tempWhatsappBusinessAccountId,
        whatsapp_token_tipo: tempTokenTipo || 'permanente',
      }));
      
      const novaUrl = gerarUrlWebhook(tempInstance);
      setWebhookUrl(novaUrl);
      
      setEditMode(false);
      toast.success('✅ Configurações salvas com sucesso no banco de dados!');
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
            <Tabs defaultValue="evolution" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="evolution">🟣 API Evolution</TabsTrigger>
                <TabsTrigger value="oficial">🟢 API Oficial</TabsTrigger>
              </TabsList>

              {/* TAB EVOLUTION */}
              <TabsContent value="evolution" className="space-y-4 mt-4">

            <div>
              <Label className="mb-2 block">URL da API</Label>
              <div className="flex gap-2">
                <Input 
                  value={editMode ? tempUrl : evolutionUrl}
                  onChange={(e) => editMode && setTempUrl(e.target.value)}
                  readOnly={!editMode}
                  placeholder="https://sua-evolution-api.com/"
                  className={editMode ? '' : 'bg-slate-50'}
                />
                {!editMode && evolutionUrl && (
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(evolutionUrl, 'url')}>
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Nome da Instância</Label>
              <div className="flex gap-2">
                <Input 
                  value={editMode ? tempInstance : instanceName}
                  onChange={(e) => editMode && setTempInstance(e.target.value)}
                  readOnly={!editMode}
                  placeholder="Nome da instância no Evolution API"
                  className={editMode ? '' : 'bg-slate-50'}
                />
                {!editMode && instanceName && (
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(instanceName, 'instance')}>
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Chave de API (API Key)</Label>
              <div className="flex gap-2">
                <Input 
                  value={editMode ? tempApiKey : apiKey}
                  onChange={(e) => editMode && setTempApiKey(e.target.value)}
                  type="text"
                  readOnly={!editMode}
                  placeholder="Chave de segurança da instância"
                  className={editMode ? '' : 'bg-slate-50 font-mono'}
                />
                {!editMode && apiKey && (
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(apiKey, 'key')}>
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

              </TabsContent>

              {/* TAB API OFICIAL */}
              <TabsContent value="oficial" className="space-y-4 mt-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-green-900 font-semibold mb-2">🟢 API Oficial do WhatsApp (Meta)</p>
                  <p className="text-sm text-green-800">Configure suas credenciais oficiais da API WhatsApp Business</p>
                </div>

                {[
                  { label: 'Access Token', key: 'token', value: whatsappAccessToken, tempValue: tempWhatsappAccessToken, setter: setTempWhatsappAccessToken, placeholder: 'seu_access_token_aqui', hint: 'Token de acesso do seu app Meta/WhatsApp' },
                  { label: 'Phone Number ID', key: 'phone', value: whatsappPhoneNumberId, tempValue: tempWhatsappPhoneNumberId, setter: setTempWhatsappPhoneNumberId, placeholder: 'seu_phone_number_id_aqui', hint: 'ID do número de telefone no WhatsApp Business' },
                  { label: 'Business Account ID', key: 'account', value: whatsappBusinessAccountId, tempValue: tempWhatsappBusinessAccountId, setter: setTempWhatsappBusinessAccountId, placeholder: 'seu_business_account_id_aqui', hint: 'ID da sua conta comercial no WhatsApp' },
                  { label: 'Webhook Verification Token', key: 'verify', value: whatsappVerifyToken, tempValue: tempWhatsappVerifyToken, setter: setTempWhatsappVerifyToken, placeholder: 'seu_verification_token_aqui', hint: 'Token para verificação do webhook' },
                ].map(({ label, key, value, tempValue, setter, placeholder, hint }) => (
                  <div key={key}>
                    <Label className="mb-2 block">{label}</Label>
                    {editMode ? (
                      <div className="flex gap-2">
                        <Input
                          value={tempValue}
                          onChange={(e) => setter(e.target.value)}
                          placeholder={placeholder}
                        />
                        {key === 'verify' && (
                          <Button variant="outline" onClick={() => { const t = gerarVerifyToken(); toast.success('Token gerado!'); }} title="Gerar token aleatório">
                            🔄
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {value ? (
                          <>
                            <Input value={value} readOnly className="bg-slate-50 font-mono text-sm" />
                            <Button variant="outline" size="icon" onClick={() => copyToClipboard(value, key)}>
                              <Copy className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <div className="flex-1 px-3 py-2 border rounded-md bg-amber-50 border-amber-200 text-sm text-amber-700 italic">
                            Não configurado — clique em "Editar" para preencher
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-slate-500 mt-1">{hint}</p>
                  </div>
                ))}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                   <p className="text-sm text-blue-900 font-semibold mb-2">📖 Onde encontrar essas credenciais?</p>
                   <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                     <li>Acesse <strong>developers.facebook.com</strong></li>
                     <li>Vá em seu App do WhatsApp Business</li>
                     <li>Em <strong>Settings → API Setup</strong> encontre o Access Token</li>
                     <li>Em <strong>Phone Numbers</strong> encontre o Phone Number ID</li>
                     <li>Em <strong>Settings → Business Accounts</strong> encontre o Account ID</li>
                   </ol>
                 </div>

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

        {/* Status da API Oficial Meta */}
        <Card className={`border-2 ${statusMeta?.success ? 'border-green-500 bg-gradient-to-br from-green-50 to-white' : statusMeta?.error ? 'border-red-400 bg-gradient-to-br from-red-50 to-white' : 'border-slate-200'}`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Wifi className="w-5 h-5" />
                Status da API Oficial (Meta)
              </CardTitle>
              <Button
                onClick={testarConexaoMeta}
                disabled={testandoMeta || !whatsappPhoneNumberId || !whatsappAccessToken}
                size="sm"
                variant={statusMeta?.success ? 'outline' : 'default'}
              >
                {testandoMeta ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testando...</> : '🔌 Testar Conexão'}
              </Button>
            </div>
            <CardDescription>
              Verifica se as credenciais da API Oficial estão corretas e funcionando
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!statusMeta && !testandoMeta && (
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <Wifi className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-600">Conexão não testada</p>
                  <p className="text-xs text-slate-500">
                    {(!whatsappPhoneNumberId || !whatsappAccessToken)
                      ? 'Preencha as credenciais na aba "API Oficial" e clique em Testar Conexão'
                      : 'Clique em "Testar Conexão" para verificar se as credenciais estão corretas'}
                  </p>
                </div>
              </div>
            )}
            {testandoMeta && (
              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                <p className="text-sm text-blue-700">Conectando à API da Meta...</p>
              </div>
            )}
            {statusMeta?.success && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-green-100 rounded-lg border border-green-300">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-bold text-green-800">✅ Conexão OK — API Oficial funcionando!</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-white rounded-lg border border-green-200">
                    <p className="text-xs text-slate-500 mb-1">Número de Telefone</p>
                    <p className="font-bold text-green-700">{statusMeta.phone_number}</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-green-200">
                    <p className="text-xs text-slate-500 mb-1">Nome Verificado</p>
                    <p className="font-bold text-green-700">{statusMeta.verified_name}</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-green-200">
                    <p className="text-xs text-slate-500 mb-1">Qualidade</p>
                    <p className="font-bold text-green-700">{statusMeta.quality_rating || '—'}</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-green-200">
                    <p className="text-xs text-slate-500 mb-1">Modo da Conta</p>
                    <p className="font-bold text-green-700">{statusMeta.account_mode || '—'}</p>
                  </div>
                </div>
              </div>
            )}
            {statusMeta?.error && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-red-100 rounded-lg border border-red-300">
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-red-800">❌ Erro na conexão</p>
                    <p className="text-xs text-red-700 mt-1">{statusMeta.error}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 px-1">Verifique se o Access Token e o Phone Number ID estão corretos na aba "API Oficial".</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Configuração do Webhook */}
        <Card className="border-l-4 border-l-green-500 bg-gradient-to-br from-green-50 to-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>🔗</span> URL do Webhook (OBRIGATÓRIA)
            </CardTitle>
            <CardDescription className="text-green-700 font-semibold">
              ⚠️ Esta é a URL CORRETA que deve estar configurada na Evolution API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            
            <div className="bg-amber-100 border-2 border-amber-400 rounded-lg p-4">
              <div className="flex gap-2 items-start mb-3">
                <AlertCircle className="w-6 h-6 text-amber-700 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-900">⚠️ ATENÇÃO: URL do Deployment Atual</p>
                  <p className="text-sm text-amber-800 mt-2">
                    A URL abaixo é gerada automaticamente pelo seu deployment atual. 
                    <strong className="block mt-1">Se você configurou uma URL diferente na Evolution API, as mensagens NÃO chegarão.</strong>
                  </p>
                  <ol className="text-sm text-amber-900 mt-3 space-y-1 list-decimal list-inside font-semibold">
                    <li>Copie a URL abaixo (clique no botão copiar)</li>
                    <li>Vá na Evolution API → Configuração WhatsApp → Webhook URL</li>
                    <li>Cole esta URL EXATA no campo de webhook</li>
                    <li>Ou clique no botão "Configurar Automaticamente" abaixo</li>
                  </ol>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* URL Base (fixa) */}
              <div>
                <Label className="mb-2 block text-sm font-semibold text-slate-700">
                  🔒 URL Base (fixa — nunca muda):
                </Label>
                <div className="flex gap-2">
                  <Input
                    value="https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp"
                    readOnly
                    className="bg-slate-50 font-mono text-xs text-slate-600"
                  />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard('https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp', 'base')}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* URL da Subconta (com nome da empresa) */}
              <div>
                <Label className="mb-2 block text-base font-bold text-green-900">
                  📋 URL desta Subconta — CONFIGURE NA EVOLUTION API:
                </Label>
                {loading ? (
                  <div className="flex items-center gap-2 text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Carregando URL...</span>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 mb-2">
                      <Input
                        value={webhookUrl}
                        readOnly
                        className="bg-white border-2 border-green-500 font-mono text-sm font-bold text-green-700"
                      />
                      <Button
                        variant="default"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => {
                          copyToClipboard(webhookUrl, 'webhook');
                          toast.success('✅ URL copiada! Cole na Evolution API');
                        }}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar
                      </Button>
                    </div>
                    <div className="p-3 bg-green-100 border border-green-300 rounded-lg">
                      <p className="text-xs text-green-900 font-semibold">
                        ✅ URL gerada com o nome da instância: <code className="bg-white px-2 py-1 rounded">={instanceName || 'NOME_INSTANCIA'}</code>
                      </p>
                      <p className="text-xs text-green-800 mt-1">
                        Cada subconta tem sua própria URL com o nome da instância, permitindo ao webhook identificar qual empresa recebeu a mensagem.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <p className="text-xs text-center text-slate-500 pt-4">
              Copie a URL acima e configure-a manualmente na Evolution API
            </p>
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