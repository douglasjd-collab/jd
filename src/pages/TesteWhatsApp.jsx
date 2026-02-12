import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Send, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function TesteWhatsApp() {
  const [loading, setLoading] = useState(false);
  const [conversas, setConversas] = useState([]);
  const [mensagens, setMensagens] = useState([]);
  const [telefone, setTelefone] = useState('');
  const [testando, setTestando] = useState(false);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [conv, msgs] = await Promise.all([
        base44.entities.ConversaWhatsapp.filter({}, '-data_ultima_mensagem', 10),
        base44.entities.MensagemWhatsapp.filter({}, '-data_envio', 20)
      ]);
      setConversas(conv);
      setMensagens(msgs);
      toast.success('Dados carregados');
    } catch (error) {
      toast.error('Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const testarWebhook = async () => {
    if (!telefone) {
      toast.error('Digite um telefone');
      return;
    }

    setTestando(true);
    try {
      // Simular payload de webhook
      const webhookUrl = await base44.functions.invoke('getWebhookUrl');
      const payload = {
        event: 'messages.upsert',
        data: {
          key: {
            remoteJid: telefone + '@s.whatsapp.net',
            fromMe: false,
            id: 'TEST_' + Date.now()
          },
          message: {
            conversation: 'Mensagem de teste - ' + new Date().toLocaleString()
          },
          pushName: 'Cliente Teste'
        }
      };

      console.log('Enviando para webhook:', webhookUrl.data);
      console.log('Payload:', payload);

      const response = await fetch(webhookUrl.data, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      console.log('Resposta webhook:', result);

      if (result.success) {
        toast.success('Teste enviado! Aguarde processamento...');
        setTimeout(carregarDados, 2000);
      } else {
        toast.error('Erro no webhook: ' + (result.error || 'Desconhecido'));
      }
    } catch (error) {
      console.error('Erro teste:', error);
      toast.error('Erro: ' + error.message);
    } finally {
      setTestando(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Teste WhatsApp Integration</h1>
        <Button onClick={carregarDados} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Teste de Webhook */}
      <Card>
        <CardHeader>
          <CardTitle>Testar Webhook Manualmente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Telefone (apenas números)</Label>
            <Input
              placeholder="5581999999999"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <Button onClick={testarWebhook} disabled={testando}>
            {testando ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Enviar Teste
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Conversas Recentes */}
      <Card>
        <CardHeader>
          <CardTitle>Conversas Recentes ({conversas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {conversas.length === 0 ? (
            <p className="text-slate-500">Nenhuma conversa encontrada</p>
          ) : (
            <div className="space-y-2">
              {conversas.map((conv) => (
                <div key={conv.id} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{conv.cliente_nome}</p>
                      <p className="text-sm text-slate-500">{conv.cliente_telefone}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-slate-500">
                        {new Date(conv.data_ultima_mensagem).toLocaleString('pt-BR')}
                      </p>
                      <p className="text-xs text-slate-400">{conv.ultima_mensagem?.substring(0, 30)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mensagens Recentes */}
      <Card>
        <CardHeader>
          <CardTitle>Mensagens Recentes ({mensagens.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {mensagens.length === 0 ? (
            <p className="text-slate-500">Nenhuma mensagem encontrada</p>
          ) : (
            <div className="space-y-2">
              {mensagens.map((msg) => (
                <div key={msg.id} className="p-3 border rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    {msg.remetente === 'cliente' ? (
                      <CheckCircle className="w-4 h-4 text-blue-500" />
                    ) : (
                      <Send className="w-4 h-4 text-green-500" />
                    )}
                    <span className="font-medium capitalize">{msg.remetente}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(msg.data_envio).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-sm">{msg.texto || `[${msg.tipo_conteudo}]`}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 bg-slate-100 rounded">
                      {msg.status}
                    </span>
                    <span className="text-xs text-slate-400">
                      Conversa: {msg.conversa_id?.substring(0, 8)}...
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}