import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/ui/PageHeader';

export default function DiagnosticoWebhook() {
  const [diagnostico, setDiagnostico] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const executarDiagnostico = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('diagnosticoWebhookEvolutionCompleto');
      setDiagnostico(res.data);
    } catch (err) {
      console.error('Erro ao executar diagnóstico:', err);
    } finally {
      setLoading(false);
    }
  };

  const carregarLogs = async () => {
    setLogsLoading(true);
    try {
      const logsData = await base44.entities.LogRecebimentoWebhook.filter(
        { instancia: 'TES' },
        '-created_date',
        50
      );
      setLogs(logsData);
    } catch (err) {
      console.error('Erro ao carregar logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    executarDiagnostico();
    carregarLogs();
    const interval = setInterval(carregarLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const renderStatus = (status) => {
    if (status?.includes('✓')) {
      return <Badge className="bg-green-500">OK</Badge>;
    } else if (status?.includes('✗')) {
      return <Badge className="bg-red-500">ERRO</Badge>;
    }
    return <Badge className="bg-yellow-500">PENDENTE</Badge>;
  };

  if (!diagnostico && loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
          <p>Executando diagnóstico...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diagnóstico de Webhook WhatsApp"
        subtitle="Mapeamento rigoroso de recebimento de mensagens"
        onBack={() => window.history.back()}
      >
        <Button onClick={executarDiagnostico} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar Diagnóstico
        </Button>
      </PageHeader>

      <Tabs defaultValue="resumo">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="testes">Testes</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="recomendacoes">Recomendações</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="space-y-4">
          {diagnostico && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {diagnostico.resumo.configuracao_ok ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    )}
                    Configuração
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600">
                    {diagnostico.resumo.configuracao_ok ? 'Configurada corretamente' : 'Faltam configurações'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {diagnostico.resumo.conexao_evolution_ok ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    )}
                    Conexão Evolution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600">
                    {diagnostico.resumo.conexao_evolution_ok ? 'Conectado' : 'Verificar conexão'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {diagnostico.resumo.webhook_ativo ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    )}
                    Webhook Ativo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600">
                    {diagnostico.resumo.webhook_ativo ? 'Ativado na Evolution' : 'Desativado'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {diagnostico.resumo.logs_recebidos ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    )}
                    Logs Recebidos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600">
                    {diagnostico.resumo.logs_recebidos ? 'Webhooks sendo recebidos' : 'Aguardando webhooks'}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="testes" className="space-y-4">
          {diagnostico && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Configuração</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span>Evolution API URL</span>
                    {renderStatus(diagnostico.testes.configuracao.evolution_url)}
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Evolution API Key</span>
                    {renderStatus(diagnostico.testes.configuracao.evolution_key)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Conexão com Evolution API</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span>Status</span>
                    {renderStatus(diagnostico.testes.conexao_evolution.status)}
                  </div>
                  {diagnostico.testes.conexao_evolution.connected && (
                    <>
                      <div className="text-sm">
                        <strong>Instância Status:</strong> {diagnostico.testes.conexao_evolution.instance_status}
                      </div>
                      <div className="text-sm">
                        <strong>Número WhatsApp:</strong> {diagnostico.testes.conexao_evolution.numero_whatsapp || 'Não identificado'}
                      </div>
                    </>
                  )}
                  {diagnostico.testes.conexao_evolution.erro && (
                    <div className="text-sm text-red-600">
                      <strong>Erro:</strong> {diagnostico.testes.conexao_evolution.erro}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Webhook na Evolution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span>Status</span>
                    {renderStatus(diagnostico.testes.webhook_na_evolution.status)}
                  </div>
                  {diagnostico.testes.webhook_na_evolution.url && (
                    <div className="text-sm break-all bg-slate-100 p-2 rounded">
                      <strong>URL:</strong> {diagnostico.testes.webhook_na_evolution.url}
                    </div>
                  )}
                  {diagnostico.testes.webhook_na_evolution.eventos && (
                    <div className="text-sm">
                      <strong>Eventos Habilitados:</strong>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {diagnostico.testes.webhook_na_evolution.eventos.map((evt) => (
                          <Badge key={evt} variant="outline">{evt}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Conversas Ativas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm">Total: <strong>{diagnostico.testes.conversas_ativas.total}</strong></p>
                  {diagnostico.testes.conversas_ativas.ultimas.length > 0 && (
                    <div className="text-sm space-y-1">
                      {diagnostico.testes.conversas_ativas.ultimas.map((conv) => (
                        <div key={conv.id} className="bg-slate-50 p-2 rounded">
                          {conv.cliente_telefone} - {conv.status}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Últimos Eventos (50 registros)</CardTitle>
              <CardDescription>
                Auto-atualiza a cada 5 segundos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                  Nenhum evento recebido ainda
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className={`p-3 rounded border-l-4 ${
                        log.status === 'sucesso'
                          ? 'border-green-500 bg-green-50'
                          : 'border-red-500 bg-red-50'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-sm">{log.tipo_evento}</p>
                          <p className="text-xs text-slate-600">{log.telefone}</p>
                          {log.conteudo && (
                            <p className="text-xs text-slate-600 mt-1 truncate">{log.conteudo}</p>
                          )}
                        </div>
                        <Badge className={log.status === 'sucesso' ? 'bg-green-500' : 'bg-red-500'}>
                          {log.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        {new Date(log.timestamp).toLocaleString('pt-BR')}
                      </p>
                      {log.mensagem_erro && (
                        <p className="text-xs text-red-600 mt-1">Erro: {log.mensagem_erro}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recomendacoes" className="space-y-4">
          {diagnostico && diagnostico.recomendacoes.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  Tudo Configurado!
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">
                  Seu webhook está pronto para receber mensagens. Se ainda não está recebendo, envie uma mensagem de teste pelo WhatsApp.
                </p>
              </CardContent>
            </Card>
          ) : (
            diagnostico?.recomendacoes.map((rec, idx) => (
              <Card key={idx} className="border-yellow-200 bg-yellow-50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600" />
                    {rec}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}