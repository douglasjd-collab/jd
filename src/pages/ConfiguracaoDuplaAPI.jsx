import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function ConfiguracaoDuplaAPI() {
  const [telefone, setTelefone] = useState('558791426333');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [copiedText, setCopiedText] = useState(null);

  const webhookUrl = `${window.location.origin}/functions/receberWebhookDuplaAPI`;

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleSincronizar = async (api) => {
    if (!telefone) {
      toast.error('Preencha o telefone');
      return;
    }

    setLoading(true);
    try {
      const response = await base44.functions.invoke('sincronizarDuplaAPI', {
        telefone,
        api,
      });

      setResultado(response.data);
      toast.success(`✅ Sincronização ${api} concluída!`);
    } catch (error) {
      toast.error('Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">🔄 Dual API WhatsApp</h1>
          <p className="text-gray-600">Integração com API Oficial + Evolution simultâneas</p>
        </div>

        {/* Webhook URL */}
        <Card className="border-blue-300 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-lg">🔗 Webhook Único para Ambas APIs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-white p-4 rounded border border-blue-200 font-mono text-sm break-all">
              {webhookUrl}
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <Button
                onClick={() => handleCopy(webhookUrl, 'webhook')}
                variant="outline"
                className="w-full"
              >
                {copiedText === 'webhook' ? (
                  <><Check className="w-4 h-4 mr-2" /> Copiado!</>
                ) : (
                  <><Copy className="w-4 h-4 mr-2" /> Copiar URL</>
                )}
              </Button>
              <div className="text-sm text-blue-700 flex items-center">
                ✅ Detecta automaticamente qual API enviou
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Abas de Configuração */}
        <Tabs defaultValue="oficial" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="oficial">🟢 API Oficial (Oficial)</TabsTrigger>
            <TabsTrigger value="evolution">🟣 API Evolution</TabsTrigger>
          </TabsList>

          {/* API Oficial */}
          <TabsContent value="oficial" className="space-y-4">
            <Card>
              <CardHeader className="bg-green-50 border-b">
                <CardTitle className="text-lg">📱 WhatsApp Business API (Oficial)</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                  <h3 className="font-bold text-green-900">Passos para Configurar:</h3>
                  <ol className="text-sm text-green-800 space-y-2 list-decimal list-inside">
                    <li>Acesse <strong>Meta for Developers</strong></li>
                    <li>Configure seu App do WhatsApp Business</li>
                    <li>Vá em <strong>Configurações → Webhooks</strong></li>
                    <li>Cole a URL do webhook acima</li>
                    <li>Selecione os eventos: <code className="bg-white px-2 py-1 rounded">messages, message_status</code></li>
                    <li>Defina seu <strong>Verification Token</strong></li>
                    <li>Salve e ative</li>
                  </ol>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-900">
                    <strong>💡 Nota:</strong> A API Oficial envia mensagens via webhooks em tempo real. Não é necessário sincronizar manualmente.
                  </p>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-900">
                    <strong>⚠️ Histórico:</strong> Para recuperar histórico anterior, você precisará usar a API de histórico do WhatsApp Business (requer aprovação).
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Evolution */}
          <TabsContent value="evolution" className="space-y-4">
            <Card>
              <CardHeader className="bg-purple-50 border-b">
                <CardTitle className="text-lg">🟣 API Evolution</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
                  <h3 className="font-bold text-purple-900">Variáveis de Ambiente Necessárias:</h3>
                  <div className="space-y-2 text-sm text-purple-800 font-mono">
                    <div className="bg-white p-2 rounded border">EVOLUTION_API_URL</div>
                    <div className="bg-white p-2 rounded border">EVOLUTION_API_KEY</div>
                    <div className="bg-white p-2 rounded border">EVOLUTION_INSTANCE_NAME</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-2">Telefone para Sincronizar</label>
                    <Input
                      placeholder="558791426333"
                      value={telefone}
                      onChange={(e) => setTelefone(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <Button
                    onClick={() => handleSincronizar('evolution')}
                    disabled={loading}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sincronizando...
                      </>
                    ) : (
                      <>
                        🔄 Sincronizar Evolution
                      </>
                    )}
                  </Button>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-900">
                    <strong>💡 Nota:</strong> Este botão puxa mensagens do histórico da Evolution API e as sincroniza.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Resultado */}
        {resultado && (
          <Card className="border-green-300 bg-green-50">
            <CardHeader className="bg-green-100 border-b">
              <CardTitle>✅ Sincronização Concluída</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <pre className="bg-white p-4 rounded text-sm overflow-auto max-h-96 border">
                {JSON.stringify(resultado, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Diagrama */}
        <Card className="bg-white border-2 border-gray-200">
          <CardHeader>
            <CardTitle>📊 Arquitetura de Integração</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-green-300 bg-green-50 rounded p-4">
                  <p className="font-bold text-green-900 mb-2">🟢 API Oficial</p>
                  <p className="text-green-800">↓</p>
                  <p className="text-sm">Webhook em Tempo Real</p>
                </div>
                <div className="border border-purple-300 bg-purple-50 rounded p-4">
                  <p className="font-bold text-purple-900 mb-2">🟣 API Evolution</p>
                  <p className="text-purple-800">↓</p>
                  <p className="text-sm">Sincronização Manual/Automática</p>
                </div>
              </div>
              <div className="border-t-2 border-gray-300 pt-4 text-center">
                <p className="font-bold mb-2">↓ Ambas convergem para:</p>
                <p className="font-bold text-lg text-blue-600">🔗 receberWebhookDuplaAPI</p>
                <p className="text-gray-600 mt-2">Webhook único que identifica a origem</p>
              </div>
              <div className="border-t-2 border-gray-300 pt-4 text-center">
                <p className="font-bold mb-2">↓</p>
                <p className="font-bold text-lg text-orange-600">💾 Banco de Dados CRM</p>
                <p className="text-gray-600 mt-2">Mensagens, Clientes, Conversas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Documentação */}
        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle className="text-lg">📚 Próximos Passos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>✅ <strong>Configure a API Oficial:</strong> Meta → Webhooks → Cole URL acima</p>
            <p>✅ <strong>Configure a Evolution:</strong> Defina variáveis de ambiente</p>
            <p>✅ <strong>Teste o webhook:</strong> Envie uma mensagem e verifique no CRM</p>
            <p>✅ <strong>Sincronize histórico:</strong> Use botão de Sincronizar Evolution</p>
            <p>✅ <strong>Monitorar:</strong> Vá em Bate-papo para ver mensagens em tempo real</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}