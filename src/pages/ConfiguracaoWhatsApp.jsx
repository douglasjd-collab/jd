import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Copy, AlertCircle, Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const [empresas, setEmpresas] = useState([]);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState(null);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);

      if (me?.role === 'super_admin' || me?.perfil === 'super_admin') {
        // Super admin: carregar TODAS as empresas para poder configurar cada uma
        const todasEmpresas = await base44.entities.Empresa.filter({}, '-created_date', 50);
        setEmpresas(todasEmpresas || []);
        
        // Selecionar a primeira empresa por padrão
        if (todasEmpresas && todasEmpresas.length > 0) {
          const primeira = todasEmpresas[0];
          setSelectedEmpresaId(primeira.id);
          carregarEmpresa(primeira);
        }
      } else if (me?.empresa_id) {
        // Usuário normal - carregar apenas sua empresa
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
        const empId = colabs?.[0]?.empresa_id || me.empresa_id;
        const emp = await base44.entities.Empresa.filter({ id: empId });
        if (emp && emp.length > 0) {
          setSelectedEmpresaId(emp[0].id);
          carregarEmpresa(emp[0]);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const carregarEmpresa = (empresaData) => {
    setEmpresa(empresaData);
    setEvolutionUrl(empresaData.evolution_url || '');
    setInstanceName(empresaData.evolution_instance_name || '');
    setApiKey(empresaData.evolution_api_key || '');
    
    // Gerar URL webhook com nome da instância
    const webhookGerada = gerarUrlWebhook(empresaData.evolution_instance_name);
    setWebhookUrl(webhookGerada);
  };

  const BASE_WEBHOOK_URL = 'https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp';

  const gerarUrlWebhook = (instancia) => {
    if (!instancia) return BASE_WEBHOOK_URL;
    // Usar query string padrão ?instance=NOME (mais compatível com Evolution API)
    return `${BASE_WEBHOOK_URL}?instance=${encodeURIComponent(instancia)}`;
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
      const empresaId = selectedEmpresaId || empresa?.id;

      if (!empresaId) {
        toast.error('Erro: Empresa não definida');
        return;
      }

      await base44.entities.Empresa.update(empresaId, {
        evolution_url: tempUrl,
        evolution_instance_name: tempInstance,
        evolution_api_key: tempApiKey
      });

      setEvolutionUrl(tempUrl);
      setInstanceName(tempInstance);
      setApiKey(tempApiKey);
      
      // Gerar novo webhook URL com o nome da instância
      const novaUrl = gerarUrlWebhook(tempInstance);
      setWebhookUrl(novaUrl);
      
      setEditMode(false);
      toast.success('✅ Configurações WhatsApp salvas! A URL do webhook foi atualizada automaticamente.');
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



  const handleMudarEmpresa = (empId) => {
    setSelectedEmpresaId(empId);
    const emp = empresas.find(e => e.id === empId);
    if (emp) carregarEmpresa(emp);
  };

  const isSuperAdmin = user?.role === 'super_admin' || user?.perfil === 'super_admin';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuração WhatsApp"
        subtitle={empresa ? `Integração com Evolution API — ${empresa.nome}` : "Carregando..."}
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
                  placeholder="https://sua-evolution-api.com/"
                  className={editMode ? '' : 'bg-slate-50'}
                />
                {!editMode && evolutionUrl && (
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(evolutionUrl, 'url')}>
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
                  placeholder="Nome da instância no Evolution API"
                  className={editMode ? '' : 'bg-slate-50'}
                />
                {!editMode && instanceName && (
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(instanceName, 'instance')}>
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Chave de API (API Key)</Label>
              <div className="flex gap-2">
                <Input 
                  value={editMode ? tempApiKey : apiKey}
                  onChange={(e) => editMode && setTempApiKey(e.target.value)}
                  type="text"
                  readOnly={!editMode}
                  placeholder="Chave de segurança da instância"
                  className={editMode ? '' : 'bg-slate-50 font-mono'}
                />
                {!editMode && apiKey && (
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(apiKey, 'key')}>
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

            <div className="space-y-4">
              {/* URL Base (fixa) */}
              <div>
                <Label className="mb-2 block text-sm font-semibold text-slate-700">
                  🔒 URL Base (fixa — nunca muda):
                </Label>
                <div className="flex gap-2">
                  <Input
                    value="https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp"
                    readOnly
                    className="bg-slate-50 font-mono text-xs text-slate-600"
                  />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard('https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp', 'base')}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* URL da Subconta (com nome da empresa) */}
              <div>
                <Label className="mb-2 block text-base font-bold text-green-900">
                  📋 URL desta Subconta — CONFIGURE NA EVOLUTION API:
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
                        ✅ URL gerada com o nome da instância: <code className="bg-white px-2 py-1 rounded">={instanceName || 'NOME_INSTANCIA'}</code>
                      </p>
                      <p className="text-xs text-green-800 mt-1">
                        Cada subconta tem sua própria URL com o nome da instância, permitindo ao webhook identificar qual empresa recebeu a mensagem.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <p className="text-xs text-center text-slate-500 pt-4">
              Copie a URL acima e configure-a manualmente na Evolution API
            </p>
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