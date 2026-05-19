import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, MessageSquare } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function MonitoramentoJD() {
  const [lastCheck, setLastCheck] = useState(null);
  const [diagnostico, setDiagnostico] = useState(null);
  const [loading, setLoading] = useState(false);

  // Buscar logs recentes
  const { data: logsRecentes } = useQuery({
    queryKey: ['logs-jd'],
    queryFn: async () => {
      const logs = await base44.entities.LogRecebimentoWebhook.filter(
        { empresa_id: '699696c2c9f5bffc2e67402b' },
        '-timestamp',
        50
      );
      return logs;
    },
    refetchInterval: 10000 // Atualizar a cada 10 segundos
  });

  // Buscar mensagens recentes
  const { data: mensagensRecentes } = useQuery({
    queryKey: ['mensagens-jd'],
    queryFn: async () => {
      const msgs = await base44.entities.MensagemWhatsapp.filter(
        { empresa_id: '699696c2c9f5bffc2e67402b' },
        '-data_envio',
        50
      );
      return msgs;
    },
    refetchInterval: 10000
  });

  const executarDiagnostico = async () => {
    setLoading(true);
    try {
      const resp = await base44.functions.invoke('diagnosticoForcarRecebimentoJD', {});
      setDiagnostico(resp.data);
      setLastCheck(new Date());
    } catch (err) {
      console.error('Erro no diagnóstico:', err);
    } finally {
      setLoading(false);
    }
  };

  const reconectarWebhook = async () => {
    try {
      const resp = await base44.functions.invoke('reconectarWebhookJDPromotora', {});
      alert(resp.data.success ? 'Webhook reconectado!' : 'Erro: ' + resp.data.error);
      executarDiagnostico();
    } catch (err) {
      alert('Erro ao reconectar: ' + err.message);
    }
  };

  // Calcular estatísticas
  const ultimosLogs = logsRecentes || [];
  const ultimaMensagemRecebida = ultimosLogs.find(log => log.tipo_evento === 'mensagem_recebida');
  const tempoDesdeUltimaMensagem = ultimaMensagemRecebida 
    ? Math.floor((Date.now() - new Date(ultimaMensagemRecebida.timestamp).getTime()) / 60000)
    : null;

  const mensagensClienteRecentes = mensagensRecentes?.filter(m => m.remetente === 'cliente') || [];
  const ultimaMensagemCliente = mensagensClienteRecentes[0];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Monitoramento JD PROMOTORA</h1>
        <div className="flex gap-2">
          <Button
            onClick={executarDiagnostico}
            disabled={loading}
            variant="outline"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Diagnosticar Agora
          </Button>
          <Button
            onClick={reconectarWebhook}
            variant="default"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Reconectar Webhook
          </Button>
        </div>
      </div>

      {/* Status Geral */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status do Webhook</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {diagnostico?.webhook?.enabled ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span className="font-semibold">Ativo</span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-red-500" />
                  <span className="font-semibold">Inativo</span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {diagnostico?.webhook?.events?.length || 0} eventos configurados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Última Mensagem Recebida</CardTitle>
          </CardHeader>
          <CardContent>
            {tempoDesdeUltimaMensagem !== null ? (
              <>
                <div className="flex items-center gap-2">
                  {tempoDesdeUltimaMensagem < 15 ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : tempoDesdeUltimaMensagem < 60 ? (
                    <AlertCircle className="w-5 h-5 text-yellow-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className="font-semibold">
                    {tempoDesdeUltimaMensagem} minutos atrás
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {ultimaMensagemRecebida?.conteudo?.substring(0, 50)}...
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma mensagem registrada</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mensagens de Clientes (Recentes)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-500" />
              <span className="font-semibold">{mensagensClienteRecentes.length}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {ultimaMensagemCliente 
                ? `Última: ${new Date(ultimaMensagemCliente.data_envio).toLocaleString('pt-BR')}`
                : 'Sem mensagens recentes'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Diagnóstico Detalhado */}
      {diagnostico && (
        <Card>
          <CardHeader>
            <CardTitle>Diagnóstico Detalhado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold mb-2">Instância</h3>
                <div className="space-y-1 text-sm">
                  <p><strong>Nome:</strong> {diagnostico.instance?.instance?.instanceName}</p>
                  <p><strong>Status:</strong> {diagnostico.instance?.instance?.state}</p>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Webhook</h3>
                <div className="space-y-1 text-sm">
                  <p><strong>URL:</strong> <code className="text-xs bg-muted px-1 rounded">{diagnostico.webhook?.url}</code></p>
                  <p><strong>Enabled:</strong> {diagnostico.webhook?.enabled ? 'Sim' : 'Não'}</p>
                  <p><strong>Base64:</strong> {diagnostico.webhook?.webhookBase64 ? 'Sim' : 'Não'}</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Eventos Configurados ({diagnostico.webhook?.events?.length})</h3>
              <div className="flex flex-wrap gap-1">
                {diagnostico.webhook?.events?.map(event => (
                  <Badge key={event} variant="outline" className="text-xs">
                    {event}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="text-sm">
                <strong>Chats encontrados:</strong> {diagnostico.summary?.chatsFound || 0}
              </div>
              <div className="text-sm">
                <strong>Mensagens na API:</strong> {diagnostico.summary?.messagesFound || 0}
              </div>
              <div className="text-sm">
                <strong>Mensagens salvas:</strong> {diagnostico.summary?.messagesStored || 0}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Logs Recentes */}
      <Card>
        <CardHeader>
          <CardTitle>Últimos Logs de Recebimento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {ultimosLogs.slice(0, 20).map(log => (
              <div key={log.id} className="flex items-center justify-between p-2 border rounded text-sm">
                <div className="flex items-center gap-2">
                  {log.status === 'sucesso' ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span className="font-mono text-xs">{new Date(log.timestamp).toLocaleString('pt-BR')}</span>
                  <Badge variant="outline">{log.tipo_evento}</Badge>
                  <span className="text-muted-foreground">{log.telefone}</span>
                </div>
                <span className="text-xs text-muted-foreground max-w-xs truncate">
                  {log.conteudo?.substring(0, 50)}
                </span>
              </div>
            ))}
            {ultimosLogs.length === 0 && (
              <p className="text-muted-foreground text-center py-4">Nenhum log encontrado</p>
            )}
          </div>
        </CardContent>
      </Card>

      {lastCheck && (
        <p className="text-xs text-muted-foreground text-center">
          Última verificação: {lastCheck.toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  );
}