import React, { useState, useMemo } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
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
  Clock,
  BarChart3,
  Users,
  Tag,
  Zap,
  FileText,
  RefreshCw,
  Filter,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Eye,
  Image,
  Video,
  Mic,
  File,
  MessageSquare,
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
  const [abaAtiva, setAbaAtiva] = useState('disparo');

  // ─── Template modal state ───────────────────────────────────────────────────
  const [modalTemplate, setModalTemplate] = useState(null);
  const [formTemplate, setFormTemplate] = useState({ nome: '', categoria: 'marketing', idioma: 'pt_BR', corpo: '', cabecalho: '', rodape: '' });
  const [sincronizando, setSincronizando] = useState(false);
  const [searchTemplate, setSearchTemplate] = useState('');
  const [templateVisualizando, setTemplateVisualizando] = useState(null);

  // ─── Disparo em Massa state ─────────────────────────────────────────────────
  const [busca, setBusca] = useState('');
  const [filtroTag, setFiltroTag] = useState('todas');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [contatosSelecionados, setContatosSelecionados] = useState(new Set());
  const [nomeCampanha, setNomeCampanha] = useState('');
  const [marcarProspeccao, setMarcarProspeccao] = useState(true);
  const [delaySegundos, setDelaySegundos] = useState(7);
  const [pausarApos, setPausarApos] = useState(15);
  const [duracaoPausa, setDuracaoPausa] = useState(120);
  const [tipoMensagem, setTipoMensagem] = useState('template'); // 'texto' | 'imagem' | 'video' | 'template'
  const [templateSelecionado, setTemplateSelecionado] = useState(null);
  const [mensagemTexto, setMensagemTexto] = useState('');
  const [disparando, setDisparando] = useState(false);
  const [apiSelecionada, setApiSelecionada] = useState('meta'); // 'meta' | 'evolution'

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const { data: templates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ['meta-templates', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      try {
        return await base44.entities.CampanhaLog.filter(
          { empresa_id: empresaId, tipo_campanha: 'meta_template_definition' },
          '-created_date', 200
        );
      } catch { return []; }
    },
  });

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

  const { data: contatosWhatsapp = [] } = useQuery({
    queryKey: ['contatos-wpp', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.ContatoWhatsapp.filter({ empresa_id: empresaId }, 'nome', 3000),
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['tags-crm', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      try { return await base44.entities.ContatoTag.filter({ empresa_id: empresaId }); }
      catch { return []; }
    },
  });

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const stats = {
    total: logsDisparo.length,
    enviados: logsDisparo.filter(l => l.status === 'enviada').length,
    lidos: logsDisparo.filter(l => l.status === 'lida').length,
    respondidos: logsDisparo.filter(l => l.status === 'respondida').length,
    erros: logsDisparo.filter(l => l.status === 'erro').length,
  };
  const taxaAbertura = stats.enviados > 0 ? Math.round((stats.lidos / stats.enviados) * 100) : 0;
  const taxaResposta = stats.enviados > 0 ? Math.round((stats.respondidos / stats.enviados) * 100) : 0;

  const parseTemplateDados = (t) => {
    try { return JSON.parse(t.motivo_erro || '{}'); } catch { return {}; }
  };

  const contatosFiltrados = useMemo(() => {
    return contatosWhatsapp.filter(c => {
      const matchBusca = !busca || (c.nome || '').toLowerCase().includes(busca.toLowerCase()) || (c.telefone || '').includes(busca);
      const matchTag = filtroTag === 'todas' || (c.tags_ids || []).includes(filtroTag);
      return matchBusca && matchTag;
    });
  }, [contatosWhatsapp, busca, filtroTag]);

  const templatesFiltrados = useMemo(() => templates.filter(t => {
    const d = parseTemplateDados(t);
    const nome = d.nome || t.cliente_nome || '';
    return !searchTemplate || nome.toLowerCase().includes(searchTemplate.toLowerCase());
  }), [templates, searchTemplate]);

  const templateAprovados = useMemo(() => templates.filter(t => {
    const d = parseTemplateDados(t);
    return d.status_meta === 'aprovado';
  }), [templates]);

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const toggleContato = (id) => {
    setContatosSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selecionarTodos = () => {
    if (contatosSelecionados.size === contatosFiltrados.length) {
      setContatosSelecionados(new Set());
    } else {
      setContatosSelecionados(new Set(contatosFiltrados.map(c => c.id)));
    }
  };

  const contatosSelecionadosLista = contatosFiltrados.filter(c => contatosSelecionados.has(c.id));

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
          status_meta: 'pendente',
        }),
      };
      if (dados.id) return base44.entities.CampanhaLog.update(dados.id, payload);
      return base44.entities.CampanhaLog.create(payload);
    },
    onSuccess: () => {
      toast.success('Template salvo!');
      setModalTemplate(null);
      refetchTemplates();
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  const dispararCampanha = async () => {
    if (!nomeCampanha.trim()) { toast.error('Informe o nome da campanha'); return; }
    if (contatosSelecionados.size === 0) { toast.error('Selecione pelo menos 1 lead'); return; }
    if (tipoMensagem === 'template' && !templateSelecionado) { toast.error('Selecione um template'); return; }
    if (tipoMensagem === 'texto' && !mensagemTexto.trim()) { toast.error('Digite a mensagem'); return; }

    const contatos = contatosSelecionadosLista.map(c => c.telefone).filter(Boolean);

    setDisparando(true);
    try {
      let resp;
      if (tipoMensagem === 'template') {
        const templateDados = parseTemplateDados(templateSelecionado);
        resp = await base44.functions.invoke('dispararCampanhaMetaOficial', {
          empresa_id: empresaId,
          template_name: templateDados.nome,
          template_language: templateDados.idioma || 'pt_BR',
          variaveis: {},
          contatos,
          nome_campanha: nomeCampanha,
          delay_segundos: Number(delaySegundos),
          pausar_apos: Number(pausarApos),
          duracao_pausa: Number(duracaoPausa),
        });
      } else {
        // Modo texto: usar função dedicada de disparo em massa
        resp = await base44.functions.invoke('dispararCampanhaTexto', {
          empresa_id: empresaId,
          contatos,
          mensagem_texto: mensagemTexto,
          nome_campanha: nomeCampanha,
          delay_segundos: Number(delaySegundos),
          api_preferida: apiSelecionada,
        });
        const data = resp?.data;
        toast.success(`✅ Campanha "${nomeCampanha}" disparada: ${data?.enviados || 0} enviados${data?.erros > 0 ? ` | ⚠️ ${data.erros} erros` : ''}`);
        setContatosSelecionados(new Set());
        setNomeCampanha('');
        setMensagemTexto('');
        refetchLogs();
        setDisparando(false);
        return;
      }
      const data = resp?.data;
      toast.success(`✅ Campanha "${nomeCampanha}" disparada: ${data?.enviados || 0} enviados${data?.erros > 0 ? ` | ⚠️ ${data.erros} erros` : ''}`);
      setContatosSelecionados(new Set());
      setNomeCampanha('');
      setTemplateSelecionado(null);
      setMensagemTexto('');
      refetchLogs();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setDisparando(false);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

  const tagNome = (id) => tags.find(t => t.id === id)?.nome || id;

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
          <TabsTrigger value="disparo" className="gap-1.5">
            <Send className="w-4 h-4" /> Disparo em Massa
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5">
            <FileText className="w-4 h-4" /> Templates
            <span className="ml-1 bg-green-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{templates.length}</span>
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5">
            <Zap className="w-4 h-4" /> Histórico de Disparos
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <BarChart3 className="w-4 h-4" /> Dashboard
          </TabsTrigger>
        </TabsList>

        {/* ═══ ABA: DISPARO EM MASSA ════════════════════════════════════════════ */}
        <TabsContent value="disparo">
          <div className="space-y-4">
            {/* Filtros de Seleção */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-500" /> Filtros de Seleção
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-slate-500 mb-1 block">Buscar</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                      <Input
                        placeholder="Nome, email, telefone..."
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        className="pl-8 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500 mb-1 block">Tag</Label>
                    <Select value={filtroTag} onValueChange={setFiltroTag}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas</SelectItem>
                        {tags.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500 mb-1 block">Segmentação</Label>
                    <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas</SelectItem>
                        <SelectItem value="novo">Novo</SelectItem>
                        <SelectItem value="ativo">Ativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Lista de Leads */}
            <Card>
              <CardContent className="pt-4 pb-0">
                {/* Barra de contagem e seleção total */}
                <div className="flex items-center justify-between mb-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-4 text-sm text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-slate-400" />
                      <strong className="text-slate-800">{contatosFiltrados.length}</strong> leads encontrados
                    </span>
                    {contatosSelecionados.size > 0 && (
                      <span className="flex items-center gap-1.5 text-green-700">
                        <CheckCircle2 className="w-4 h-4" />
                        <strong>{contatosSelecionados.size}</strong> selecionados
                      </span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={selecionarTodos}
                  >
                    {contatosSelecionados.size === contatosFiltrados.length && contatosFiltrados.length > 0
                      ? 'Desmarcar Todos'
                      : 'Selecionar Todos'}
                  </Button>
                </div>

                <p className="text-xs font-semibold text-slate-600 mb-2 px-1">Selecionar Leads</p>

                <ScrollArea className="h-[340px] border rounded-lg">
                  <div className="divide-y divide-slate-100">
                    {contatosFiltrados.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
                        <Users className="w-8 h-8 opacity-30" />
                        <p className="text-sm">Nenhum contato encontrado</p>
                      </div>
                    ) : (
                      contatosFiltrados.map(c => {
                        const selecionado = contatosSelecionados.has(c.id);
                        const contatoTags = (c.tags_ids || []).map(tid => tags.find(t => t.id === tid)).filter(Boolean);
                        return (
                          <div
                            key={c.id}
                            className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${selecionado ? 'bg-green-50' : ''}`}
                            onClick={() => toggleContato(c.id)}
                          >
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selecionado ? 'bg-green-500 border-green-500' : 'border-slate-300'}`}>
                              {selecionado && <CheckCircle2 className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">{c.nome || c.telefone}</p>
                              <p className="text-xs text-slate-400">{c.telefone}</p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {contatoTags.map(t => (
                                <span
                                  key={t.id}
                                  className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
                                  style={{ backgroundColor: (t.cor || '#6b7280') + '22', color: t.cor || '#6b7280', borderColor: (t.cor || '#6b7280') + '55' }}
                                >
                                  {t.nome}
                                </span>
                              ))}
                              <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                {c.status || 'novo'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </CardContent>

              {/* ─── Configurações da Campanha ──────────────────────────────────── */}
              <CardContent className="pt-4 space-y-4">
                {/* Nome */}
                <div>
                  <Label className="text-sm font-semibold mb-1 block">
                    Nome da Campanha <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={nomeCampanha}
                    onChange={e => setNomeCampanha(e.target.value)}
                    placeholder="Ex: Promoção Black Friday 2024"
                    className="text-sm"
                  />
                  <p className="text-xs text-slate-400 mt-1">Dê um nome descritivo para identificar esta campanha nos relatórios</p>
                </div>

                {/* Marcar prospecção */}
                <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center cursor-pointer flex-shrink-0 mt-0.5 ${marcarProspeccao ? 'bg-green-500' : 'border-2 border-slate-300'}`}
                    onClick={() => setMarcarProspeccao(!marcarProspeccao)}
                  >
                    {marcarProspeccao && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-green-900">Marcar leads selecionados para prospecção</p>
                    <p className="text-xs text-green-700 mt-0.5">Adiciona automaticamente todos os leads desta campanha à fila de prospecção (canal WhatsApp) — eles aparecerão no módulo Prospecção.</p>
                  </div>
                </div>

                {/* Configurações de Timing */}
                <div className="border rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-500" /> Configurações de Timing
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs text-slate-500 mb-1 block">Delay entre mensagens (segundos)</Label>
                      <Input type="number" value={delaySegundos} onChange={e => setDelaySegundos(e.target.value)} className="text-sm" min={1} />
                      <p className="text-[10px] text-slate-400 mt-0.5">Recomendado: 5-10 segundos</p>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500 mb-1 block">Pausar após (mensagens)</Label>
                      <Input type="number" value={pausarApos} onChange={e => setPausarApos(e.target.value)} className="text-sm" min={0} />
                      <p className="text-[10px] text-slate-400 mt-0.5">0 = sem pausa automática</p>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500 mb-1 block">Duração da pausa (segundos)</Label>
                      <Input type="number" value={duracaoPausa} onChange={e => setDuracaoPausa(e.target.value)} className="text-sm" min={0} />
                      <p className="text-[10px] text-slate-400 mt-0.5">Ex: 120 = 2 minutos</p>
                    </div>
                  </div>
                </div>

                {/* Mensagem da Campanha */}
                <div className="border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-500" /> Mensagem da Campanha
                    </p>
                    <div className="flex gap-1">
                      {['Texto', 'Imagem', 'Vídeo', 'Template'].map(tipo => (
                        <button
                          key={tipo}
                          onClick={() => setTipoMensagem(tipo.toLowerCase())}
                          className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                            tipoMensagem === tipo.toLowerCase()
                              ? tipo === 'Template' ? 'bg-green-600 text-white' : 'bg-slate-700 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {tipo === 'Template' && <span className="mr-1">📱</span>}{tipo}
                          {tipo === 'Template' && <span className="ml-1 text-[9px] bg-white/20 px-1 rounded">Meta</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  {tipoMensagem === 'template' && (
                    <div className="space-y-3">
                      {templateAprovados.length === 0 ? (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          Nenhum template aprovado encontrado. Sincronize ou crie um template na aba Templates.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {templateAprovados.map(t => {
                            const d = parseTemplateDados(t);
                            const selecionado = templateSelecionado?.id === t.id;
                            return (
                              <div
                                key={t.id}
                                onClick={() => setTemplateSelecionado(selecionado ? null : t)}
                                className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${selecionado ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-slate-300'}`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${selecionado ? 'bg-green-500 border-green-500' : 'border-slate-300'}`} />
                                    <p className="text-sm font-semibold text-slate-900">{d.nome || t.cliente_nome}</p>
                                  </div>
                                  <div className="flex gap-1">
                                    <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Aprovado</Badge>
                                    {d.categoria && <Badge variant="outline" className="text-[10px]">{d.categoria}</Badge>}
                                  </div>
                                </div>
                                {d.corpo && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 pl-6">{d.corpo}</p>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        ℹ️ Templates Meta API: Mensagens com templates são enviadas via API oficial do WhatsApp e funcionam mesmo para contatos fora da janela de 24 horas.
                      </p>
                    </div>
                  )}

                  {tipoMensagem === 'texto' && (
                    <div className="space-y-3">
                      <Textarea
                        value={mensagemTexto}
                        onChange={e => setMensagemTexto(e.target.value)}
                        placeholder={"Olá! 👋 Temos uma oferta especial para você. Entre em contato conosco!"}
                        rows={5}
                        className="text-sm resize-none"
                      />
                      {/* Seletor de API */}
                      <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                        <p className="text-xs font-semibold text-slate-600">API de Envio</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setApiSelecionada('meta')}
                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all ${
                              apiSelecionada === 'meta'
                                ? 'border-green-500 bg-green-50 text-green-700'
                                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                            }`}
                          >
                            <span>📱</span> API Oficial Meta
                            {apiSelecionada === 'meta' && <span className="ml-1 bg-green-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">Selecionado</span>}
                          </button>
                          <button
                            onClick={() => setApiSelecionada('evolution')}
                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all ${
                              apiSelecionada === 'evolution'
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                            }`}
                          >
                            <span>⚡</span> Evolution API
                            {apiSelecionada === 'evolution' && <span className="ml-1 bg-blue-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">Selecionado</span>}
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {apiSelecionada === 'meta'
                            ? '⚠️ API Meta só envia para contatos dentro da janela de 24h (ou use Templates para contatos fora da janela).'
                            : '⚠️ Evolution API requer que o contato esteja dentro da janela de 24h de conversas ativas.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {(tipoMensagem === 'imagem' || tipoMensagem === 'vídeo') && (
                    <div className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-slate-200 rounded-lg text-slate-400">
                      <p className="text-sm">Modo "{tipoMensagem}" em desenvolvimento</p>
                      <p className="text-xs mt-1">Use o modo Template ou Texto por enquanto</p>
                    </div>
                  )}
                </div>

                {/* Rodapé: status + botão */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <p className="text-sm text-slate-500">
                    {templateSelecionado
                      ? <span className="text-green-700 font-medium">✓ Template: {parseTemplateDados(templateSelecionado).nome}</span>
                      : <span className="text-slate-400">Nenhum template selecionado</span>}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setContatosSelecionados(new Set()); setNomeCampanha(''); setTemplateSelecionado(null); }}
                    >
                      ✕ Limpar
                    </Button>
                    <Button
                      size="sm"
                      className="gap-2 bg-green-600 hover:bg-green-700"
                      onClick={dispararCampanha}
                      disabled={disparando || contatosSelecionados.size === 0 || !nomeCampanha.trim() || (tipoMensagem === 'template' && !templateSelecionado) || (tipoMensagem === 'texto' && !mensagemTexto.trim())}
                    >
                      {disparando
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Disparando...</>
                        : <><Send className="w-4 h-4" /> Enviar para Leads ({contatosSelecionados.size})</>}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ ABA: TEMPLATES ══════════════════════════════════════════════════ */}
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
                    onClick={() => { setFormTemplate({ nome: '', categoria: 'marketing', idioma: 'pt_BR', corpo: '', cabecalho: '', rodape: '' }); setModalTemplate('novo'); }}
                  >
                    <Plus className="w-4 h-4" /> Novo Template
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <Input placeholder="Buscar template por nome..." value={searchTemplate} onChange={e => setSearchTemplate(e.target.value)} className="pl-9" />
              </div>

              {templatesFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2 border rounded-lg">
                  <FileText className="w-10 h-10 opacity-30" />
                  <p className="text-sm">Nenhum template cadastrado</p>
                  <p className="text-xs">Crie um template ou sincronize com a Meta</p>
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
                            {d.corpo && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{d.corpo}</p>}
                            {d.cabecalho && <p className="text-[10px] text-slate-400 mt-1">Cabeçalho: {d.cabecalho}</p>}
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                             <Button size="sm" variant="outline" onClick={() => setTemplateVisualizando(t)} title="Visualizar template">
                               <Eye className="w-3.5 h-3.5" />
                             </Button>
                             <Button size="sm" variant="outline" onClick={() => { setFormTemplate({ ...d, id: t.id }); setModalTemplate(t); }}>
                               <Pencil className="w-3.5 h-3.5" />
                             </Button>
                             {statusMeta === 'aprovado' ? (
                               <Button size="sm" className="gap-1 text-xs bg-green-600 hover:bg-green-700" onClick={() => { setTemplateSelecionado(t); setAbaAtiva('disparo'); }}>
                                 <Send className="w-3.5 h-3.5" /> Usar no Disparo
                               </Button>
                             ) : (
                               <Button size="sm" variant="outline" className="gap-1 text-xs text-slate-400" disabled>
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

        {/* ═══ ABA: HISTÓRICO ══════════════════════════════════════════════════ */}
        <TabsContent value="historico">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="w-5 h-5 text-amber-500" /> Histórico de Disparos — Meta Oficial
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
                          {l.motivo_erro && l.status === 'erro' && <p className="text-xs text-red-500 mt-0.5">⚠️ {l.motivo_erro}</p>}
                        </div>
                        <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                          <span className="text-xs text-slate-400">{formatDate(l.created_date)}</span>
                          <Badge className={
                            l.status === 'enviada' ? 'bg-blue-100 text-blue-700' :
                            l.status === 'lida' ? 'bg-emerald-100 text-emerald-700' :
                            l.status === 'respondida' ? 'bg-purple-100 text-purple-700' :
                            'bg-red-100 text-red-700'
                          }>
                            {l.status === 'enviada' ? '✓ Enviada' : l.status === 'lida' ? '👁 Lida' : l.status === 'respondida' ? '💬 Respondida' : '✗ Erro'}
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

        {/* ═══ ABA: DASHBOARD ══════════════════════════════════════════════════ */}
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
                        <div className={`h-full ${m.color} rounded-full`} style={{ width: `${pct}%` }} />
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
                              size="sm" variant="outline" className="text-xs h-7 gap-1"
                              disabled={count === 0}
                              onClick={() => { setFiltroTag(tag.id); setAbaAtiva('disparo'); }}
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

      {/* ─── Modal Visualizar Template ────────────────────────────────────────── */}
      {templateVisualizando && (() => {
        const d = parseTemplateDados(templateVisualizando);
        const statusMeta = d.status_meta || 'pendente';
        const statusInfo = STATUS_TEMPLATE[statusMeta] || STATUS_TEMPLATE.pendente;

        const TIPOS_MIDIA = [
          { tipo: 'texto', icon: <MessageSquare className="w-5 h-5 text-blue-500" />, label: 'Texto', desc: 'Mensagem somente com texto e variáveis personalizadas.' },
          { tipo: 'imagem', icon: <Image className="w-5 h-5 text-emerald-500" />, label: 'Imagem', desc: 'Cabeçalho com imagem (JPG, PNG) + corpo de texto.' },
          { tipo: 'video', icon: <Video className="w-5 h-5 text-purple-500" />, label: 'Vídeo', desc: 'Cabeçalho com vídeo (MP4) + corpo de texto.' },
          { tipo: 'audio', icon: <Mic className="w-5 h-5 text-amber-500" />, label: 'Áudio', desc: 'Mensagem de voz ou arquivo de áudio.' },
          { tipo: 'documento', icon: <File className="w-5 h-5 text-red-500" />, label: 'Documento PDF', desc: 'Cabeçalho com arquivo PDF/documento + corpo de texto.' },
        ];

        const tipoAtual = d.tipo_midia || 'texto';

        return (
          <Dialog open={!!templateVisualizando} onOpenChange={v => !v && setTemplateVisualizando(null)}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-blue-600" />
                  Visualizar Template
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-1">
                {/* Header info */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900 text-base">{d.nome || templateVisualizando.cliente_nome}</span>
                  <Badge className={`text-[10px] border ${statusInfo.color}`}>{statusInfo.label}</Badge>
                  {d.categoria && <Badge variant="outline" className="text-[10px]">{d.categoria}</Badge>}
                  {d.idioma && <Badge variant="outline" className="text-[10px]">{d.idioma}</Badge>}
                </div>

                {/* Preview estilo WhatsApp */}
                <div className="bg-[#e5ddd5] rounded-xl p-4">
                  <p className="text-[10px] text-slate-500 mb-2 font-medium uppercase tracking-wide">Prévia da mensagem</p>
                  <div className="bg-white rounded-xl shadow-sm max-w-xs ml-auto p-3 space-y-1.5">
                    {d.cabecalho && (
                      <p className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-1.5">{d.cabecalho}</p>
                    )}
                    {d.corpo && (
                      <p className="text-sm text-slate-800 whitespace-pre-wrap">{d.corpo}</p>
                    )}
                    {d.rodape && (
                      <p className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">{d.rodape}</p>
                    )}
                    <p className="text-[10px] text-slate-400 text-right">agora ✓✓</p>
                  </div>
                </div>

                {/* Tipos de mídia suportados */}
                <div className="border rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-500" />
                    Tipos de Template Suportados pela Meta
                  </p>
                  <p className="text-xs text-slate-500">
                    Os templates Meta Oficial suportam os seguintes tipos de conteúdo para o <strong>cabeçalho</strong>:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {TIPOS_MIDIA.map(m => (
                      <div
                        key={m.tipo}
                        className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-colors ${
                          tipoAtual === m.tipo
                            ? 'border-green-400 bg-green-50'
                            : 'border-slate-100 bg-slate-50'
                        }`}
                      >
                        <div className="flex-shrink-0 mt-0.5">{m.icon}</div>
                        <div>
                          <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                            {m.label}
                            {tipoAtual === m.tipo && (
                              <span className="text-[9px] bg-green-500 text-white px-1.5 py-0.5 rounded-full">Este template</span>
                            )}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{m.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    ⚠️ Para criar templates com mídia (imagem, vídeo, documento), acesse o <strong>Meta Business Manager</strong> e selecione o tipo de cabeçalho ao criar o modelo.
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setTemplateVisualizando(null)}>Fechar</Button>
                {statusMeta === 'aprovado' && (
                  <Button
                    className="gap-2 bg-green-600 hover:bg-green-700"
                    onClick={() => { setTemplateSelecionado(templateVisualizando); setAbaAtiva('disparo'); setTemplateVisualizando(null); }}
                  >
                    <Send className="w-4 h-4" /> Usar no Disparo
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ─── Modal Criar/Editar Template ──────────────────────────────────────── */}
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
                placeholder={"Olá {{1}}! 👋\n\nTemos uma oferta especial para você."}
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
    </div>
  );
}