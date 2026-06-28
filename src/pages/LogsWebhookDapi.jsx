import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  Loader2, 
  Zap, 
  AlertCircle,
  RefreshCw,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';

export default function LogsWebhookDapi() {
  const [selectedLog, setSelectedLog] = useState(null);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['webhook-logs-dapi'],
    queryFn: async () => {
      const all = await base44.entities.LogRecebimentoWebhook.filter({}, '-created_at', 100);
      return all.filter(log => log.event_type?.includes('message') || log.event_type?.includes('session'));
    },
    refetchInterval: 5000
  });

  const getEventBadge = (eventType) => {
    const config = {
      'message.received': { color: 'bg-blue-500', label: 'Mensagem Recebida' },
      'message.sent': { color: 'bg-green-500', label: 'Enviada' },
      'message.delivered': { color: 'bg-emerald-500', label: 'Entregue' },
      'message.read': { color: 'bg-purple-500', label: 'Lida' },
      'session.status': { color: 'bg-orange-500', label: 'Status' },
      'session.qr': { color: 'bg-yellow-500', label: 'QR Code' },
      'session.disconnected': { color: 'bg-red-500', label: 'Desconectado' }
    };

    const c = config[eventType] || { color: 'bg-slate-500', label: eventType };
    return <Badge className={`${c.color} text-white`}>{c.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Logs D-API" 
        subtitle="Webhooks recebidos da D-API"
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Webhooks Recebidos</CardTitle>
            <CardDescription>
              Últimas 100 requisições do webhook da D-API
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center p-8 text-slate-500">
              <Zap className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum webhook recebido ainda</p>
              <p className="text-sm">Os logs aparecerão aqui quando a D-API enviar eventos</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 cursor-pointer"
                  onClick={() => setSelectedLog(log)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    {getEventBadge(log.event_type)}
                    <div>
                      <p className="font-medium text-sm">
                        {log.connection_id ? `Conexão: ${log.connection_id}` : 'Conexão não identificada'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {log.error_message && (
                      <Badge variant="destructive">Erro</Badge>
                    )}
                    <Eye className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Detalhes */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-500" />
              Detalhes do Webhook
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-slate-100">
                  <p className="text-xs text-slate-500">Evento</p>
                  <p className="font-medium">{selectedLog.event_type}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-100">
                  <p className="text-xs text-slate-500">Data/Hora</p>
                  <p className="font-medium">
                    {new Date(selectedLog.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-100">
                  <p className="text-xs text-slate-500">Conexão</p>
                  <p className="font-medium">{selectedLog.connection_id || 'N/A'}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-100">
                  <p className="text-xs text-slate-500">Tempo de Resposta</p>
                  <p className="font-medium">{selectedLog.response_time_ms}ms</p>
                </div>
              </div>

              {selectedLog.error_message && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-xs text-red-700">Erro</p>
                  <p className="font-medium text-red-900">{selectedLog.error_message}</p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-500">Payload Recebido</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedLog.payload_json || '');
                      toast.success('Payload copiado!');
                    }}
                  >
                    Copiar JSON
                  </Button>
                </div>
                <pre className="block p-3 bg-slate-900 rounded text-xs font-mono text-green-400 overflow-auto max-h-64">
                  {JSON.stringify(JSON.parse(selectedLog.payload_json || '{}'), null, 2)}
                </pre>
              </div>

              {selectedLog.response_json && (
                <div>
                  <p className="text-xs text-slate-500 mb-2">Resposta</p>
                  <pre className="block p-3 bg-slate-100 rounded text-xs font-mono text-slate-700 overflow-auto max-h-48">
                    {JSON.stringify(JSON.parse(selectedLog.response_json || '{}'), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSelectedLog(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}