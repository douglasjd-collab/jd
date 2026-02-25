import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle, AlertTriangle, RefreshCw, Copy, ExternalLink } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function MapeamentoMensagensDebug() {
  const [diagnostico, setDiagnostico] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testPayload, setTestPayload] = useState(null);
  const [enviandoTeste, setEnviandoTeste] = useState(false);

  const executarDiagnostico = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('diagnosticoMapeamentoMensagensCompleto');
      setDiagnostico(res.data);
      console.log('Diagnóstico:', res.data);
    } catch (err) {
      console.error('Erro ao executar diagnóstico:', err);
      alert('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const enviarTesteMensagem = async () => {
    setEnviandoTeste(true);
    try {
      const payloadTeste = {
        event: 'messages.upsert',
        instance: 'TEST_INSTANCE',
        data: {
          key: {
            id: `test_${Date.now()}`,
            fromMe: false,
            remoteJid: '558599999999@s.whatsapp.net'
          },
          message: {
            conversation: `Mensagem de teste enviada em ${new Date().toLocaleString('pt-BR')}`,
            messageTimestamp: Math.floor(Date.now() / 1000)
          },
          pushName: 'Teste Mapeamento'
        }
      };

      setTestPayload(payloadTeste);

      const res = await base44.functions.invoke('receberMensagensWhatsApp', payloadTeste);
      console.log('Resposta do teste:', res.data);

      // Re-executar diagnóstico após 2 segundos
      setTimeout(() => executarDiagnostico(), 2000);
    } catch (err) {
      console.error('Erro ao enviar teste:', err);
      alert('Erro ao enviar teste: ' + err.message);
    } finally {
      setEnviandoTeste(false);
    }
  };

  useEffect(() => {
    executarDiagnostico();
  }, []);

  if (loading && !diagnostico) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-lg font-semibold">Executando diagnóstico...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">🔍 Mapeamento de Mensagens WhatsApp</h1>
        <p className="text-slate-600">Diagnóstico completo do fluxo de recebimento de mensagens</p>
      </div>

      {/* Status Crítico */}
      {diagnostico?.critico && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-red-900">🚨 PROBLEMA CRÍTICO DETECTADO</h3>
            <p className="text-red-800 text-sm mt-1">Veja as recomendações abaixo para resolver</p>
          </div>
        </div>
      )}

      {/* Botões de Ação */}
      <div className="flex gap-3 flex-wrap">
        <Button
          onClick={executarDiagnostico}
          disabled={loading}
          variant="outline"
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar Diagnóstico
        </Button>
        <Button
          onClick={enviarTesteMensagem}
          disabled={enviandoTeste}
          className="bg-blue-600 hover:bg-blue-700 gap-2"
        >
          <AlertTriangle className="w-4 h-4" />
          Enviar Teste de Mensagem
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="resumo" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="etapas">Etapas</TabsTrigger>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="teste">Teste</TabsTrigger>
        </TabsList>

        {/* RESUMO */}
        <TabsContent value="resumo" className="space-y-4">
          {diagnostico?.recomendacoes?.length > 0 && (
            <Card className="bg-amber-50 border-amber-200">
              <CardHeader>
                <CardTitle className="text-amber-900 flex gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Recomendações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {diagnostico.recomendacoes.map((rec, i) => (
                    <li key={i} className="text-sm text-amber-900 flex gap-2">
                      <span className="font-bold min-w-fit">{rec.split(':')[0]}:</span>
                      <span>{rec.split(':')[1] || rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Conversas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-blue-600">
                  {diagnostico?.etapas?.find(e => e.etapa === 'Conversas Registradas')?.total || 0}
                </p>
                <p className="text-sm text-slate-600">conversas criadas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Mensagens</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-600">
                  {diagnostico?.etapas?.find(e => e.etapa === 'Mensagens Registradas')?.total || 0}
                </p>
                <p className="text-sm text-slate-600">mensagens registradas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Logs de Webhook</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-purple-600">
                  {diagnostico?.etapas?.find(e => e.etapa === 'Logs de Webhook')?.total || 0}
                </p>
                <p className="text-sm text-slate-600">eventos processados</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Contatos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-orange-600">
                  {diagnostico?.etapas?.find(e => e.etapa === 'Contatos WhatsApp')?.total || 0}
                </p>
                <p className="text-sm text-slate-600">contatos registrados</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ETAPAS */}
        <TabsContent value="etapas" className="space-y-4">
          {diagnostico?.etapas?.map((etapa, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex gap-2 items-center">
                    {etapa.status === 'OK' ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : etapa.status === 'ERRO' ? (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-blue-600" />
                    )}
                    {etapa.etapa}
                  </CardTitle>
                  <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
                    etapa.status === 'OK' ? 'bg-green-100 text-green-800' :
                    etapa.status === 'ERRO' ? 'bg-red-100 text-red-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {etapa.status}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="bg-slate-100 p-3 rounded text-sm overflow-auto max-h-96 text-slate-800">
                  {JSON.stringify(etapa, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* DADOS */}
        <TabsContent value="dados" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Conversas Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              {diagnostico?.etapas?.find(e => e.etapa === 'Conversas Registradas')?.ultimas?.length > 0 ? (
                <div className="space-y-3">
                  {diagnostico.etapas.find(e => e.etapa === 'Conversas Registradas').ultimas.map((conv, i) => (
                    <div key={i} className="border rounded-lg p-3 bg-slate-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-sm">{conv.cliente_telefone}</p>
                          <p className="text-xs text-slate-600">{conv.ultima_mensagem}</p>
                        </div>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{conv.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">Nenhuma conversa registrada</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mensagens Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              {diagnostico?.etapas?.find(e => e.etapa === 'Mensagens Registradas')?.ultimas?.length > 0 ? (
                <div className="space-y-3">
                  {diagnostico.etapas.find(e => e.etapa === 'Mensagens Registradas').ultimas.map((msg, i) => (
                    <div key={i} className="border rounded-lg p-3 bg-slate-50">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-xs font-semibold">{msg.remetente === 'cliente' ? '👤 Cliente' : '👨‍💼 Vendedor'}</p>
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">{msg.status}</span>
                      </div>
                      <p className="text-sm">{msg.texto}</p>
                      <p className="text-xs text-slate-500 mt-2">{new Date(msg.data_envio).toLocaleString('pt-BR')}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">Nenhuma mensagem registrada</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TESTE */}
        <TabsContent value="teste" className="space-y-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="text-blue-900">📤 Teste de Webhook</CardTitle>
              <CardDescription>Envie uma mensagem de teste para verificar se o sistema está processando corretamente</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={enviarTesteMensagem}
                disabled={enviandoTeste}
                className="w-full bg-blue-600 hover:bg-blue-700 gap-2 h-12"
              >
                {enviandoTeste ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Enviando teste...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    Enviar Mensagem de Teste
                  </>
                )}
              </Button>

              {testPayload && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Payload Enviado:</h4>
                  <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-auto max-h-64">
                    {JSON.stringify(testPayload, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">URL do Webhook</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-100 p-3 rounded flex items-center justify-between">
                <code className="text-sm text-slate-800 break-all">
                  {diagnostico?.etapas?.find(e => e.etapa === 'URL do Webhook')?.url}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const url = diagnostico.etapas.find(e => e.etapa === 'URL do Webhook').url;
                    navigator.clipboard.writeText(url);
                    alert('URL copiada!');
                  }}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-sm text-slate-600 mt-2">
                Configure esta URL na Evolution API como webhook para mensagens recebidas
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}