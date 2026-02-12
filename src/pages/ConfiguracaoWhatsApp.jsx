import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Copy, AlertCircle, Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export default function ConfiguracaoWhatsApp() {
  const [copied, setCopied] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [evolutionUrl, setEvolutionUrl] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [tempUrl, setTempUrl] = useState('');
  const [tempInstance, setTempInstance] = useState('');
  const [tempApiKey, setTempApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [atualizandoWebhook, setAtualizandoWebhook] = useState(false);
  const [user, setUser] = useState(null);
  const [empresa, setEmpresa] = useState(null);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);

      if (me?.empresa_id) {
        const emp = await base44.entities.Empresa.filter({ id: me.empresa_id });
        if (emp && emp.length > 0) {
          const empresaData = emp[0];
          setEmpresa(empresaData);
          setEvolutionUrl(empresaData.evolution_url || '');
          setInstanceName(empresaData.evolution_instance_name || '');
          setApiKey(empresaData.evolution_api_key || '');
        }
      }

      // Gerar webhook URL com base na empresa
      obterUrlCorretaAuto();
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const gerarUrlWebhook = (instancia) => {
    if (!instancia) return '';
    const baseUrl = 'https://windy-sheep-96-fz7shspqdf18.deno.dev/functions/receberWebhookWhatsApp';
    return `${baseUrl}?instance=${encodeURIComponent(instancia)}`;
  };

  const obterUrlCorretaAuto = async () => {
    try {
      if (instanceName) {
        const urlCorreta = gerarUrlWebhook(instanceName);
        console.log('✅ URL Webhook Gerada:', urlCorreta);
        setWebhookUrl(urlCorreta);
      }
    } catch (error) {
      console.error('Erro ao gerar URL:', error);
    }
  };

  const handleEditMode = () => {
    if (!editMode) {
      setTempUrl(evolutionUrl);
      setTempInstance(instanceName);
      setTempApiKey(apiKey);
    }
    setEditMode(!editMode);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!user?.empresa_id || !empresa?.id) {
        toast.error('Erro: Empresa não identificada');
        return;
      }

      await base44.entities.Empresa.update(empresa.id, {
        evolution_url: tempUrl,
        evolution_instance_name: tempInstance,
        evolution_api_key: tempApiKey
      });

      setEvolutionUrl(tempUrl);
      setInstanceName(tempInstance);
      setApiKey(tempApiKey);
      setEditMode(false);
      toast.success('✅ Configurações WhatsApp salvas para esta empresa!');
    } catch (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text, name) => {
    navigator.clipboard.writeText(text);
    setCopied(name);
    toast.success('Copiado!');
    setTimeout(() => setCopied(null), 2000);
  };

  const atualizarWebhookEvolution = async () => {
    setAtualizandoWebhook(true);
    try {
      if (!empresa?.id) {
        toast.error('Erro: Empresa não identificada');
        return;
      }

      const configResponse = await base44.functions.invoke('configurarWebhookEvolution', {
        empresa_id: empresa.id,
        evolution_url: evolutionUrl,
        evolution_instance_name: instanceName,
        evolution_api_key: apiKey
      });
      
      if (configResponse.data.success) {
        setWebhookUrl(configResponse.data.webhook_url);
        toast.success('✅ Webhook configurado com sucesso na Evolution API!');
      } else {
        throw new Error(configResponse.data.error || 'Erro ao configurar webhook');
      }
    } catch (error) {
      console.error('Erro ao atualizar webhook:', error);
      toast.error('❌ Erro: ' + error.message);
    } finally {
      setAtualizandoWebhook(false);
    }
  };

  const testarRecebimento = async () => {
    setAtualizandoWebhook(true);
    try {
      const { data } = await base44.functions.invoke('diagnosticoCompleto');
      console.log('📊 Diagnóstico Completo:', data);

      if (data.success) {
        toast.success('✅ Tudo funcionando!', {
          description: data.resumo,
          duration: 5000
        });
      } else {
        // Mostrar problemas encontrados
        const problemas = data.diagnostico.problemas.join('\n');
        const recomendacoes = data.diagnostico.recomendacoes.join('\n');

        toast.error('❌ Problemas encontrados', {
          description: problemas + '\n\n' + recomendacoes,
          duration: 15000
        });
      }

      // Log completo para debug
      console.log('='.repeat(80));
      console.log('✅ SUCESSOS:');
      data.diagnostico.sucessos.forEach(s => console.log('  ' + s));
      console.log('\n❌ PROBLEMAS:');
      data.diagnostico.problemas.forEach(p => console.log('  ' + p));
      console.log('\n🔧 RECOMENDAÇÕES:');
      data.diagnostico.recomendacoes.forEach(r => console.log('  ' + r));
      console.log('='.repeat(80));

    } catch (error) {
      console.error('Erro no diagnóstico:', error);
      toast.error('Erro ao diagnosticar: ' + error.message);
    } finally {
      setAtualizandoWebhook(false);
    }
  };

  const testarWebhookManual = async () => {
    setAtualizandoWebhook(true);
    try {
      const { data } = await base44.functions.invoke('testarWebhookManual');
      console.log('✅ Teste do webhook:', data);

      if (data.success) {
        toast.success('✅ Webhook respondeu!', {
          description: 'Mensagem de teste foi processada. Procure pela conversa "Cliente Teste" no Bate-papo',
          duration: 5000
        });
      } else {
        toast.error('❌ Erro no webhook: ' + data.error);
      }
    } catch (error) {
      console.error('Erro ao testar webhook:', error);
      toast.error('Erro: ' + error.message);
    } finally {
      setAtualizandoWebhook(false);
    }
  };

  const verificarEvolutionAPI = async () => {
    setAtualizandoWebhook(true);
    try {
      const { data } = await base44.functions.invoke('verificarEvolutionAPI');
      console.log('🔍 Verificação Evolution API:', data);

      if (data.success) {
        const { diagnostico } = data;

        if (diagnostico.problemas.length === 0) {
          toast.success('✅ Tudo OK com Evolution API!', {
            description: diagnostico.instancia_ativa ? 'Instância conectada e webhooks configurados' : 'Mas instância pode não estar conectada',
            duration: 5000
          });
        } else {
          const problemas = diagnostico.problemas.join('\n\n');
          toast.error('⚠️ Problemas encontrados:', {
            description: problemas,
            duration: 10000
          });
        }
      } else {
        toast.error('❌ Erro: ' + data.error);
      }
    } catch (error) {
      console.error('Erro ao verificar Evolution API:', error);
      toast.error('Erro: ' + error.message);
    } finally {
      setAtualizandoWebhook(false);
    }
  };

  const reconfigurarWebhook = async () => {
    setAtualizandoWebhook(true);
    try {
      const { data } = await base44.functions.invoke('reconfigurarWebhookEvolution');
      console.log('⚙️ Reconfiguração webhook:', data);

      if (data.success) {
        toast.success('✅ Webhook reconfigurado!', {
          description: 'Aguarde 2-3 minutos e envie uma mensagem de teste',
          duration: 7000
        });
      } else {
        toast.error('❌ Erro: ' + data.error);
      }
    } catch (error) {
      console.error('Erro ao reconfigurar webhook:', error);
      toast.error('Erro: ' + error.message);
    } finally {
      setAtualizandoWebhook(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuração WhatsApp"
        subtitle={empresa ? `Integração com Evolution API - ${empresa.nome}` : "Carregando..."}
      />

      <div className="grid grid-cols-1 gap-6">
        {/* Status da Conexão */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <CardTitle>Status da Conexão</CardTitle>
            </div>
            <CardDescription>Configurações ativas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm"><strong>Instância:</strong> {instanceName}</p>
              <p className="text-sm"><strong>Status:</strong> <span className="text-green-600 font-semibold">Conectado</span></p>
            </div>
          </CardContent>
        </Card>

        {/* Informações da Evolution API */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <span>⚙️</span> Dados da Evolution API
              </CardTitle>
              <Button
                variant={editMode ? 'outline' : 'default'}
                size="sm"
                onClick={handleEditMode}
                disabled={saving}
              >
                {editMode ? 'Cancelar' : 'Editar'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            
            <div>
              <Label className="mb-2 block">URL da API</Label>
              <div className="flex gap-2">
                <Input 
                  value={editMode ? tempUrl : evolutionUrl}
                  onChange={(e) => editMode && setTempUrl(e.target.value)}
                  readOnly={!editMode}
                  className={editMode ? '' : 'bg-slate-50'}
                />
                {!editMode && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(evolutionUrl, 'url')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Nome da Instância</Label>
              <div className="flex gap-2">
                <Input 
                  value={editMode ? tempInstance : instanceName}
                  onChange={(e) => editMode && setTempInstance(e.target.value)}
                  readOnly={!editMode}
                  className={editMode ? '' : 'bg-slate-50'}
                />
                {!editMode && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(instanceName, 'instance')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Chave de API</Label>
              <div className="flex gap-2">
                <Input 
                  value={editMode ? tempApiKey : apiKey}
                  onChange={(e) => editMode && setTempApiKey(e.target.value)}
                  type="text"
                  readOnly={!editMode}
                  className={editMode ? '' : 'bg-slate-50 font-mono'}
                />
                {!editMode && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(apiKey, 'key')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {editMode && (
              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handleEditMode}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Configuração do Webhook */}
        <Card className="border-l-4 border-l-green-500 bg-gradient-to-br from-green-50 to-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>🔗</span> URL do Webhook (OBRIGATÓRIA)
            </CardTitle>
            <CardDescription className="text-green-700 font-semibold">
              ⚠️ Esta é a URL CORRETA que deve estar configurada na Evolution API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            
            <div className="bg-amber-100 border-2 border-amber-400 rounded-lg p-4">
              <div className="flex gap-2 items-start mb-3">
                <AlertCircle className="w-6 h-6 text-amber-700 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-900">⚠️ ATENÇÃO: URL do Deployment Atual</p>
                  <p className="text-sm text-amber-800 mt-2">
                    A URL abaixo é gerada automaticamente pelo seu deployment atual. 
                    <strong className="block mt-1">Se você configurou uma URL diferente na Evolution API, as mensagens NÃO chegarão.</strong>
                  </p>
                  <ol className="text-sm text-amber-900 mt-3 space-y-1 list-decimal list-inside font-semibold">
                    <li>Copie a URL abaixo (clique no botão copiar)</li>
                    <li>Vá na Evolution API → Configuração WhatsApp → Webhook URL</li>
                    <li>Cole esta URL EXATA no campo de webhook</li>
                    <li>Ou clique no botão "Configurar Automaticamente" abaixo</li>
                  </ol>
                </div>
              </div>
            </div>

            <div>
              <Label className="mb-3 block text-base font-bold text-green-900">
                📋 URL do Webhook - COPIE E CONFIGURE NA EVOLUTION:
              </Label>
              {loading ? (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Carregando URL...</span>
                </div>
              ) : (
                <>
                  <div className="flex gap-2 mb-2">
                    <Input 
                      value={webhookUrl}
                      readOnly 
                      className="bg-white border-2 border-green-500 font-mono text-sm font-bold text-green-700"
                    />
                    <Button
                      variant="default"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        copyToClipboard(webhookUrl, 'webhook');
                        toast.success('✅ URL copiada! Cole na Evolution API');
                      }}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copiar
                    </Button>
                  </div>
                  <div className="p-3 bg-green-100 border border-green-300 rounded-lg">
                    <p className="text-xs text-green-900 font-semibold">
                      ✅ Esta URL inclui automaticamente: <code className="bg-white px-2 py-1 rounded">?instance=TESTEWAZE</code>
                    </p>
                    <p className="text-xs text-green-800 mt-1">
                      Mensagens enviadas e recebidas serão processadas por esta URL
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="pt-4 border-t space-y-3">
              <Button 
                onClick={atualizarWebhookEvolution}
                disabled={atualizandoWebhook || !evolutionUrl || !instanceName || !apiKey}
                className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
              >
                {atualizandoWebhook ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Configurando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Configurar Webhook Automaticamente
                  </>
                )}
              </Button>

              <Button 
                onClick={testarWebhookManual}
                disabled={atualizandoWebhook}
                variant="outline"
                className="w-full border-2 border-purple-500 text-purple-600 hover:bg-purple-50"
              >
                {atualizandoWebhook ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Testando...
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Teste Rápido (Simular Mensagem)
                  </>
                )}
              </Button>

              <Button 
                onClick={verificarEvolutionAPI}
                disabled={atualizandoWebhook}
                variant="outline"
                className="w-full border-2 border-orange-500 text-orange-600 hover:bg-orange-50"
              >
                {atualizandoWebhook ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Verificar Evolution API
                  </>
                )}
              </Button>

              <Button 
                onClick={reconfigurarWebhook}
                disabled={atualizandoWebhook}
                className="w-full bg-red-600 hover:bg-red-700 text-white"
              >
                {atualizandoWebhook ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Reconfigurando...
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Reconfigurar Webhook (Se não recebe mensagens)
                  </>
                )}
              </Button>

              <Button 
                onClick={testarRecebimento}
                disabled={atualizandoWebhook}
                variant="outline"
                className="w-full border-2 border-blue-500 text-blue-600 hover:bg-blue-50"
              >
                {atualizandoWebhook ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Diagnosticando...
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Diagnóstico Completo
                  </>
                )}
              </Button>
              
              <p className="text-xs text-center text-slate-500">
                Use o diagnóstico para verificar se o webhook está correto
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Eventos Suportados */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>📨</span> Eventos Suportados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">Mensagens de texto</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">Mensagens com imagem</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">Mensagens com áudio</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">Mensagens com vídeo</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">Mensagens com PDF</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">Confirmação de entrega</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Próximos Passos */}
        <Card className="bg-gradient-to-br from-purple-50 to-white border-l-4 border-l-purple-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>✨</span> Próximos Passos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-700">
              Após configurar o webhook no Evolution API, você poderá:
            </p>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold">1.</span>
                <span>Receber mensagens de clientes em tempo real no módulo Bate-papo</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold">2.</span>
                <span>Responder clientes via WhatsApp diretamente da plataforma</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold">3.</span>
                <span>Compartilhar arquivos (PDF, imagens, vídeos, áudios)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold">4.</span>
                <span>Manter histórico completo de conversas</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}