import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  Settings, 
  Percent, 
  Plus, 
  Trash2,
  Loader2,
  Zap,
  ExternalLink,
  Pencil,
  Building2,
  MessageSquare,
  Plug,
  FileText,
  Image,
  Upload
} from 'lucide-react';
import { toast } from 'sonner';
import SincronizacaoCanopus from '@/components/configuracoes/SincronizacaoCanopus';
import ConfiguracaoWhatsApp from '@/pages/ConfiguracaoWhatsApp';
import ConfiguracaoApi from '@/pages/ConfiguracaoApi';
import IntegracaoFinantoBank from '@/pages/IntegracaoFinantoBank';
import IntegracaoWhatsAppMeta from '@/components/configuracoes/IntegracaoWhatsAppMeta';
import IntegracaoInstagram from '@/components/configuracoes/IntegracaoInstagram';


export default function Configuracoes() {
  const [novaConfig, setNovaConfig] = useState({
    tipo: 'vendedor',
    percentual: '',
    descricao: ''
  });
  const [backendStatus, setBackendStatus] = useState(null);
  const [verificando, setVerificando] = useState(false);
  const [user, setUser] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [editarNomeOpen, setEditarNomeOpen] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [uploadandoLogo, setUploadandoLogo] = useState(false);
  const [salvandoLogo, setSalvandoLogo] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);

      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      const empId = colabs?.[0]?.empresa_id || me.empresa_id;

      if (empId) {
        const emps = await base44.entities.Empresa.filter({ id: empId });
        if (emps && emps.length > 0) {
          setEmpresa(emps[0]);
          setNovoNome(emps[0].nome);
        }
      }

      // Carregar logo do PDF
      const configs = await base44.entities.ConfiguracaoSistema.filter({ chave: 'logo_url' });
      if (configs && configs.length > 0 && configs[0].valor) {
        setLogoUrl(configs[0].valor);
        setLogoPreview(configs[0].valor);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadandoLogo(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setLogoUrl(file_url);
      setLogoPreview(file_url);
      toast.success('Imagem carregada! Clique em "Salvar Logo" para confirmar.');
    } catch (err) {
      toast.error('Erro ao fazer upload: ' + err.message);
    } finally {
      setUploadandoLogo(false);
    }
  };

  const handleSalvarLogo = async () => {
    if (!logoUrl) { toast.error('Selecione uma imagem primeiro'); return; }
    setSalvandoLogo(true);
    try {
      const configs = await base44.entities.ConfiguracaoSistema.filter({ chave: 'logo_url' });
      if (configs && configs.length > 0) {
        await base44.entities.ConfiguracaoSistema.update(configs[0].id, { valor: logoUrl });
      } else {
        await base44.entities.ConfiguracaoSistema.create({ chave: 'logo_url', valor: logoUrl });
      }
      toast.success('Logo do PDF salva com sucesso!');
    } catch (err) {
      toast.error('Erro ao salvar logo: ' + err.message);
    } finally {
      setSalvandoLogo(false);
    }
  };

  const handleSalvarNome = async () => {
    if (!novoNome.trim() || !empresa) {
      toast.error('Nome não pode estar vazio');
      return;
    }

    if (novoNome === empresa.nome) {
      setEditarNomeOpen(false);
      return;
    }

    setSalvandoNome(true);
    try {
      await base44.entities.Empresa.update(empresa.id, { nome: novoNome });
      setEmpresa(prev => ({ ...prev, nome: novoNome }));
      setEditarNomeOpen(false);
      toast.success('Nome da empresa alterado com sucesso!');
    } catch (error) {
      toast.error('Erro ao alterar nome: ' + error.message);
      setNovoNome(empresa.nome);
    } finally {
      setSalvandoNome(false);
    }
  };

  const verificarBackend = async () => {
    setVerificando(true);
    try {
      const response = await base44.functions.invoke('healthCheck', {});
      if (response.data?.success) {
        setBackendStatus('ativo');
        toast.success('Backend Functions está ativo!');
      } else {
        setBackendStatus('inativo');
        toast.error('Backend Functions não está ativo');
      }
    } catch (error) {
      setBackendStatus('inativo');
      toast.error('Backend Functions não habilitado');
    } finally {
      setVerificando(false);
    }
  };

  const { data: configuracoes = [], isLoading } = useQuery({
    queryKey: ['configuracoes-comissao'],
    queryFn: () => base44.entities.ConfiguracaoComissao.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ConfiguracaoComissao.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracoes-comissao'] });
      setNovaConfig({ tipo: 'vendedor', percentual: '', descricao: '' });
      toast.success('Configuração adicionada!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ConfiguracaoComissao.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracoes-comissao'] });
      toast.success('Configuração removida!');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!novaConfig.percentual) {
      toast.error('Informe o percentual');
      return;
    }
    createMutation.mutate({
      ...novaConfig,
      percentual: parseFloat(novaConfig.percentual),
      status: 'ativo'
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" subtitle="Configure as regras do sistema" />

      <Tabs defaultValue="geral">
        <TabsList className="mb-2">
          <TabsTrigger value="geral"><Settings className="w-4 h-4 mr-1.5" />Geral</TabsTrigger>
          <TabsTrigger value="whatsapp"><MessageSquare className="w-4 h-4 mr-1.5" />WhatsApp</TabsTrigger>
          <TabsTrigger value="api"><Plug className="w-4 h-4 mr-1.5" />API</TabsTrigger>
          <TabsTrigger value="finanto"><FileText className="w-4 h-4 mr-1.5" />FinantoBank INSS</TabsTrigger>
          <TabsTrigger value="meta-wpp"><MessageSquare className="w-4 h-4 mr-1.5" />WhatsApp Oficial Meta</TabsTrigger>
          <TabsTrigger value="instagram"><span className="mr-1.5">📸</span>Instagram</TabsTrigger>
        </TabsList>

        <TabsContent value="whatsapp">
          <ConfiguracaoWhatsApp />
        </TabsContent>

        <TabsContent value="api">
          <ConfiguracaoApi />
        </TabsContent>

        <TabsContent value="finanto">
          <IntegracaoFinantoBank />
        </TabsContent>

        <TabsContent value="meta-wpp">
          <IntegracaoWhatsAppMeta empresaId={empresa?.id} />
        </TabsContent>

        <TabsContent value="instagram">
          <IntegracaoInstagram empresaId={empresa?.id} />
        </TabsContent>

        <TabsContent value="geral" className="space-y-6">
      {/* Modal Editar Nome */}
      <Dialog open={editarNomeOpen} onOpenChange={setEditarNomeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Alterar Nome da Empresa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome da empresa</Label>
              <Input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Digite o novo nome"
                className="mt-2"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSalvarNome()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditarNomeOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvarNome}
              disabled={salvandoNome}
              className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
            >
              {salvandoNome ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logo do PDF */}
      <Card className="border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-50 to-white">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-600">
              <Image className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle>Logo do PDF</CardTitle>
              <CardDescription>Imagem exibida no cabeçalho dos relatórios e comprovantes PDF</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {logoPreview && (
            <div className="border rounded-xl p-4 bg-white flex items-center justify-center" style={{ height: 100 }}>
              <img src={logoPreview} alt="Logo PDF" className="max-h-16 max-w-xs object-contain" />
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadandoLogo} />
              <div className="flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-medium bg-white hover:bg-slate-50 transition-colors">
                {uploadandoLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploadandoLogo ? 'Carregando...' : 'Selecionar Imagem'}
              </div>
            </label>
            <Button onClick={handleSalvarLogo} disabled={salvandoLogo || !logoUrl} className="bg-purple-600 hover:bg-purple-700 gap-2">
              {salvandoLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Salvar Logo
            </Button>
          </div>
          <p className="text-xs text-slate-500">Formatos aceitos: PNG, JPG, SVG. Recomendado: fundo transparente (PNG).</p>
        </CardContent>
      </Card>

      {/* Informações da Empresa */}
      <Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50 to-white">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-600">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle>{empresa?.nome || 'Empresa'}</CardTitle>
              <CardDescription>Informações da empresa</CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditarNomeOpen(true)}
            className="gap-2"
          >
            <Pencil className="w-4 h-4" />
            Alterar Nome
          </Button>
        </CardHeader>
      </Card>

      {/* Backend Functions */}
      <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-indigo-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-blue-600">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle>Backend Functions</CardTitle>
                <CardDescription>
                  Funcionalidades avançadas e automações do sistema
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-white rounded-xl border-2 border-blue-100">
            <h4 className="font-semibold text-slate-900 mb-2">O que você ganha:</h4>
            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Geração automática de códigos</strong> - EMP001, EMP002...</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Validações server-side</strong> - empresa_id, campos obrigatórios</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Integração RPA Canopus</strong> - sincronização automática de clientes</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Cálculos de comissão</strong> - processamento automático e confiável</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Filtros inteligentes</strong> - clientes visíveis por perfil/empresa</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            {backendStatus === 'ativo' && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-green-900">Backend Functions está ATIVO ✓</span>
              </div>
            )}
            
            {backendStatus === 'inativo' && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-sm font-medium text-red-900">Backend Functions NÃO está ativo</span>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <Button
                onClick={verificarBackend}
                disabled={verificando}
                variant="outline"
                className="gap-2"
              >
                {verificando ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Settings className="w-4 h-4" />
                )}
                Verificar Status
              </Button>

              <Button
                onClick={() => window.open('https://base44.dev/dashboard', '_blank')}
                className="bg-blue-600 hover:bg-blue-700 gap-2"
              >
                <Zap className="w-4 h-4" />
                Ir para Dashboard
                <ExternalLink className="w-3 h-3" />
              </Button>
            </div>

            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-xs font-semibold text-amber-900 mb-2">📋 Como habilitar:</p>
              <ol className="text-xs text-amber-800 space-y-1 list-decimal list-inside">
                <li>Clique em "Ir para Dashboard" acima</li>
                <li>Acesse <strong>Settings</strong> no menu lateral</li>
                <li>Encontre <strong>"Backend Functions"</strong></li>
                <li>Clique em <strong>"Enable"</strong></li>
                <li>Volte aqui e clique em "Verificar Status"</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sincronização Canopus */}
      <SincronizacaoCanopus />

      {/* Configuração de Comissões */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="w-5 h-5" />
            Regras de Comissão
          </CardTitle>
          <CardDescription>
            Configure os percentuais de comissão para vendedores e gerentes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Formulário */}
          <form onSubmit={handleSubmit} className="flex flex-wrap gap-4 items-end">
            <div>
              <Label>Tipo</Label>
              <Select
                value={novaConfig.tipo}
                onValueChange={(value) => setNovaConfig({ ...novaConfig, tipo: value })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendedor">Vendedor</SelectItem>
                  <SelectItem value="gerente">Gerente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Percentual (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={novaConfig.percentual}
                onChange={(e) => setNovaConfig({ ...novaConfig, percentual: e.target.value })}
                placeholder="0,00"
                className="w-32"
              />
            </div>
            <div className="flex-1 min-w-48">
              <Label>Descrição</Label>
              <Input
                value={novaConfig.descricao}
                onChange={(e) => setNovaConfig({ ...novaConfig, descricao: e.target.value })}
                placeholder="Ex: Comissão padrão vendedor"
              />
            </div>
            <Button 
              type="submit" 
              disabled={createMutation.isPending}
              className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Adicionar
            </Button>
          </form>

          {/* Lista */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Percentual</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configuracoes.map((config) => (
                <TableRow key={config.id}>
                  <TableCell className="capitalize font-medium">{config.tipo}</TableCell>
                  <TableCell>{config.percentual}%</TableCell>
                  <TableCell>{config.descricao || '-'}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(config.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {configuracoes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-slate-500 py-8">
                    Nenhuma configuração cadastrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Informações do Sistema */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Informações do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl">
              <p className="text-sm text-slate-500">Versão</p>
              <p className="font-semibold">1.0.0</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl">
              <p className="text-sm text-slate-500">Ambiente</p>
              <p className="font-semibold">Produção</p>
            </div>
          </div>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}