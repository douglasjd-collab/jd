import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Play, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/ui/PageHeader';

export default function MapeamentoWebhookCompleto() {
  const [logs, setLogs] = useState([]);
  const [logsRastreamento, setLogsRastreamento] = useState([]);
  const [loading, setLoading] = useState(false);
  const [testando, setTestando] = useState(false);

  const carregarLogs = async () => {
    setLoading(true);
    try {
      const [logsMensagens, logsRast] = await Promise.all([
        base44.entities.LogRecebimentoWebhook.filter(
          { instancia: 'TES' },
          '-created_date',
          100
        ),
        base44.entities.LogRecebimentoWebhook.filter(
          { tipo_evento: 'rastreamento_webhook' },
          '-created_date',
          50
        )
      ]);
      
      setLogs(logsMensagens);
      setLogsRastreamento(logsRast);
    } catch (err) {
      console.error('Erro ao carregar logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const executarTeste = async () => {
    setTestando(true);
    try {
      const res = await base44.functions.invoke('testeWebhookCompleto');
      console.log('Resultado do teste:', res.data);
      
      setTimeout(() => {
        carregarLogs();
      }, 2000);
    } catch (err) {
      console.error('Erro ao executar teste:', err);
    } finally {
      setTestando(false);
    }
  };

  useEffect(() => {
    carregarLogs();
    const interval = setInterval(carregarLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  const contarPorTipo = () => {
    const tipos = {};
    logs.forEach(log => {
      tipos[log.tipo_evento] = (tipos[log.tipo_evento] || 0) + 1;
    });
    return tipos;
  };

  const statusCount = {
    sucesso: logs.filter(l => l.status === 'sucesso').length,
    erro: logs.filter(l => l.status === 'erro').length
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mapeamento Rigoroso de Webhook WhatsApp"
        subtitle="Diagnóstico completo de entrada e processamento de mensagens"
        onBack={() => window.history.back()}
      />

      <Alert className="border-blue-200 bg-blue-50">
        <AlertTriangle className="h-4 w-4 text-blue-600" />
        <AlertTitle>Modo de Diagnóstico Ativo</AlertTitle>
        <AlertDescription>
          O sistema está registrando TUDO que chega no webhook. Cada mensagem é rastreada em tempo real.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total de Eventos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{logs.length}</div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-800">Sucesso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{statusCount.sucesso}</div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-800">Erros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{statusCount.erro}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Últimas 5min</CardTitle>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={carregarLogs} 
              size="sm"
              variant="outline"
              className="w-full"
            >
              <RefreshCw className="w-3 h-3 mr-2" />
              Atualizar
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="eventos">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="eventos">Eventos Recebidos</TabsTrigger>
          <TabsTrigger value="rastreamento">Rastreamento</TabsTrigger>
          <TabsTrigger value="teste">Teste Manual</TabsTrigger>
        </TabsList>

        <TabsContent value="eventos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Todos os Eventos (últimas 100)</span>
                <Badge variant="outline">Auto-atualiza</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="mb-4">Nenhum evento recebido ainda</p>
                  <p className="text-sm mb-4">
                    Envie uma mensagem pelo WhatsApp para a instância TES
                  </p>
                  <Button onClick={executarTeste} disabled={testando}>
                    {testando ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Testando...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Executar Teste Simulado
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className={`p-4 rounded-lg border-l-4 transition-colors ${
                        log.status === 'sucesso'
                          ? 'border-green-500 bg-green-50 hover:bg-green-100'
                          : 'border-red-500 bg-red-50 hover:bg-red-100'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <p className="font-semibold text-sm">
                            {log.tipo_evento === 'mensagem_recebida' && '💬'}
                            {log.tipo_evento === 'erro' && '❌'}
                            {log.tipo_evento === 'rastreamento_webhook' && '📊'}
                            {log.tipo_evento === 'get_teste_webhook' && '🔄'}
                            {' '}
                            {log.tipo_evento}
                          </p>
                          <p className="text-xs text-slate-600">
                            {log.telefone && `📱 ${log.telefone}`}
                            {log.instancia && ` | 🏷️ ${log.instancia}`}
                          </p>
                        </div>
                        <Badge 
                          className={log.status === 'sucesso' ? 'bg-green-500' : 'bg-red-500'}
                        >
                          {log.status}
                        </Badge>
                      </div>

                      {log.conteudo && (
                        <div className="text-xs bg-slate-100 p-2 rounded mb-2 font-mono break-all max-h-32 overflow-y-auto">
                          {log.conteudo.substring(0, 300)}
                          {log.conteudo.length > 300 && '...'}
                        </div>
                      )}

                      {log.mensagem_erro && (
                        <div className="text-xs text-red-600 mt-2">
                          <strong>Erro:</strong> {log.mensagem_erro}
                        </div>
                      )}

                      <p className="text-xs text-slate-500 mt-2">
                        {new Date(log.timestamp).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rastreamento" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Rastreamento Detalhado de Entrada
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logsRastreamento.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <p>Nenhum rastreamento registrado ainda</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {logsRastreamento.map((log) => {
                    let rastreamento = {};
                    try {
                      rastreamento = JSON.parse(log.conteudo);
                    } catch (e) {
                      rastreamento = { erro: 'JSON inválido' };
                    }

                    return (
                      <Card key={log.id} className="bg-slate-50">
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-sm font-semibold">
                                {new Date(rastreamento.timestamp).toLocaleString('pt-BR')}
                              </p>
                              <p className="text-xs text-slate-600 mt-1">
                                {rastreamento.url}
                              </p>
                            </div>
                            <Badge variant="outline">{rastreamento.metodo}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {rastreamento.etapas && rastreamento.etapas.map((etapa, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-sm">
                              {etapa.status === 'completo' && (
                                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                              )}
                              {etapa.status === 'erro' && (
                                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                              )}
                              {etapa.status === 'iniciando' && (
                                <Loader2 className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0 animate-spin" />
                              )}
                              <div className="flex-1">
                                <p className="font-medium">{etapa.nome}</p>
                                {etapa.tamanho_bytes && (
                                  <p className="text-xs text-slate-600">
                                    Tamanho: {etapa.tamanho_bytes} bytes
                                  </p>
                                )}
                                {etapa.primeiros_100_chars && (
                                  <p className="text-xs text-slate-600 font-mono mt-1">
                                    {etapa.primeiros_100_chars}
                                  </p>
                                )}
                                {etapa.keys && (
                                  <p className="text-xs text-slate-600">
                                    Chaves: {etapa.keys.join(', ')}
                                  </p>
                                )}
                                {etapa.erro && (
                                  <p className="text-xs text-red-600 mt-1">
                                    ❌ {etapa.erro}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teste" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Teste Manual de Webhook</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Como Usar</AlertTitle>
                <AlertDescription>
                  Clique no botão abaixo para simular 3 formatos diferentes de webhook enviados pela Evolution.
                  Os dados de teste serão processados pela função receberWebhookWhatsApp.
                </AlertDescription>
              </Alert>

              <Button 
                onClick={executarTeste} 
                disabled={testando}
                size="lg"
                className="w-full"
              >
                {testando ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Executando Testes...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 mr-2" />
                    Executar 3 Testes de Webhook
                  </>
                )}
              </Button>

              <div className="text-sm text-slate-600 space-y-2">
                <p>✓ Formato Padrão Evolution (messages.upsert)</p>
                <p>✓ Formato com dados em Base64</p>
                <p>✓ Formato wrapper com data aninhado</p>
              </div>

              <Alert className="border-blue-200 bg-blue-50">
                <AlertTriangle className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-900">Próximas Ações</AlertTitle>
                <AlertDescription className="text-blue-800">
                  <ol className="list-decimal list-inside space-y-1 mt-2">
                    <li>Execute o teste acima</li>
                    <li>Abra a aba "Eventos Recebidos"</li>
                    <li>Se as mensagens aparecerem, o webhook funciona</li>
                    <li>Se não aparecerem, o problema está em receberWebhookWhatsApp</li>
                    <li>Verifique "Rastreamento" para detalhes da entrada</li>
                  </ol>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}