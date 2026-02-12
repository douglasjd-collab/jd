import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Copy, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
  const [saving, setSaving] = useState(false);
  const [atualizandoWebhook, setAtualizandoWebhook] = useState(false);

  useEffect(() => {
    loadConfig();
    obterUrlCorretaAuto();
  }, []);

  const obterUrlCorretaAuto = async () => {
    try {
      const response = await base44.functions.invoke('getWebhookUrlCorreto');
      const urlCorreta = response.data.webhook_url;
      console.log('✅ URL Correta do Deployment:', urlCorreta);
      setWebhookUrl(urlCorreta);
    } catch (error) {
      console.error('Erro ao obter URL:', error);
    }
  };

  const loadConfig = async () => {
    try {
      const response = await base44.functions.invoke('getWebhookUrl');
      setWebhookUrl(response.data.webhookUrl);
      setEvolutionUrl(response.data.evolutionUrl);
      setInstanceName(response.data.instanceName);
      setApiKey(response.data.apiKey);
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      setWebhookUrl('');
      setEvolutionUrl('');
      setInstanceName('');
      setApiKey('');
    } finally {
      setLoading(false);
    }
  };

  const handleEditMode = () => {
    if (!editMode) {
      setTempUrl(evolutionUrl);
      setTempInstance(instanceName);
      setTempApiKey(apiKey);
    }
    setEditMode(!editMode);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke('atualizarConfigWhatsApp', {
        evolutionUrl: tempUrl,
        instanceName: tempInstance,
        apiKey: tempApiKey
      });
      setEvolutionUrl(tempUrl);
      setInstanceName(tempInstance);
      setApiKey(tempApiKey);
      setEditMode(false);
      toast.success('Configurações salvas com sucesso!');
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

  const atualizarWebhookEvolution = async () => {
    setAtualizandoWebhook(true);
    try {
      // Buscar credenciais reais e URL correta através da função backend
      const configResponse = await base44.functions.invoke('configurarWebhookEvolution');
      
      if (configResponse.data.success) {
        setWebhookUrl(configResponse.data.webhook_url);
        toast.success('✅ Webhook configurado com sucesso na Evolution API!');
      } else {
        throw new Error(configResponse.data.error || 'Erro ao configurar webhook');
      }
    } catch (error) {
      console.error('Erro ao atualizar webhook:', error);
      toast.error('❌ Erro: ' + error.message);
    } finally {
      setAtualizandoWebhook(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuração WhatsApp"
        subtitle="Integração com Evolution API"
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
              <p className="text-sm"><strong>Instância:</strong> {instanceName}</p>
              <p className="text-sm"><strong>Status:</strong> <span className="text-green-600 font-semibold">Conectado</span></p>
            </div>
          </CardContent>
        </Card>

        {/* Informações da Evolution API */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <span>⚙️</span> Dados da Evolution API
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
          <CardContent className="space-y-4">
            
            <div>
              <Label className="mb-2 block">URL da API</Label>
              <div className="flex gap-2">
                <Input 
                  value={editMode ? tempUrl : evolutionUrl}
                  onChange={(e) => editMode && setTempUrl(e.target.value)}
                  readOnly={!editMode}
                  className={editMode ? '' : 'bg-slate-50'}
                />
                {!editMode && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(evolutionUrl, 'url')}
                  >
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
                  className={editMode ? '' : 'bg-slate-50'}
                />
                {!editMode && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(instanceName, 'instance')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Chave de API</Label>
              <div className="flex gap-2">
                <Input 
                  value={editMode ? tempApiKey : apiKey}
                  onChange={(e) => editMode && setTempApiKey(e.target.value)}
                  type="text"
                  readOnly={!editMode}
                  className={editMode ? '' : 'bg-slate-50 font-mono'}
                />
                {!editMode && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(apiKey, 'key')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {editMode && (
              <div className="flex gap-2 justify-end pt-4 border-t">
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

            <div>
              <Label className="mb-3 block text-base font-bold text-green-900">
                📋 URL do Webhook - COPIE E CONFIGURE NA EVOLUTION:
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
                      ✅ Esta URL inclui automaticamente: <code className="bg-white px-2 py-1 rounded">?instance=TESTEWAZE</code>
                    </p>
                    <p className="text-xs text-green-800 mt-1">
                      Mensagens enviadas e recebidas serão processadas por esta URL
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="pt-4 border-t">
              <Button 
                onClick={atualizarWebhookEvolution}
                disabled={atualizandoWebhook || !evolutionUrl || !instanceName || !apiKey}
                className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
              >
                {atualizandoWebhook ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Configurando Webhook...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Configurar Webhook Automaticamente
                  </>
                )}
              </Button>
              <p className="text-xs text-center text-slate-500 mt-2">
                Clique para configurar o webhook automaticamente na Evolution API
              </p>
            </div>
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