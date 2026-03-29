import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, Copy, AlertCircle, Loader2, MessageSquare } from 'lucide-react';
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
  const [saving, setSaving] = useState(false);
  const [atualizandoWebhook, setAtualizandoWebhook] = useState(false);
  const [user, setUser] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState(null);
  const [apiTab, setApiTab] = useState('evolution');

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);

      if (me?.role === 'super_admin' || me?.perfil === 'super_admin') {
        // Super admin: carregar TODAS as empresas para poder configurar cada uma
        const todasEmpresas = await base44.entities.Empresa.filter({}, '-created_date', 50);
        setEmpresas(todasEmpresas || []);
        
        // Selecionar a primeira empresa por padrão
        if (todasEmpresas && todasEmpresas.length > 0) {
          const primeira = todasEmpresas[0];
          setSelectedEmpresaId(primeira.id);
          carregarEmpresa(primeira);
        }
      } else if (me?.empresa_id) {
        // Usuário normal - carregar apenas sua empresa
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
        const empId = colabs?.[0]?.empresa_id || me.empresa_id;
        const emp = await base44.entities.Empresa.filter({ id: empId });
        if (emp && emp.length > 0) {
          setSelectedEmpresaId(emp[0].id);
          carregarEmpresa(emp[0]);
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
    }
    setEditMode(!editMode);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const empresaId = selectedEmpresaId || empresa?.id;

      if (!empresaId) {
        toast.error('Erro: Empresa não definida');
        return;
      }

      // Garantir que o token não fica vazio
      const tokenParaSalvar = tempWhatsappVerifyToken || gerarVerifyTokenPadrao();
      
      await base44.entities.Empresa.update(empresaId, {
        evolution_url: tempUrl,
        evolution_instance_name: tempInstance,
        evolution_api_key: tempApiKey,
        whatsapp_access_token: tempWhatsappAccessToken,
        whatsapp_phone_number_id: tempWhatsappPhoneNumberId,
        whatsapp_business_account_id: tempWhatsappBusinessAccountId,
        whatsapp_verify_token: tokenParaSalvar,
      });

      setEvolutionUrl(tempUrl);
      setInstanceName(tempInstance);
      setApiKey(tempApiKey);
      setWhatsappAccessToken(tempWhatsappAccessToken);
      setWhatsappPhoneNumberId(tempWhatsappPhoneNumberId);
      setWhatsappBusinessAccountId(tempWhatsappBusinessAccountId);
      setWhatsappVerifyToken(tokenParaSalvar);
      
      // Gerar novo webhook URL com o nome da instância
      const novaUrl = gerarUrlWebhook(tempInstance);
      setWebhookUrl(novaUrl);
      
      setEditMode(false);
      toast.success('✅ Configurações WhatsApp salvas!\n\n🔐 Token de Verificação: ' + tokenParaSalvar.slice(0, 8) + '...\n\nCole na Meta em Configuration → Webhooks → Verify Token');
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

  const handleMudarEmpresa = (empId) => {
    setSelectedEmpresaId(empId);
    const emp = empresas.find(e => e.id === empId);
    if (emp) carregarEmpresa(emp);
  };

  const isSuperAdmin = user?.role === 'super_admin' || user?.perfil === 'super_admin';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuração WhatsApp"
        subtitle={empresa ? `Integração com Evolution API — ${empresa.nome}` : "Carregando..."}
      />

      <div className="grid grid-cols-1 gap-6">

        {/* Seletor de Empresa — apenas para super admin */}
        {isSuperAdmin && empresas.length > 0 && (
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>🏢</span> Selecionar Empresa / Subconta
              </CardTitle>
              <CardDescription>
                Como super admin, você pode configurar o WhatsApp de cada empresa separadamente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedEmpresaId || ''} onValueChange={handleMudarEmpresa}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma empresa..." />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome} {e.evolution_instance_name ? `— ${e.evolution_instance_name}` : '— sem instância'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

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
                <code className="flex-1 bg-white px-4 py-2 rounded-md font-mono text-base font-bold text-purple-900 break-all select-all border-2 border-purple-400 flex items-center">
                  {VERIFY_TOKEN_FIXO}
                </code>
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