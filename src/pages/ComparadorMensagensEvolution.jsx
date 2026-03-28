import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ComparadorMensagensEvolution() {
  const [telefone, setTelefone] = useState('558791426333');
  const [loading, setLoading] = useState(false);
  const [dados, setDados] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);

  const handleSincronizar = async () => {
    if (!telefone) {
      toast.error('Preencha o telefone');
      return;
    }

    setSincronizando(true);
    try {
      const response = await base44.functions.invoke('sincronizarMensagensRigorosoCompleto', {
        telefone,
      });

      toast.success(`✅ ${response.data.sincronizadas} mensagens sincronizadas com rigor!`);
      
      // Recarregar dados
      await handlePuxar();
    } catch (error) {
      toast.error('Erro: ' + error.message);
    } finally {
      setSincronizando(false);
    }
  };

  const handlePuxar = async () => {
    if (!telefone) {
      toast.error('Preencha o telefone');
      return;
    }

    setLoading(true);
    try {
      const response = await base44.functions.invoke('puxarMensagensContatoAgressivo', {
        telefone,
      });

      setDados(response.data);
      toast.success(`✅ ${response.data.evolution.total} mensagens da Evolution carregadas!`);
    } catch (error) {
      toast.error('Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-100 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">🔄 Comparador Evolution vs CRM</h1>
          <p className="text-gray-600">Veja as mensagens do WhatsApp e compare com o CRM</p>
        </div>

        {/* Busca */}
        <Card className="shadow-lg">
          <CardHeader className="bg-blue-50 border-b">
            <CardTitle>Buscar Mensagens</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="558791426333"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                disabled={loading || sincronizando}
                className="flex-1"
              />
              <Button
                onClick={handlePuxar}
                disabled={loading || sincronizando}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Comparar
              </Button>
              <Button
                onClick={handleSincronizar}
                disabled={loading || sincronizando}
                className="bg-red-600 hover:bg-red-700"
                title="Sincroniza com RIGOR: tira TUDO da Evolution e coloca no CRM"
              >
                {sincronizando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                🔐 Sincronizar RIGOR
              </Button>
            </div>
          </CardContent>
        </Card>

        {dados && (
          <>
            {/* Stats */}
            <div className="grid md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-600">Evolution API</p>
                  <p className="text-4xl font-bold text-blue-600">{dados.evolution.total}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-600">CRM Local</p>
                  <p className="text-4xl font-bold text-green-600">{dados.crm.total}</p>
                </CardContent>
              </Card>
              <Card className={dados.diferenca > 0 ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-600">Diferença</p>
                  <p className={`text-4xl font-bold ${dados.diferenca > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {Math.abs(dados.diferenca)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Aviso se há diferença */}
            {dados.diferenca > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-red-800">⚠️ {dados.diferenca} mensagens faltam no CRM!</p>
                  <p className="text-sm text-red-700 mt-1">
                    Estas mensagens estão na Evolution API mas não foram sincronizadas para o CRM.
                  </p>
                  <Button
                    onClick={handleSincronizar}
                    disabled={sincronizando}
                    className="mt-3 bg-red-600 hover:bg-red-700 text-white"
                    size="sm"
                  >
                    {sincronizando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Corrigir Agora com RIGOR
                  </Button>
                </div>
              </div>
            )}

            {/* Abas */}
            <Tabs defaultValue="evolution" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="evolution">
                  Evolution API ({dados.evolution.total})
                </TabsTrigger>
                <TabsTrigger value="crm">
                  CRM Local ({dados.crm.total})
                </TabsTrigger>
              </TabsList>

              {/* Evolution */}
              <TabsContent value="evolution">
                <Card>
                  <CardHeader className="bg-blue-50">
                    <CardTitle className="text-lg">📱 Mensagens da Evolution API</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                      {dados.evolution.mensagens.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">Nenhuma mensagem encontrada</p>
                      ) : (
                        dados.evolution.mensagens.map((msg, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded border ${
                              msg.de === 'VENDEDOR'
                                ? 'bg-green-50 border-green-200'
                                : 'bg-blue-50 border-blue-200'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  {msg.de === 'VENDEDOR' ? (
                                    <span className="text-xs font-bold bg-green-600 text-white px-2 py-1 rounded">
                                      📤 ENVIADO
                                    </span>
                                  ) : (
                                    <span className="text-xs font-bold bg-blue-600 text-white px-2 py-1 rounded">
                                      📥 RECEBIDO
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-600">{msg.tipo}</span>
                                </div>
                                <p className="text-sm mt-2 break-words">{msg.conteudo}</p>
                              </div>
                              <div className="text-right ml-4">
                                <p className="text-xs text-gray-500 whitespace-nowrap">{msg.timestamp}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* CRM */}
              <TabsContent value="crm">
                <Card>
                  <CardHeader className="bg-green-50">
                    <CardTitle className="text-lg">💾 Mensagens no CRM</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                      {dados.crm.mensagens.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">Nenhuma mensagem no CRM</p>
                      ) : (
                        dados.crm.mensagens.map((msg, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded border ${
                              msg.remetente === 'vendedor'
                                ? 'bg-green-50 border-green-200'
                                : 'bg-blue-50 border-blue-200'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  {msg.remetente === 'vendedor' ? (
                                    <span className="text-xs font-bold bg-green-600 text-white px-2 py-1 rounded">
                                      📤 ENVIADO
                                    </span>
                                  ) : (
                                    <span className="text-xs font-bold bg-blue-600 text-white px-2 py-1 rounded">
                                      📥 RECEBIDO
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-600">{msg.tipo_conteudo}</span>
                                </div>
                                <p className="text-sm mt-2 break-words">{msg.texto}</p>
                              </div>
                              <div className="text-right ml-4">
                                <p className="text-xs text-gray-500 whitespace-nowrap">
                                  {new Date(msg.data_envio).toLocaleString('pt-BR')}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Info */}
            <Card className="bg-purple-50 border-purple-200">
              <CardHeader>
                <CardTitle className="text-lg">💡 O que é isso?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-gray-700">
                <p>
                  <strong>Evolution API:</strong> Mensagens que chegaram no WhatsApp via Evolution
                </p>
                <p>
                  <strong>CRM Local:</strong> Mensagens que foram sincronizadas para o banco de dados
                </p>
                <p className="mt-3">
                  Se houver <strong>diferença</strong>, significa que o webhook não capturou todas as mensagens.
                </p>
                <p className="text-red-700 font-bold mt-3">
                  ❌ Se há diferença, ative a sincronização agressiva em Configuração WhatsApp.
                </p>
              </CardContent>
            </Card>
          </>
        )}

        {!dados && !loading && (
          <Card className="text-center py-12">
            <p className="text-gray-500">Clique em "Puxar" para comparar as mensagens</p>
          </Card>
        )}
      </div>
    </div>
  );
}