import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Eye,
  MessageSquare,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { toast } from 'sonner';

export default function LogsWebhookDapi() {
  const [selectedLog, setSelectedLog] = useState(null);
  const [testeOpen, setTesteOpen] = useState(false);
  const [testeNumero, setTesteNumero] = useState('5587981275628');
  const [testeMensagem, setTesteMensagem] = useState('Teste de envio via CRM JD');
  const [testeEnviando, setTesteEnviando] = useState(false);
  const [testeResultado, setTesteResultado] = useState(null);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['webhook-logs-dapi'],
    queryFn: async () => {
      const all = await base44.entities.WhatsappConnectionLog.filter({ direction: 'inbound' }, '-created_at', 100);
      return all.filter(log =>
        log.event_type?.includes('message') ||
        log.event_type?.includes('messages') ||
        log.event_type?.includes('connection') ||
        log.event_type?.includes('session') ||
        log.event_type === 'logged_out'
      );
    },
    refetchInterval: 5000
  });

  const testarEnvioDapi = async () => {
    setTesteEnviando(true);
    setTesteResultado(null);
    
    try {
      // Buscar conexão D-API ativa
      const conexoes = await base44.entities.WhatsappConnection.filter({
        provider_type: 'dapi',
        is_active: true
      }, '-created_date', 1);
      
      if (!conexoes || conexoes.length === 0) {
        setTesteResultado({ success: false, error: 'Nenhuma conexão D-API ativa encontrada' });
        toast.error('Nenhuma conexão D-API ativa encontrada');
        return;
      }
      
      const conexao = conexoes[0];
      console.log('🧪 Teste D-API:', {
        connectionId: conexao.id,
        sessionId: conexao.session_id,
        phoneNumber: testeNumero,
        text: testeMensagem
      });
      
      // Chamar whatsappService
      const resp = await base44.functions.invoke('whatsappService', {
        connectionId: conexao.id,
        action: 'sendText',
        phoneNumber: testeNumero.replace(/\D/g, ''),
        text: testeMensagem.trim()
      });
      
      const resultado = resp?.data;
      setTesteResultado(resultado);
      
      if (resultado?.success) {
        toast.success('✅ Mensagem de teste enviada com sucesso!');
      } else {
        const erro = resultado?.data?.error || resultado?.error || 'Erro desconhecido';
        const httpStatus = resultado?.data?.httpStatus || resultado?.httpStatus || 0;
        toast.error(`❌ Erro ${httpStatus}: ${erro}`);
      }
    } catch (error) {
      console.error('❌ Erro no teste:', error);
      setTesteResultado({ success: false, error: error.message });
      toast.error('Erro ao testar: ' + error.message);
    } finally {
      setTesteEnviando(false);
    }
  };

  const getEventBadge = (eventType) => {
    const config = {
      'messages.received': { color: 'bg-blue-500', label: 'Mensagem recebida' },
      'messages.sent': { color: 'bg-green-500', label: 'Mensagem enviada' },
      'message.delivered': { color: 'bg-emerald-500', label: 'Entregue' },
      'message.read': { color: 'bg-purple-500', label: 'Lida' },
      'message.update': { color: 'bg-orange-500', label: 'Atualizada' },
      'message.deleted': { color: 'bg-red-500', label: 'Apagada' },
      'connection.status': { color: 'bg-orange-500', label: 'Status' },
      'connection.qrcode': { color: 'bg-yellow-500', label: 'QR Code' },
      'logged_out': { color: 'bg-red-500', label: 'Desconectado' }
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

      {/* Card de Teste de Envio */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-500" />
            Teste de Envio D-API
          </CardTitle>
          <CardDescription>
            Envie uma mensagem de teste para verificar se a integração está funcionando
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="teste-numero">Número de telefone</Label>
              <Input
                id="teste-numero"
                value={testeNumero}
                onChange={(e) => setTesteNumero(e.target.value)}
                placeholder="5587981275628"
              />
              <p className="text-xs text-slate-500 mt-1">Formato: 55 + DDD + número (apenas números)</p>
            </div>
            <div>
              <Label htmlFor="teste-mensagem">Mensagem</Label>
              <Input
                id="teste-mensagem"
                value={testeMensagem}
                onChange={(e) => setTesteMensagem(e.target.value)}
                placeholder="Teste de envio via CRM JD"
              />
            </div>
          </div>
          
          {testeResultado && (
            <div className={`p-4 rounded-lg border ${testeResultado?.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-start gap-2">
                {testeResultado?.success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`font-medium text-sm ${testeResultado?.success ? 'text-green-900' : 'text-red-900'}`}>
                    {testeResultado?.success ? 'Sucesso!' : 'Erro no envio'}
                  </p>
                  {testeResultado?.success ? (
                    <p className="text-xs text-green-700 mt-1">
                      Message ID: {testeResultado?.data?.data?.messageId || testeResultado?.data?.messageId || 'N/A'}
                    </p>
                  ) : (
                    <p className="text-xs text-red-700 mt-1">
                      {testeResultado?.data?.error || testeResultado?.error || 'Erro desconhecido'}
                      {testeResultado?.data?.httpStatus && ` (HTTP ${testeResultado.data.httpStatus})`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <Button 
            onClick={testarEnvioDapi} 
            disabled={testeEnviando || !testeNumero || !testeMensagem}
            className="w-full"
          >
            {testeEnviando ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <MessageSquare className="w-4 h-4 mr-2" />
                Enviar Mensagem de Teste
              </>
            )}
          </Button>
        </CardContent>
      </Card>

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