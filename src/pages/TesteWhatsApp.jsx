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
  const [diagnostico, setDiagnostico] = useState(null);
  const [carregandoDiag, setCarregandoDiag] = useState(false);
  const [testeEvolution, setTesteEvolution] = useState(null);
  const [testando2, setTestando2] = useState(false);

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

  const testarEvolution = async () => {
    setTestando2(true);
    try {
      const response = await base44.functions.invoke('testarConexaoEvolution');
      setTesteEvolution(response.data);
      
      if (response.data.success) {
        const todosOk = response.data.testes.every(t => t.sucesso);
        if (todosOk) {
          toast.success('✅ Todas credenciais OK!');
        } else {
          toast.warning('⚠️ Alguns testes falharam');
        }
      } else {
        toast.error('❌ Credenciais não configuradas');
      }
    } catch (error) {
      toast.error('Erro: ' + error.message);
    } finally {
      setTestando2(false);
    }
  };

  const rodarDiagnostico = async () => {
    setCarregandoDiag(true);
    try {
      const response = await base44.functions.invoke('diagnosticoWebhook');
      setDiagnostico(response.data);
      toast.success('Diagnóstico concluído');
    } catch (error) {
      toast.error('Erro: ' + error.message);
    } finally {
      setCarregandoDiag(false);
    }
  };

  const simularMensagem = async () => {
    if (!telefone) {
      toast.error('Digite um telefone');
      return;
    }

    setTestando(true);
    try {
      const response = await base44.functions.invoke('simularMensagemRecebida', { 
        telefone: telefone 
      });

      if (response.data.success) {
        toast.success('✅ Mensagem simulada e criada no banco!');
        setTimeout(carregarDados, 500);
      } else {
        toast.error('Erro: ' + (response.data.error || 'Desconhecido'));
      }
    } catch (error) {
      toast.error('Erro: ' + error.message);
    } finally {
      setTestando(false);
    }
  };

  const testarWebhook = async () => {
    if (!telefone) {
      toast.error('Digite um telefone');
      return;
    }

    setTestando(true);
    try {
      const response = await base44.functions.invoke('testarWebhookWhatsApp', { 
        telefone: telefone 
      });

      console.log('Resposta teste:', response.data);

      if (response.data.success) {
        if (response.data.mensagem_criada) {
          toast.success('✅ Teste OK! Mensagem criada com sucesso');
        } else {
          toast.warning('⚠️ Webhook respondeu mas mensagem não foi criada');
        }
        setTimeout(carregarDados, 1000);
      } else {
        toast.error('Erro: ' + (response.data.error || 'Desconhecido'));
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

      {/* Teste Evolution API */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>🔌 Conexão Evolution API</span>
            <Button onClick={testarEvolution} disabled={testando2}>
              {testando2 ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Testar Conexão'
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {testeEvolution && (
            <div className="space-y-4">
              {/* Credenciais */}
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="font-semibold mb-3">📋 Credenciais Configuradas</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">URL:</span>
                    <code className="text-xs bg-white px-2 py-1 rounded">{testeEvolution.credenciais?.url}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Instance:</span>
                    <code className="text-xs bg-white px-2 py-1 rounded">{testeEvolution.credenciais?.instance}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">API Key:</span>
                    <span>{testeEvolution.credenciais?.key_configurada ? '✅ Configurada' : '❌ Não configurada'}</span>
                  </div>
                </div>
              </div>

              {/* Resultados dos Testes */}
              <div className="space-y-2">
                {testeEvolution.testes?.map((teste, idx) => (
                  <div key={idx} className={`p-3 rounded-lg border-2 ${
                    teste.sucesso 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{teste.nome}</span>
                      {teste.sucesso ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                    {teste.sucesso ? (
                      <div className="text-sm">
                        <p className="text-slate-600 mb-1">Status: {teste.status}</p>
                        {teste.dados && (
                          <pre className="text-xs bg-white p-2 rounded overflow-x-auto max-h-32">
                            {JSON.stringify(teste.dados, null, 2)}
                          </pre>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-red-700">❌ {teste.erro || 'Falha na conexão'}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diagnóstico */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Diagnóstico Completo</span>
            <Button onClick={rodarDiagnostico} disabled={carregandoDiag} variant="outline">
              {carregandoDiag ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Rodar Diagnóstico'
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {diagnostico && (
            <div className="space-y-4 text-sm">
              <div className="p-3 bg-slate-50 rounded">
                <p className="font-semibold mb-2">🔌 Configuração Evolution API</p>
                <div className="space-y-1 ml-3">
                  <p>URL: <code className="text-xs bg-white px-2 py-1 rounded">{diagnostico.evolution_config?.url}</code></p>
                  <p>Instance: <code className="text-xs bg-white px-2 py-1 rounded">{diagnostico.evolution_config?.instance}</code></p>
                  <p>Key: {diagnostico.evolution_config?.key_exists ? '✅ Configurada' : '❌ Não configurada'}</p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded">
                <p className="font-semibold mb-2">📊 Banco de Dados</p>
                <div className="space-y-1 ml-3">
                  <p>Mensagens: {diagnostico.database_check?.ultimas_mensagens}</p>
                  <p>Conversas: {diagnostico.database_check?.ultimas_conversas}</p>
                </div>
              </div>

              {diagnostico.evolution_config?.webhook && (
                <div className="p-3 bg-slate-50 rounded">
                  <p className="font-semibold mb-2">🌐 Webhook Evolution</p>
                  <pre className="text-xs bg-white p-2 rounded overflow-x-auto">
                    {JSON.stringify(diagnostico.evolution_config.webhook, null, 2)}
                  </pre>
                </div>
              )}

              <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="font-semibold mb-1">📎 URL do Webhook</p>
                <code className="text-xs break-all">{diagnostico.webhook_url}</code>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Teste de Webhook */}
      <Card>
        <CardHeader>
          <CardTitle>Testar Webhook Manualmente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Telefone (apenas números)</Label>
            <Input
              placeholder="558781194149"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={simularMensagem} disabled={testando} variant="outline">
              {testando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Simular Mensagem
                </>
              )}
            </Button>
            <Button onClick={testarWebhook} disabled={testando}>
              {testando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Testar Webhook
                </>
              )}
            </Button>
          </div>
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