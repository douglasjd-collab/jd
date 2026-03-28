import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';

export default function RastreadorMensagens() {
  const [telefone, setTelefone] = useState('558791426333');
  const [loading, setLoading] = useState(false);
  const [dados, setDados] = useState(null);

  const handleRastrear = async () => {
    if (!telefone) {
      toast.error('Preencha o telefone');
      return;
    }

    setLoading(true);
    try {
      const response = await base44.functions.invoke('rastrearMensagensCompleto', {
        telefone,
      });

      setDados(response.data);
    } catch (error) {
      toast.error('Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">🔍 Rastreador de Mensagens</h1>
          <p className="text-gray-600">Descubra EXATAMENTE onde as mensagens estão ficando presas</p>
        </div>

        {/* Busca */}
        <Card className="shadow-lg">
          <CardContent className="pt-6">
            <div className="flex gap-2">
              <Input
                placeholder="558791426333"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                disabled={loading}
                className="flex-1"
              />
              <Button
                onClick={handleRastrear}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                Rastrear
              </Button>
            </div>
          </CardContent>
        </Card>

        {dados && (
          <>
            {/* Análise Resumida */}
            <div className="grid md:grid-cols-5 gap-4">
              <Card className={dados.analise.emEvolution === 0 ? 'border-red-300 bg-red-50' : ''}>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-600">Evolution API</p>
                  <p className={`text-3xl font-bold ${dados.analise.emEvolution === 0 ? 'text-red-600' : 'text-blue-600'}`}>
                    {dados.analise.emEvolution}
                  </p>
                </CardContent>
              </Card>
              <Card className={dados.analise.webhooksRecebidos === 0 ? 'border-red-300 bg-red-50' : ''}>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-600">Webhooks Recebidos</p>
                  <p className={`text-3xl font-bold ${dados.analise.webhooksRecebidos === 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {dados.analise.webhooksRecebidos}
                  </p>
                </CardContent>
              </Card>
              <Card className={!dados.analise.clienteExiste ? 'border-red-300 bg-red-50' : ''}>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-600">Cliente</p>
                  <p className={`text-3xl font-bold ${!dados.analise.clienteExiste ? 'text-red-600' : 'text-green-600'}`}>
                    {dados.analise.clienteExiste ? '✅' : '❌'}
                  </p>
                </CardContent>
              </Card>
              <Card className={!dados.analise.conversasExistem ? 'border-red-300 bg-red-50' : ''}>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-600">Conversas</p>
                  <p className={`text-3xl font-bold ${!dados.analise.conversasExistem ? 'text-red-600' : 'text-green-600'}`}>
                    {dados.analise.clienteExiste ? '✅' : '❌'}
                  </p>
                </CardContent>
              </Card>
              <Card className={dados.analise.nosCRM === 0 ? 'border-red-300 bg-red-50' : ''}>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-600">Mensagens CRM</p>
                  <p className={`text-3xl font-bold ${dados.analise.nosCRM === 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {dados.analise.nosCRM}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Diagnóstico */}
            <div className="space-y-3">
              {dados.diagnostico.map((d, i) => (
                <div
                  key={i}
                  className={`border rounded-lg p-4 ${
                    d.nivel === 'CRÍTICO'
                      ? 'border-red-300 bg-red-50'
                      : d.nivel === 'AVISO'
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-green-300 bg-green-50'
                  }`}
                >
                  <div className="flex gap-3">
                    {d.nivel === 'CRÍTICO' ? (
                      <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                    ) : d.nivel === 'AVISO' ? (
                      <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0" />
                    ) : (
                      <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className="font-bold text-gray-900">{d.problema}</p>
                      <p className="text-sm text-gray-700 mt-1">
                        <strong>Causa:</strong> {d.causa}
                      </p>
                      <p className="text-sm text-gray-700">
                        <strong>Solução:</strong> {d.solucao}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Detalhes */}
            <Tabs defaultValue="evolution" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="evolution">
                  Evolution ({dados.mensagensEvolution.length})
                </TabsTrigger>
                <TabsTrigger value="webhooks">
                  Webhooks ({dados.logsWebhook.length})
                </TabsTrigger>
                <TabsTrigger value="crm">
                  CRM ({dados.mensagensNCRM.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="evolution">
                <Card>
                  <CardHeader className="bg-blue-50">
                    <CardTitle>📱 Mensagens na Evolution API</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {dados.mensagensEvolution.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">Nenhuma mensagem</p>
                      ) : (
                        dados.mensagensEvolution.map((msg, i) => (
                          <div key={i} className="p-3 rounded border border-gray-200 bg-gray-50">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <span className={`text-xs font-bold px-2 py-1 rounded ${
                                  msg.de === 'ENVIADO' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'
                                }`}>
                                  {msg.de}
                                </span>
                                <p className="text-sm mt-1">{msg.conteudo}</p>
                              </div>
                              <p className="text-xs text-gray-500 ml-2 whitespace-nowrap">{msg.timestamp}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="webhooks">
                <Card>
                  <CardHeader className="bg-purple-50">
                    <CardTitle>🪝 Webhooks Recebidos</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {dados.logsWebhook.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">Nenhum webhook recebido</p>
                      ) : (
                        dados.logsWebhook.map((log, i) => (
                          <div key={i} className="p-3 rounded border border-purple-200 bg-purple-50">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-sm font-bold">{log.tipo}</p>
                                <p className="text-xs text-gray-600">{log.criado}</p>
                              </div>
                              <span className={`text-xs font-bold px-2 py-1 rounded ${
                                log.statusResposta === 200 ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                              }`}>
                                {log.statusResposta}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="crm">
                <Card>
                  <CardHeader className="bg-green-50">
                    <CardTitle>💾 Mensagens no CRM</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {dados.mensagensNCRM.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">Nenhuma mensagem</p>
                      ) : (
                        dados.mensagensNCRM.map((msg, i) => (
                          <div key={i} className="p-3 rounded border border-green-200 bg-green-50">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <span className={`text-xs font-bold px-2 py-1 rounded ${
                                  msg.remetente === 'vendedor' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'
                                }`}>
                                  {msg.remetente === 'vendedor' ? 'ENVIADO' : 'RECEBIDO'}
                                </span>
                                <p className="text-sm mt-1">{msg.conteudo}</p>
                              </div>
                              <p className="text-xs text-gray-500 ml-2 whitespace-nowrap">{msg.enviada}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}

        {!dados && !loading && (
          <Card className="text-center py-12">
            <p className="text-gray-500">Clique em "Rastrear" para descobrir onde as mensagens estão ficando</p>
          </Card>
        )}
      </div>
    </div>
  );
}