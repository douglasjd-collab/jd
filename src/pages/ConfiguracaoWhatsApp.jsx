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
  const [loading, setLoading] = useState(true);

  const evolutionUrl = Deno.env.get?.('EVOLUTION_API_URL') || 'https://evolutionapi-evolution-api.dsnnn7.easypanel.host/';
  const instanceName = Deno.env.get?.('EVOLUTION_INSTANCE_NAME') || 'default';
  const apiKey = Deno.env.get?.('EVOLUTION_API_KEY') || '***';

  useEffect(() => {
    loadWebhookUrl();
  }, []);

  const loadWebhookUrl = async () => {
    try {
      const response = await base44.functions.invoke('getWebhookUrl');
      setWebhookUrl(response.data.webhookUrl);
    } catch (error) {
      console.error('Erro ao carregar webhook URL:', error);
      // Fallback para URL padrão
      setWebhookUrl(`https://${window.location.hostname}/functions/receberWebhookWhatsApp?instance=${instanceName}`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, name) => {
    navigator.clipboard.writeText(text);
    setCopied(name);
    toast.success('Copiado!');
    setTimeout(() => setCopied(null), 2000);
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
            <CardTitle className="flex items-center gap-2">
              <span>⚙️</span> Dados da Evolution API
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            
            <div>
              <Label className="mb-2 block">URL da API</Label>
              <div className="flex gap-2">
                <Input 
                  value={evolutionUrl}
                  readOnly 
                  className="bg-slate-50"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(evolutionUrl, 'url')}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Nome da Instância</Label>
              <div className="flex gap-2">
                <Input 
                  value={instanceName}
                  readOnly 
                  className="bg-slate-50"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(instanceName, 'instance')}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Chave de API</Label>
              <div className="flex gap-2">
                <Input 
                  value={apiKey}
                  type="password"
                  readOnly 
                  className="bg-slate-50"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(apiKey, 'key')}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Configuração do Webhook */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>🔗</span> Webhook URL
            </CardTitle>
            <CardDescription>
              Configure no painel do Evolution API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex gap-2 items-start mb-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-900">Instruções de Configuração</p>
                  <ol className="text-sm text-blue-800 mt-2 space-y-1 list-decimal list-inside">
                    <li>Acesse o painel do Evolution API</li>
                    <li>Vá para Configurações → Webhooks</li>
                    <li>Cole a URL abaixo no campo de webhook</li>
                    <li>Salve e teste a conexão</li>
                  </ol>
                </div>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">URL do Webhook</Label>
              {loading ? (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Carregando URL...</span>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Input 
                      value={webhookUrl}
                      readOnly 
                      className="bg-slate-50 font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(webhookUrl, 'webhook')}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Este URL receberá as mensagens do WhatsApp em tempo real
                  </p>
                </>
              )}
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