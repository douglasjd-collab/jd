import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Send,
  Loader2,
  Search,
  Plus,
  Pencil,
  Trash2,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  BarChart3,
  Users,
  Tag,
  Zap,
  FileText,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_TEMPLATE = {
  pendente: { label: 'Pendente', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  aprovado: { label: 'Aprovado', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejeitado: { label: 'Rejeitado', color: 'bg-red-100 text-red-700 border-red-200' },
};

const CATEGORIAS = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'utility', label: 'Utilidade' },
  { value: 'authentication', label: 'Autenticação' },
];

const IDIOMAS = [
  { value: 'pt_BR', label: 'Português (Brasil)' },
  { value: 'en_US', label: 'Inglês (EUA)' },
  { value: 'es', label: 'Espanhol' },
];

export default function CampanhaMetaOficial({ empresaId }) {
  const queryClient = useQueryClient();
  const [abaAtiva, setAbaAtiva] = useState('templates');
  const [searchTemplate, setSearchTemplate] = useState('');
  const [modalTemplate, setModalTemplate] = useState(null); // null | 'novo' | objeto
  const [modalDisparo, setModalDisparo] = useState(null); // template selecionado para disparar
  const [formTemplate, setFormTemplate] = useState({ nome: '', categoria: 'marketing', idioma: 'pt_BR', corpo: '', cabecalho: '', rodape: '', botoes: '' });
  const [tagFiltro, setTagFiltro] = useState('');
  const [disparoContatos, setDisparoContatos] = useState(''); // telefones separados por linha
  const [disparoVariaveis, setDisparoVariaveis] = useState({}); // { var1: '', var2: '' }
  const [sincronizando, setSincronizando] = useState(false);

  // Buscar templates salvos localmente
  const { data: templates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ['meta-templates', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      try {
        const logs = await base44.entities.CampanhaLog.filter(
          { empresa_id: empresaId, tipo_campanha: 'meta_template_definition' },
          '-created_date', 200
        );
        return logs;
      } catch { return []; }
    },
  });

  // Buscar logs de disparo da Meta Oficial
  const { data: logsDisparo = [], refetch: refetchLogs } = useQuery({
    queryKey: ['meta-disparos', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      try {
        return await base44.entities.CampanhaLog.filter(
          { empresa_id: empresaId, tipo_campanha: 'meta_oficial' },
          '-created_date', 1000
        );
      } catch { return []; }
    },
  });

  // Buscar contatos com tags
  const { data: contatosWhatsapp = [] } = useQuery({
    queryKey: ['contatos-wpp', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.ContatoWhatsapp.filter({ empresa_id: empresaId }, 'nome', 2000),
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['tags-crm', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      try { return await base44.entities.ContatoTag.filter({ empresa_id: empresaId }); }
      catch { return []; }
    },
  });

  // Estatísticas de disparos
  const stats = {
    total: logsDisparo.length,
    enviados: logsDisparo.filter(l => l.status === 'enviada').length,
    lidos: logsDisparo.filter(l => l.status === 'lida').length,
    respondidos: logsDisparo.filter(l => l.status === 'respondida').length,
    erros: logsDisparo.filter(l => l.status === 'erro').length,
  };

  const taxaAbertura = stats.enviados > 0 ? Math.round((stats.lidos / stats.enviados) * 100) : 0;
  const taxaResposta = stats.enviados > 0 ? Math.round((stats.respondidos / stats.enviados) * 100) : 0;

  // Contatos filtrados por tag
  const contatosFiltradosPorTag = tagFiltro
    ? contatosWhatsapp.filter(c => (c.tags_ids || []).includes(tagFiltro))
    : contatosWhatsapp;

  // Sincronizar templates com a Meta
  const sincronizarTemplates = async () => {
    setSincronizando(true);
    try {
      const resp = await base44.functions.invoke('sincronizarTemplatesMeta', { empresa_id: empresaId });
      if (resp?.data?.ok) {
        toast.success(`✅ ${resp.data.total} templates sincronizados da Meta`);
        refetchTemplates();
      } else {
        toast.error('Erro ao sincronizar: ' + (resp?.data?.error || 'Desconhecido'));
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSincronizando(false);
    }
  };

  // Salvar template localmente (rascunho para submeter à Meta depois)
  const salvarTemplateMutation = useMutation({
    mutationFn: async (dados) => {
      const payload = {
        empresa_id: empresaId,
        tipo_campanha: 'meta_template_definition',
        cliente_nome: dados.nome,
        cliente_telefone: dados.categoria,
        status: 'pendente',
        motivo_erro: JSON.stringify({
          nome: dados.nome,
          categoria: dados.categoria,
          idioma: dados.idioma,
          corpo: dados.corpo,
          cabecalho: dados.cabecalho,
          rodape: dados.rodape,
          botoes: dados.botoes,
          status_meta: 'pendente',
        }),
      };
      if (dados.id) {
        return base44.entities.CampanhaLog.update(dados.id, payload);
      }
      return base44.entities.CampanhaLog.create(payload);
    },
    onSuccess: () => {
      toast.success('Template salvo!');
      setModalTemplate(null);
      refetchTemplates();
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  // Disparar campanha Meta Oficial
  const dispararMutation = useMutation({
    mutationFn: async ({ template, contatos, variaveis }) => {
      if (!contatos.length) throw new Error('Selecione pelo menos 1 contato');
      const resp = await base44.functions.invoke('dispararCampanhaMetaOficial', {
        empresa_id: empresaId,
        template_name: template.nome || parseTemplateDados(template).nome,
        variaveis,
        contatos,
      });
      return resp?.data;
    },
    onSuccess: (data) => {
      toast.success(`✅ Campanha disparada: ${data?.enviados || 0} enviados${data?.erros > 0 ? ` | ⚠️ ${data.erros} erros` : ''}`);
      setModalDisparo(null);
      refetchLogs();
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  const parseTemplateDados = (t) => {
    try { return JSON.parse(t.motivo_erro || '{}'); } catch { return {}; }
  };

  const templatesFiltrados = templates.filter(t => {
    const d = parseTemplateDados(t);
    const nome = d.nome || t.cliente_nome || '';
    return !searchTemplate || nome.toLowerCase().includes(searchTemplate.toLowerCase());
  });

  const abrirDisparo = (template) => {
    const dados = parseTemplateDados(template);
    // Detectar variáveis no corpo: {{1}}, {{2}}, etc.
    const vars = [];
    const matches = (dados.corpo || '').matchAll(/\{\{(\d+)\}\}/g);
    for (const m of matches) { if (!vars.includes(m[1])) vars.push(m[1]); }
    const initVars = {};
    vars.forEach(v => { initVars[v] = ''; });
    setDisparoVariaveis(initVars);
    setDisparoContatos('');
    setTagFiltro('');
    setModalDisparo(template);
  };

  const contatosDoDisparo = () => {
    // Telefones manuais + tag selecionada
    const manuais = disparoContatos.split('\n').map(t => t.trim()).filter(Boolean);
    const porTag = tagFiltro ? contatosFiltradosPorTag.map(c => c.telefone).filter(Boolean) : [];
    const todos = [...new Set([...manuais, ...porTag])];
    return todos;
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Enviados', value: stats.enviados, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Lidos', value: stats.lidos, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Respondidos', value: stats.respondidos, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Taxa Abertura', value: `${taxaAbertura}%`, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Taxa Resposta', value: `${taxaResposta}%`, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
        <TabsList>
          <TabsTrigger value="templates" className="gap-1.5">
            <FileText className="w-4 h-4" /> Templates
            <span className="ml-1 bg-green-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{templates.length}</span>
          </TabsTrigger>
          <TabsTrigger value="disparos" className="gap-1.5">
            <Zap className="w-4 h-4" /> Histórico de Disparos
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <BarChart3 className="w-4 h-4" /> Dashboard
          </TabsTrigger>
        </TabsList>

        {/* ABA: Templates */}
        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="w-5 h-5 text-green-600" />
                    Templates de Mensagem — Meta Oficial
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-1">
                    Templates precisam ser aprovados pela Meta antes de usar em campanhas em massa.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={sincronizarTemplates} disabled={sincronizando}>
                    {sincronizando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Sincronizar da Meta
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 bg-green-600 hover:bg-green-700"
                    onClick={() => { setFormTemplate({ nome: '', categoria: 'marketing', idioma: 'pt_BR', corpo: '', cabecalho: '', rodape: '', botoes: '' }); setModalTemplate('novo'); }}
                  >
                    <Plus className="w-4 h-4" /> Novo Template
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar template por nome..."
                  value={searchTemplate}
                  onChange={e => setSearchTemplate(e.target.value)}
                  className="pl-9"
                />
              </div>

              {templatesFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2 border rounded-lg">
                  <FileText className="w-10 h-10 opacity-30" />
                  <p className="text-sm">Nenhum template cadastrado</p>
                  <p className="text-xs text-slate-400">Crie um template ou sincronize com a Meta</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {templatesFiltrados.map(t => {
                    const d = parseTemplateDados(t);
                    const statusMeta = d.status_meta || 'pendente';
                    const statusInfo = STATUS_TEMPLATE[statusMeta] || STATUS_TEMPLATE.pendente;
                    return (
                      <div key={t.id} className="border rounded-xl p-4 bg-white hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm text-slate-900">{d.nome || t.cliente_nome}</p>
                              <Badge className={`text-[10px] border ${statusInfo.color}`}>{statusInfo.label}</Badge>
                              {d.categoria && <Badge variant="outline" className="text-[10px]">{d.categoria}</Badge>}
                              {d.idioma && <Badge variant="outline" className="text-[10px]">{d.idioma}</Badge>}
                            </div>
                            {d.corpo && (
                              <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{d.corpo}</p>
                            )}
                            {d.cabecalho && (
                              <p className="text-[10px] text-slate-400 mt-1">Cabeçalho: {d.cabecalho}</p>
                            )}
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-xs"
                              onClick={() => { setFormTemplate({ ...d, id: t.id }); setModalTemplate(t); }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            {statusMeta === 'aprovado' && (
                              <Button
                                size="sm"
                                className="gap-1 text-xs bg-green-600 hover:bg-green-700"
                                onClick={() => abrirDisparo(t)}
                              >
                                <Send className="w-3.5 h-3.5" /> Disparar
                              </Button>
                            )}
                            {statusMeta !== 'aprovado' && (
                              <Button size="sm" variant="outline" className="gap-1 text-xs text-slate-400" disabled title="Aguardando aprovação da Meta">
                                <Clock className="w-3.5 h-3.5" /> Aguardando
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA: Disparos */}
        <TabsContent value="disparos">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="w-5 h-5 text-amber-500" />
                Histórico de Disparos — Meta Oficial
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[520px] border rounded-lg">
                <div className="p-3 space-y-2">
                  {logsDisparo.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                      <Zap className="w-10 h-10 opacity-30" />
                      <p className="text-sm">Nenhum disparo realizado ainda</p>
                    </div>
                  ) : (
                    logsDisparo.map(l => (
                      <div key={l.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-slate-900 truncate">{l.cliente_nome || '-'}</p>
                          <p className="text-xs text-slate-500">{l.cliente_telefone}</p>
                          {l.motivo_erro && l.status === 'erro' && (
                            <p className="text-xs text-red-500 mt-0.5">⚠️ {l.motivo_erro}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                          <span className="text-xs text-slate-400">{formatDate(l.created_date)}</span>
                          <Badge className={
                            l.status === 'enviada' ? 'bg-blue-100 text-blue-700' :
                            l.status === 'lida' ? 'bg-emerald-100 text-emerald-700' :
                            l.status === 'respondida' ? 'bg-purple-100 text-purple-700' :
                            'bg-red-100 text-red-700'
                          }>
                            {l.status === 'enviada' ? '✓ Enviada' :
                             l.status === 'lida' ? '👁 Lida' :
                             l.status === 'respondida' ? '💬 Respondida' :
                             '✗ Erro'}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA: Dashboard */}
        <TabsContent value="dashboard">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-500" /> Métricas de Engajamento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: 'Mensagens Enviadas', value: stats.enviados, total: stats.total, color: 'bg-blue-500' },
                  { label: 'Mensagens Lidas', value: stats.lidos, total: stats.enviados, color: 'bg-emerald-500' },
                  { label: 'Respostas Recebidas', value: stats.respondidos, total: stats.enviados, color: 'bg-purple-500' },
                  { label: 'Erros de Envio', value: stats.erros, total: stats.total, color: 'bg-red-500' },
                ].map(m => {
                  const pct = m.total > 0 ? Math.round((m.value / m.total) * 100) : 0;
                  return (
                    <div key={m.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-600">{m.label}</span>
                        <span className="text-sm font-bold text-slate-900">{m.value} <span className="text-slate-400 font-normal text-xs">({pct}%)</span></span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${m.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Tag className="w-5 h-5 text-purple-500" /> Segmentação por Tags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {tags.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">Nenhuma tag criada. Crie em Contatos CRM.</p>
                  ) : (
                    tags.map(tag => {
                      const count = contatosWhatsapp.filter(c => (c.tags_ids || []).includes(tag.id)).length;
                      return (
                        <div key={tag.id} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.cor || '#6b7280' }} />
                            <span className="text-sm font-medium text-slate-700">{tag.nome}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">{count} contatos</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 gap-1"
                              disabled={count === 0}
                              onClick={() => {
                                // Ir para aba templates para disparar
                                setAbaAtiva('templates');
                                toast.info(`Selecione um template e use a tag "${tag.nome}" no disparo`);
                              }}
                            >
                              <Send className="w-3 h-3" /> Disparar
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal: Criar/Editar Template */}
      <Dialog open={!!modalTemplate} onOpenChange={v => !v && setModalTemplate(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-green-600" />
              {modalTemplate === 'novo' ? 'Novo Template' : 'Editar Template'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              ⚠️ Templates precisam ser <strong>aprovados pela Meta</strong> antes de usar. Após salvar, envie para revisão no Meta Business Manager.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Nome do template *</Label>
                <Input
                  value={formTemplate.nome}
                  onChange={e => setFormTemplate(p => ({ ...p, nome: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                  placeholder="ex: boas_vindas_consorcio"
                  className="text-sm"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Apenas minúsculas e underscores</p>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Categoria *</Label>
                <Select value={formTemplate.categoria} onValueChange={v => setFormTemplate(p => ({ ...p, categoria: v }))}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Idioma</Label>
              <Select value={formTemplate.idioma} onValueChange={v => setFormTemplate(p => ({ ...p, idioma: v }))}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IDIOMAS.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Cabeçalho (opcional)</Label>
              <Input value={formTemplate.cabecalho} onChange={e => setFormTemplate(p => ({ ...p, cabecalho: e.target.value }))} placeholder="Texto do cabeçalho..." className="text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Corpo da mensagem *</Label>
              <Textarea
                value={formTemplate.corpo}
                onChange={e => setFormTemplate(p => ({ ...p, corpo: e.target.value }))}
                placeholder={"Olá {{1}}! 👋\n\nTemos uma oferta especial para você.\n\nValor: {{2}}"}
                rows={5}
                className="text-sm resize-none"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">Use {'{{1}}'}, {'{{2}}'} para variáveis personalizadas</p>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Rodapé (opcional)</Label>
              <Input value={formTemplate.rodape} onChange={e => setFormTemplate(p => ({ ...p, rodape: e.target.value }))} placeholder="Ex: Para não receber mais mensagens, responda SAIR" className="text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalTemplate(null)}>Cancelar</Button>
            <Button
              className="gap-2 bg-green-600 hover:bg-green-700"
              onClick={() => salvarTemplateMutation.mutate({ ...formTemplate, id: modalTemplate !== 'novo' ? modalTemplate?.id : undefined })}
              disabled={salvarTemplateMutation.isPending || !formTemplate.nome || !formTemplate.corpo}
            >
              {salvarTemplateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Salvar Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Disparar Campanha */}
      {modalDisparo && (
        <Dialog open={!!modalDisparo} onOpenChange={v => !v && setModalDisparo(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-green-600" />
                Disparar Campanha — Meta Oficial
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-1">
              {/* Info template */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-green-900">{parseTemplateDados(modalDisparo).nome}</p>
                <p className="text-xs text-green-700 mt-1 line-clamp-3">{parseTemplateDados(modalDisparo).corpo}</p>
              </div>

              {/* Variáveis */}
              {Object.keys(disparoVariaveis).length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Preencher variáveis</Label>
                  {Object.keys(disparoVariaveis).map(v => (
                    <div key={v}>
                      <Label className="text-xs mb-1 block text-slate-500">{'{{' + v + '}}'}</Label>
                      <Input
                        value={disparoVariaveis[v]}
                        onChange={e => setDisparoVariaveis(prev => ({ ...prev, [v]: e.target.value }))}
                        placeholder={`Valor para a variável ${v}`}
                        className="text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Seleção por tag */}
              <div>
                <Label className="text-xs font-semibold mb-1 block flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" /> Segmentar por tag (opcional)
                </Label>
                <Select value={tagFiltro} onValueChange={setTagFiltro}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Selecionar tag..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Sem filtro de tag</SelectItem>
                    {tags.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome} ({contatosWhatsapp.filter(c => (c.tags_ids || []).includes(t.id)).length} contatos)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tagFiltro && (
                  <p className="text-xs text-green-700 mt-1">
                    ✓ {contatosFiltradosPorTag.length} contatos selecionados pela tag
                  </p>
                )}
              </div>

              {/* Telefones manuais */}
              <div>
                <Label className="text-xs font-semibold mb-1 block">Telefones adicionais (um por linha)</Label>
                <Textarea
                  value={disparoContatos}
                  onChange={e => setDisparoContatos(e.target.value)}
                  placeholder={"5511999998888\n5521999997777\n..."}
                  rows={4}
                  className="text-sm resize-none font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Formato: código do país + DDD + número (ex: 5511999998888)</p>
              </div>

              <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm text-slate-600">Total de destinatários:</span>
                <span className="text-lg font-bold text-green-700">{contatosDoDisparo().length}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalDisparo(null)}>Cancelar</Button>
              <Button
                className="gap-2 bg-green-600 hover:bg-green-700"
                onClick={() => dispararMutation.mutate({
                  template: modalDisparo,
                  contatos: contatosDoDisparo(),
                  variaveis: disparoVariaveis,
                })}
                disabled={dispararMutation.isPending || contatosDoDisparo().length === 0}
              >
                {dispararMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Disparando...</>
                  : <><Send className="w-4 h-4" /> Disparar para {contatosDoDisparo().length} contatos</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}