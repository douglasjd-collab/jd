import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Zap, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function StatusRecebimentoMensagens() {
  const [telefone, setTelefone] = useState('558791426333');
  const [loading, setLoading] = useState(false);
  const [forcando, setForcando] = useState(false);
  const [status, setStatus] = useState(null);
  const [ultimasMsg, setUltimasMsg] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const verificarStatus = async () => {
    if (!telefone) {
      toast.error('Preencha o telefone');
      return;
    }

    setLoading(true);
    try {
      // Chamar função que verifica webhook e última mensagem recebida
      const response = await base44.functions.invoke('verificarRecebimentoWebhook', {
        telefone,
      });

      setStatus(response.data.status);
      setUltimasMsg(response.data.mensagensRecentes || []);
    } catch (error) {
      toast.error('Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const forcarSincronizacao = async () => {
    if (!telefone) {
      toast.error('Preencha o telefone');
      return;
    }

    setForcando(true);
    try {
      const response = await base44.functions.invoke('sincronizarMensagensPeriodicoDef', {
        telefone,
      });

      toast.success(`✅ Sincronizadas ${response.data.sincronizadas || 0} mensagens!`);
      await verificarStatus();
    } catch (error) {
      toast.error('Erro: ' + error.message);
    } finally {
      setForcando(false);
    }
  };

  useEffect(() => {
    verificarStatus();
    
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      verificarStatus();
    }, 10000); // A cada 10 segundos

    return () => clearInterval(interval);
  }, [autoRefresh, telefone]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">📡 Status de Recebimento</h1>
          <p className="text-gray-600">Monitore em tempo real se as mensagens estão chegando</p>
        </div>

        {/* Controles */}
        <Card className="shadow-lg">
          <CardContent className="pt-6 space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="558791426333"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                disabled={loading || forcando}
                className="flex-1"
              />
              <Button
                onClick={verificarStatus}
                disabled={loading || forcando}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Verificar
              </Button>
              <Button
                onClick={forcarSincronizacao}
                disabled={loading || forcando}
                className="bg-red-600 hover:bg-red-700"
              >
                {forcando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                Forçar Sincronizar
              </Button>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-atualizar a cada 10s
            </label>
          </CardContent>
        </Card>

        {status && (
          <>
            {/* Status do Webhook */}
            <Card className={status.webhookConfigurado ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {status.webhookConfigurado ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-red-600" />
                  )}
                  Webhook
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-lg font-bold ${status.webhookConfigurado ? 'text-green-700' : 'text-red-700'}`}>
                  {status.webhookConfigurado ? '✅ Ativo' : '❌ Não configurado'}
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  {status.webhookConfigurado
                    ? 'Webhook está pronto para receber mensagens'
                    : 'Configure o webhook em Configuração WhatsApp'}
                </p>
              </CardContent>
            </Card>

            {/* Status da Conversa */}
            <Card className={status.conversaExiste ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {status.conversaExiste ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-amber-600" />
                  )}
                  Conversa do Contato
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-lg font-bold ${status.conversaExiste ? 'text-green-700' : 'text-amber-700'}`}>
                  {status.conversaExiste ? '✅ Existe' : '⚠️ Não criada ainda'}
                </p>
                {status.conversaExiste && (
                  <p className="text-sm text-gray-600 mt-2">
                    Última mensagem: <strong>{status.ultimaMensagem || 'Nenhuma'}</strong>
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Últimas Mensagens */}
            {ultimasMsg.length > 0 && (
              <Card>
                <CardHeader className="bg-blue-50 border-b">
                  <CardTitle className="text-lg">💬 Últimas Mensagens Recebidas</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {ultimasMsg.map((msg, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded border ${
                          msg.remetente === 'cliente'
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-green-50 border-green-200'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <span className={`text-xs font-bold px-2 py-1 rounded ${
                              msg.remetente === 'cliente'
                                ? 'bg-blue-600 text-white'
                                : 'bg-green-600 text-white'
                            }`}>
                              {msg.remetente === 'cliente' ? '📥 CLIENTE' : '📤 VENDEDOR'}
                            </span>
                            <p className="text-sm mt-2 break-words">{msg.conteudo}</p>
                          </div>
                          <div className="text-right ml-4">
                            <p className="text-xs text-gray-500 whitespace-nowrap">{msg.data}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {ultimasMsg.length === 0 && status.webhookConfigurado && (
              <Card className="border-amber-300 bg-amber-50">
                <CardContent className="pt-6">
                  <div className="flex gap-3">
                    <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-800">⚠️ Nenhuma mensagem recebida ainda</p>
                      <p className="text-sm text-amber-700 mt-1">
                        O webhook está configurado mas nenhuma mensagem chegou neste telefone.
                      </p>
                      <p className="text-sm text-amber-700 mt-2">
                        <strong>Solução:</strong> Envie uma mensagem para este número pelo WhatsApp e clique em "Verificar" após alguns segundos.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!status && !loading && (
          <Card className="text-center py-12">
            <p className="text-gray-500">Clique em "Verificar" para monitorar o recebimento de mensagens</p>
          </Card>
        )}
      </div>
    </div>
  );
}