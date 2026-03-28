import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function TesteWebhookWhatsApp() {
  const [telefone, setTelefone] = useState('558799424630');
  const [mensagem, setMensagem] = useState('Teste de mensagem');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);

  const handleTestarWebhook = async () => {
    if (!telefone || !mensagem) {
      toast.error('Preencha telefone e mensagem');
      return;
    }

    setLoading(true);
    setResultado(null);

    try {
      const response = await base44.functions.invoke('receberWebhookWhatsAppRobusto', {
        data: {
          message: {
            from: telefone,
            body: mensagem,
            id: `msg_${Date.now()}`,
            contact: { name: `Teste ${telefone}` },
          },
        },
      });

      setResultado({
        success: response.data.success,
        conversaId: response.data.conversaId,
        mensagemId: response.data.mensagemId,
        telefone: response.data.telefone,
      });

      toast.success('Webhook processado com sucesso!');
    } catch (error) {
      toast.error('Erro: ' + error.message);
      setResultado({ success: false, error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDiagnosticar = async () => {
    if (!telefone) {
      toast.error('Preencha o telefone');
      return;
    }

    setLoading(true);

    try {
      const response = await base44.functions.invoke('diagnosticarContato', {
        telefone,
      });

      setResultado({
        success: response.data.success,
        diagnostico: response.data.diagnostico,
        problemas: response.data.problemas,
      });
    } catch (error) {
      toast.error('Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">🧪 Teste WhatsApp Webhook</h1>
          <p className="text-gray-600">Teste manualmente o recebimento de mensagens</p>
        </div>

        {/* Teste de Webhook */}
        <Card className="shadow-lg">
          <CardHeader className="bg-blue-50 border-b">
            <CardTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Simular Mensagem Recebida
            </CardTitle>
            <CardDescription>Dispara o webhook como se uma mensagem fosse recebida</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Telefone (apenas números)</label>
              <Input
                placeholder="558799424630"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Mensagem</label>
              <Textarea
                placeholder="Digite a mensagem de teste"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                disabled={loading}
                rows={3}
              />
            </div>

            <Button
              onClick={handleTestarWebhook}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Testar Webhook
            </Button>
          </CardContent>
        </Card>

        {/* Diagnóstico */}
        <Card className="shadow-lg">
          <CardHeader className="bg-amber-50 border-b">
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Diagnóstico de Contato
            </CardTitle>
            <CardDescription>Verifique se o contato está sendo sincronizado</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Telefone (apenas números)</label>
              <Input
                placeholder="558799424630"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                disabled={loading}
              />
            </div>

            <Button
              onClick={handleDiagnosticar}
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-700"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Diagnosticar
            </Button>
          </CardContent>
        </Card>

        {/* Resultado */}
        {resultado && (
          <Card className={`shadow-lg ${resultado.success ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {resultado.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )}
                {resultado.success ? 'Sucesso' : 'Erro'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-white p-4 rounded text-sm overflow-auto max-h-96">
                {JSON.stringify(resultado, null, 2)}
              </pre>

              {resultado.problemas && resultado.problemas.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h4 className="font-medium text-red-800">⚠️ Problemas encontrados:</h4>
                  {resultado.problemas.map((p, i) => (
                    <p key={i} className="text-sm text-red-700">• {p}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Info */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-lg">ℹ️ Como funciona?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700">
            <p>
              <strong>1. Testar Webhook:</strong> Simula uma mensagem chegando da Evolution API. A mensagem deve aparecer na conversa do CRM em tempo real.
            </p>
            <p>
              <strong>2. Diagnosticar:</strong> Verifica se o contato, conversa e mensagens estão sendo sincronizadas corretamente.
            </p>
            <p>
              <strong>3. Automação:</strong> A cada 5 minutos, o sistema sincroniza automaticamente todas as conversas.
            </p>
            <p className="text-blue-800 font-medium mt-3">
              ✅ Se ambos os testes passarem, o sistema está funcionando corretamente!
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}