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
  Upload,
  X,
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
  const [formTemplate, setFormTemplate] = useState({ nome: '', categoria: 'marketing', idioma: 'pt_BR', corpo: '', cabecalho: '', rodape: '', tipo_cabecalho: 'TEXT', cabecalho_midia_url: '', botoes: [] });
  const [sincronizando, setSincronizando] = useState(false);
  const [uploadingMidia, setUploadingMidia] = useState(false);
  const [searchTemplate, setSearchTemplate] = useState('');
  const [templateVisualizando, setTemplateVisualizando] = useState(null);
  const [criandoNaMeta, setCriandoNaMeta] = useState(false);

  // ─── Disparo em Massa state ─────────────────────────────────────────────────
  const [busca, setBusca] = useState('');
  const [filtroTag, setFiltroTag] = useState('todas');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroHistoricoDisparo, setFiltroHistoricoDisparo] = useState('todos');
  const [contatosSelecionados, setContatosSelecionados] = useState(new Set());
  const [nomeCampanha, setNomeCampanha] = useState('');
  const [marcarProspeccao, setMarcarProspeccao] = useState(true);
  const [delaySegundos, setDelaySegundos] = useState(7);
  const [pausarApos, setPausarApos] = useState(15);
  const [duracaoPausa, setDuracaoPausa] = useState(120);
  const [tipoMensagem, setTipoMensagem] = useState('template'); // 'texto' | 'imagem' | 'video' | 'template'
  const [templateSelecionado, setTemplateSelecionado] = useState(null);
  const [templateHeaderUrlInput, setTemplateHeaderUrlInput] = useState('');
  const [mensagemTexto, setMensagemTexto] = useState('');
  const [disparando, setDisparando] = useState(false);
  const [progressoEnvio, setProgressoEnvio] = useState({ enviados: 0, total: 0, status: '' });
  const [apiSelecionada, setApiSelecionada] = useState('meta'); // 'meta' | 'evolution'
  // ─── Funil de Vendas state ──────────────────────────────────────────────────
  const [adicionarAoFunil, setAdicionarAoFunil] = useState(false);
  const [funilSelecionado, setFunilSelecionado] = useState('');
  const [etapaSelecionada, setEtapaSelecionada] = useState('');
  const [colaboradorAtual, setColaboradorAtual] = useState(null);

  // Buscar colaborador atual
  useQuery({
    queryKey: ['colaborador-atual-campanha', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const me = await base44.auth.me();
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, empresa_id: empresaId, status: 'ativo' });
      const colab = colabs[0] || null;
      setColaboradorAtual(colab);
      return colab;
    },
  });

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

  const { data: etapasFunil = [] } = useQuery({
    queryKey: ['etapas-funil-campanha', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.EtapaFunil.filter({ empresa_id: empresaId, status: 'ativa' }, 'ordem', 200),
  });

  // Derivar funis únicos a partir das etapas
  const funisDisponiveis = useMemo(() => {
    const produtos = [...new Set(etapasFunil.map(e => e.produto).filter(Boolean))];
    const funisBase = ['consorcio', 'emprestimo'];
    const todosProdutos = [...new Set([...funisBase, ...produtos])];
    return todosProdutos.map(p => ({
      value: p,
      label: p === 'consorcio' ? 'Consórcio' : p === 'emprestimo' ? 'Empréstimo Consignado' : p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    }));
  }, [etapasFunil]);

  const etapasDoProduto = useMemo(() => {
    if (!funilSelecionado) return [];
    return etapasFunil.filter(e => {
      if (funilSelecionado === 'consorcio') return !e.produto || e.produto === 'consorcio';
      if (funilSelecionado === 'emprestimo') return e.produto === 'emprestimo';
      return e.produto === funilSelecionado;
    });
  }, [etapasFunil, funilSelecionado]);

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

  // Mapa: telefone -> último log de disparo (para filtro de histórico)
  const ultimoDisparoPorTelefone = useMemo(() => {
    const mapa = {};
    logsDisparo.forEach(l => {
      if (!l.cliente_telefone || l.status === 'erro') return;
      const tel = l.cliente_telefone;
      if (!mapa[tel] || l.created_date > mapa[tel].created_date) {
        mapa[tel] = l;
      }
    });
    return mapa;
  }, [logsDisparo]);

  const contatosFiltrados = useMemo(() => {
    const agora = new Date();
    return contatosWhatsapp.filter(c => {
      const matchBusca = !busca || (c.nome || '').toLowerCase().includes(busca.toLowerCase()) || (c.telefone || '').includes(busca);
      const matchTag = filtroTag === 'todas' || (c.tags_ids || []).includes(filtroTag);

      const ultimoLog = ultimoDisparoPorTelefone[c.telefone];
      let matchHistorico = true;
      if (filtroHistoricoDisparo === 'nunca') {
        matchHistorico = !ultimoLog;
      } else if (filtroHistoricoDisparo === 'ja_recebeu') {
        matchHistorico = !!ultimoLog;
      } else if (filtroHistoricoDisparo === 'sem_7dias') {
        if (ultimoLog) {
          const diasPassados = (agora - new Date(ultimoLog.created_date)) / (1000 * 60 * 60 * 24);
          matchHistorico = diasPassados >= 7;
        } else {
          matchHistorico = true;
        }
      } else if (filtroHistoricoDisparo === 'sem_30dias') {
        if (ultimoLog) {
          const diasPassados = (agora - new Date(ultimoLog.created_date)) / (1000 * 60 * 60 * 24);
          matchHistorico = diasPassados >= 30;
        } else {
          matchHistorico = true;
        }
      }

      return matchBusca && matchTag && matchHistorico;
    });
  }, [contatosWhatsapp, busca, filtroTag, filtroHistoricoDisparo, ultimoDisparoPorTelefone]);

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
      // Se é edição de template já existente (apenas local), salvar só no CRM
      if (dados.id) {
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
            tipo_cabecalho: dados.tipo_cabecalho || 'TEXT',
            status_meta: 'pendente',
          }),
        };
        return base44.entities.CampanhaLog.update(dados.id, payload);
      }

      // Se tem mídia, primeiro fazer upload para a Meta para obter o media_id (handle)
      let cabecalho_media_id = null;
      const tipoHeader = (dados.tipo_cabecalho || 'TEXT').toUpperCase();
      if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(tipoHeader) && dados.cabecalho_midia_url) {
        toast.loading('Enviando mídia para aprovação...', { id: 'upload-midia' });
        const uploadResp = await base44.functions.invoke('uploadMidiaMetaTemplate', {
          empresa_id: empresaId,
          midia_url: dados.cabecalho_midia_url,
          tipo_midia: tipoHeader,
        });
        toast.dismiss('upload-midia');
        if (!uploadResp?.data?.ok || !uploadResp?.data?.media_id) {
          const uploadErr = uploadResp?.data?.error
            || uploadResp?.data?.details?.error?.message
            || 'Falha no upload da mídia';
          toast.error('Erro ao enviar mídia: ' + uploadErr, { duration: 8000 });
          throw new Error('Falha no upload da mídia para a Meta: ' + uploadErr);
        }
        cabecalho_media_id = uploadResp.data.media_id;
        toast.success('Mídia pronta para aprovação!', { duration: 2000 });
      }

      // Novo template: enviar direto para a Meta via API
      const resp = await base44.functions.invoke('criarTemplateMetaWhatsApp', {
        empresa_id: empresaId,
        nome: dados.nome,
        categoria: dados.categoria,
        idioma: dados.idioma,
        cabecalho: dados.cabecalho,
        corpo: dados.corpo,
        rodape: dados.rodape,
        tipo_cabecalho: dados.tipo_cabecalho || 'TEXT',
        cabecalho_midia_url: dados.cabecalho_midia_url || '',
        cabecalho_media_id,
        botoes: dados.botoes || [],
      });
      if (!resp?.data?.ok) {
        const errDetail = resp?.data?.details?.error?.error_user_msg
          || resp?.data?.details?.error?.error_data?.details
          || resp?.data?.details?.error?.message
          || resp?.data?.error
          || 'Erro ao criar template na Meta';
        throw new Error(errDetail);
      }
      return resp.data;
    },
    onSuccess: (data) => {
      if (data?.template_id) {
        toast.success(`✅ Template enviado para aprovação da Meta! ID: ${data.template_id}. Aguarde a aprovação (geralmente alguns minutos a horas).`);
      } else {
        toast.success('Template salvo!');
      }
      setModalTemplate(null);
      setFormTemplate({ nome: '', categoria: 'marketing', idioma: 'pt_BR', corpo: '', cabecalho: '', rodape: '', tipo_cabecalho: 'TEXT', cabecalho_midia_url: '', botoes: [] });
      refetchTemplates();
    },
    onError: (e) => {
      // Extrair mensagem do Meta (pode vir em Axios response.data ou como plain Error)
      const d = e?.response?.data || {};
      const details = d?.details || {};
      const metaErr = details?.error || {};
      const msg = metaErr?.error_user_msg                              // Meta: mensagem amigável
        || metaErr?.message                                            // Meta: erro técnico
        || metaErr?.error_data?.details                                // Meta: detalhe específico
        || d?.error                                                    // Nossa mensagem wrapper
        || e?.message                                                  // Erro JavaScript
        || 'Erro desconhecido ao criar template';
      toast.error('❌ Meta: ' + msg, { duration: 12000 });
    },
  });

  const dispararCampanha = async () => {
    if (!nomeCampanha.trim()) { toast.error('Informe o nome da campanha'); return; }
    if (contatosSelecionados.size === 0) { toast.error('Selecione pelo menos 1 lead'); return; }
    if (tipoMensagem === 'template' && !templateSelecionado) { toast.error('Selecione um template'); return; }
    if (tipoMensagem === 'texto' && !mensagemTexto.trim()) { toast.error('Digite a mensagem'); return; }
    if (adicionarAoFunil && !etapaSelecionada) { toast.error('Selecione uma etapa do funil'); return; }

    const contatos = contatosSelecionadosLista.map(c => c.telefone).filter(Boolean);

    setDisparando(true);
    setProgressoEnvio({ enviados: 0, total: contatos.length, status: 'Iniciando...' });
    let pollInterval = null;
    try {
      let resp;
      if (tipoMensagem === 'template') {
        // Criar job de progresso
        const job = await base44.entities.CampanhaDisparoJob.create({
          empresa_id: empresaId,
          nome_campanha: nomeCampanha,
          total_contatos: contatos.length,
          enviados: 0,
          erros: 0,
          status: 'em_andamento',
        });

        // Iniciar polling de progresso
        pollInterval = setInterval(async () => {
          try {
            const fresh = await base44.entities.CampanhaDisparoJob.get(job.id);
            if (fresh) {
              setProgressoEnvio({ enviados: fresh.enviados || 0, total: fresh.total_contatos || contatos.length, status: fresh.status || 'em_andamento' });
              if (fresh.status === 'concluido' || fresh.status === 'erro') {
                clearInterval(pollInterval);
              }
            }
          } catch {}
        }, 1500);

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
          template_header_type: templateDados.tipo_cabecalho || '',
          template_header_url: templateHeaderUrlInput || templateDados.cabecalho_midia_url || '',
          template_botoes: templateDados.botoes || [],
          job_id: job.id,
          // Passar nome da campanha para log
          nome_campanha: nomeCampanha,
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
        // Capturar lista antes de limpar estado
        const listaParaFunil = [...contatosSelecionadosLista];
        if (adicionarAoFunil && etapaSelecionada) {
          await adicionarContatosAoFunil(listaParaFunil);
        }
        setContatosSelecionados(new Set());
        setNomeCampanha('');
        setMensagemTexto('');
        refetchLogs();
        setDisparando(false);
        return;
      }
      if (pollInterval) clearInterval(pollInterval);
      setProgressoEnvio({ enviados: 0, total: 0, status: '' });
      const data = resp?.data;
      toast.success(`✅ Campanha "${nomeCampanha}" disparada: ${data?.enviados || 0} enviados${data?.erros > 0 ? ` | ⚠️ ${data.erros} erros` : ''}`);

      // Capturar lista antes de limpar estado
      const listaParaFunilTemplate = [...contatosSelecionadosLista];
      // Adicionar ao funil se configurado
      if (adicionarAoFunil && etapaSelecionada) {
        await adicionarContatosAoFunil(listaParaFunilTemplate);
      }

      setContatosSelecionados(new Set());
      setNomeCampanha('');
      setTemplateSelecionado(null);
      setMensagemTexto('');
      refetchLogs();
    } catch (e) {
      if (pollInterval) clearInterval(pollInterval);
      setProgressoEnvio({ enviados: 0, total: 0, status: '' });
      toast.error('Erro: ' + e.message);
    } finally {
      setDisparando(false);
    }
  };

  const adicionarContatosAoFunil = async (listaContatos) => {
    const etapa = etapasDoProduto.find(e => e.id === etapaSelecionada);
    if (!etapa) return;
    const contatos = listaContatos || contatosSelecionadosLista;
    let criados = 0;
    let erros = 0;
    for (const contato of contatos) {
      try {
        await base44.entities.Oportunidade.create({
          empresa_id: empresaId,
          titulo: contato.nome || contato.telefone,
          cliente_nome: contato.nome || '',
          telefone_lead: contato.telefone || '',
          etapa_id: etapa.id,
          etapa_nome: etapa.nome,
          produto: funilSelecionado,
          status: 'aberta',
          origem: `Campanha: ${nomeCampanha}`,
          vendedor_id: colaboradorAtual?.id || '',
          vendedor_nome: colaboradorAtual?.nome || '',
        });
        criados++;
      } catch (e) {
        erros++;
        console.error('Erro ao criar oportunidade:', e);
      }
    }
    if (criados > 0) toast.success(`🎯 ${criados} contatos adicionados ao funil "${etapa.nome}"`);
    if (erros > 0) toast.warning(`⚠️ ${erros} contatos não puderam ser adicionados ao funil`);
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
                    <Label className="text-xs text-slate-500 mb-1 block">Status</Label>
                    <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="novo">Novo</SelectItem>
                        <SelectItem value="ativo">Ativo</SelectItem>
                      </SelectContent>
                    </Select>
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
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-1">
                  <div>
                    <Label className="text-xs text-slate-500 mb-1 block">Histórico de disparo</Label>
                    <Select value={filtroHistoricoDisparo} onValueChange={setFiltroHistoricoDisparo}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="nunca">Nunca recebeu disparo</SelectItem>
                        <SelectItem value="ja_recebeu">Já recebeu disparo</SelectItem>
                        <SelectItem value="sem_7dias">Sem disparo há +7 dias</SelectItem>
                        <SelectItem value="sem_30dias">Sem disparo há +30 dias</SelectItem>
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
                  <div className="flex items-center gap-4 text-sm text-slate-600 flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-slate-400" />
                      <strong className="text-slate-800">{contatosFiltrados.length}</strong> leads encontrados
                    </span>
                    <span className="flex items-center gap-1.5 text-green-700">
                      <CheckCircle2 className="w-4 h-4" />
                      <strong>{contatosSelecionados.size}</strong> selecionados
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {[10, 30, 50, 100].map(n => (
                        <button
                          key={n}
                          onClick={() => setContatosSelecionados(new Set(contatosFiltrados.slice(0, n).map(c => c.id)))}
                          className="px-2 py-1 text-xs rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-medium transition-colors"
                        >
                          {n}
                        </button>
                      ))}
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
                        const ultimoLog = ultimoDisparoPorTelefone[c.telefone];
                        const diasUltimoDis = ultimoLog
                          ? Math.floor((new Date() - new Date(ultimoLog.created_date)) / (1000 * 60 * 60 * 24))
                          : null;
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
                              {ultimoLog && (
                                <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {ultimoLog.nome_campanha
                                    ? `Campanha: ${ultimoLog.nome_campanha} · `
                                    : ''}
                                  {diasUltimoDis === 0 ? 'hoje' : `há ${diasUltimoDis}d`}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                              {contatoTags.map(t => (
                                <span
                                  key={t.id}
                                  className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
                                  style={{ backgroundColor: (t.cor || '#6b7280') + '22', color: t.cor || '#6b7280', borderColor: (t.cor || '#6b7280') + '55' }}
                                >
                                  {t.nome}
                                </span>
                              ))}
                              {ultimoLog ? (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                  já disparado
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                  novo
                                </span>
                              )}
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

                {/* Adicionar ao Funil de Vendas */}
                <div className={`border rounded-xl p-4 space-y-3 ${adicionarAoFunil ? 'border-blue-300 bg-blue-50/50' : ''}`}>
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setAdicionarAoFunil(!adicionarAoFunil); setFunilSelecionado(''); setEtapaSelecionada(''); }}>
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${adicionarAoFunil ? 'bg-blue-600' : 'border-2 border-slate-300'}`}>
                      {adicionarAoFunil && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Adicionar contatos ao Funil de Vendas</p>
                      <p className="text-xs text-slate-500 mt-0.5">Os contatos desta campanha serão criados como oportunidades em uma etapa do funil.</p>
                    </div>
                  </div>
                  {adicionarAoFunil && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      <div>
                        <Label className="text-xs text-slate-500 mb-1 block">Funil de Vendas *</Label>
                        <Select value={funilSelecionado} onValueChange={v => { setFunilSelecionado(v); setEtapaSelecionada(''); }}>
                          <SelectTrigger className="text-sm bg-white"><SelectValue placeholder="Selecionar funil..." /></SelectTrigger>
                          <SelectContent>
                            {funisDisponiveis.map(f => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500 mb-1 block">Etapa (Coluna) *</Label>
                        <Select value={etapaSelecionada} onValueChange={setEtapaSelecionada} disabled={!funilSelecionado}>
                          <SelectTrigger className="text-sm bg-white"><SelectValue placeholder={funilSelecionado ? 'Selecionar etapa...' : 'Selecione o funil primeiro'} /></SelectTrigger>
                          <SelectContent>
                            {etapasDoProduto.map(e => (
                              <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
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
                                onClick={() => { setTemplateSelecionado(selecionado ? null : t); setTemplateHeaderUrlInput(''); }}
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
                      {/* Campo URL de mídia para templates com imagem/vídeo/documento SEM handle salvo */}
                      {templateSelecionado && (() => {
                        const td = parseTemplateDados(templateSelecionado);
                        const tipoH = (td.tipo_cabecalho || '').toUpperCase();
                        if (!['IMAGE', 'VIDEO', 'DOCUMENT'].includes(tipoH)) return null;

                        const handleSalvo = td.cabecalho_midia_url; // handle numérico ou URL já salva
                        const temHandleSalvo = !!handleSalvo;

                        // Se já tem handle/url salvo na Meta, a imagem já está vinculada — apenas mostrar info opcional
                        if (temHandleSalvo) {
                          return (
                            <div className="border border-slate-200 bg-slate-50 rounded-xl p-3 space-y-2">
                              <p className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                                {tipoH === 'IMAGE' ? <Image className="w-3.5 h-3.5 text-slate-400" /> : tipoH === 'VIDEO' ? <Video className="w-3.5 h-3.5 text-slate-400" /> : <File className="w-3.5 h-3.5 text-slate-400" />}
                                ✓ Mídia já vinculada ao template na Meta — envio direto
                              </p>
                              <p className="text-[10px] text-slate-400">Opcional: informe uma URL pública para substituir a mídia original neste disparo.</p>
                              <Input
                                value={templateHeaderUrlInput}
                                onChange={e => setTemplateHeaderUrlInput(e.target.value)}
                                placeholder={tipoH === 'IMAGE' ? 'https://exemplo.com/imagem.jpg (opcional)' : tipoH === 'VIDEO' ? 'https://exemplo.com/video.mp4 (opcional)' : 'https://exemplo.com/documento.pdf (opcional)'}
                                className="text-sm bg-white"
                              />
                              {templateHeaderUrlInput && (
                                <p className="text-[10px] text-blue-700">↑ Esta URL substituirá a mídia original do template neste disparo.</p>
                              )}
                            </div>
                          );
                        }

                        // Sem handle salvo: URL é necessária
                        return (
                          <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-2">
                            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                              {tipoH === 'IMAGE' ? <Image className="w-3.5 h-3.5" /> : tipoH === 'VIDEO' ? <Video className="w-3.5 h-3.5" /> : <File className="w-3.5 h-3.5" />}
                              Este template requer {tipoH === 'IMAGE' ? 'uma imagem' : tipoH === 'VIDEO' ? 'um vídeo' : 'um documento'} — informe a URL pública
                            </p>
                            <Input
                              value={templateHeaderUrlInput}
                              onChange={e => setTemplateHeaderUrlInput(e.target.value)}
                              placeholder={tipoH === 'IMAGE' ? 'https://exemplo.com/imagem.jpg' : tipoH === 'VIDEO' ? 'https://exemplo.com/video.mp4' : 'https://exemplo.com/documento.pdf'}
                              className="text-sm bg-white"
                            />
                            {!templateHeaderUrlInput && (
                              <p className="text-[10px] text-red-600">⚠️ URL obrigatória — sem ela o envio falhará.</p>
                            )}
                            {templateHeaderUrlInput && (
                              <p className="text-[10px] text-green-700">✓ URL informada será usada no envio.</p>
                            )}
                          </div>
                        );
                      })()}
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
                {disparando && progressoEnvio.total > 0 && (
                  <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold text-blue-700">📨 Enviando campanha...</span>
                      <span className="text-sm font-bold text-blue-600">{progressoEnvio.enviados}/{progressoEnvio.total}</span>
                    </div>
                    <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${progressoEnvio.total > 0 ? Math.round((progressoEnvio.enviados / progressoEnvio.total) * 100) : 0}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-blue-500 mt-1">Aguarde enquanto as mensagens são enviadas com intervalo de segurança...</p>
                  </div>
                )}
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
                      {disparando && progressoEnvio.total > 0
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando {progressoEnvio.enviados}/{progressoEnvio.total}</>
                        : disparando
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
                    onClick={() => { setFormTemplate({ nome: '', categoria: 'marketing', idioma: 'pt_BR', corpo: '', cabecalho: '', rodape: '', tipo_cabecalho: 'TEXT', botoes: [] }); setModalTemplate('novo'); }}
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
                             <Button size="sm" variant="outline" onClick={() => { setFormTemplate({ ...d, id: t.id, botoes: d.botoes || [], tipo_cabecalho: d.tipo_cabecalho || 'TEXT' }); setModalTemplate(t); }}>
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

        // Detectar tipo: usar tipo_cabecalho salvo, ou inferir pela presença de mídia
        const tipoCabRaw = (d.tipo_cabecalho || d.tipo_midia || '').toUpperCase();
        const tipoAtual = tipoCabRaw === 'IMAGE' ? 'imagem'
          : tipoCabRaw === 'VIDEO' ? 'video'
          : tipoCabRaw === 'DOCUMENT' ? 'documento'
          : tipoCabRaw === 'AUDIO' ? 'audio'
          : d.cabecalho_midia_url ? 'imagem'
          : 'texto';

        // Ocultar a seção de tipos quando o tipo já é conhecido (template tem mídia real)
        const ocultarTipos = tipoAtual !== 'texto' && d.cabecalho_midia_url;

        const TIPOS_MIDIA = [
          { tipo: 'texto', icon: <MessageSquare className="w-5 h-5 text-blue-500" />, label: 'Texto', desc: 'Mensagem somente com texto e variáveis personalizadas.' },
          { tipo: 'imagem', icon: <Image className="w-5 h-5 text-emerald-500" />, label: 'Imagem', desc: 'Cabeçalho com imagem (JPG, PNG) + corpo de texto.' },
          { tipo: 'video', icon: <Video className="w-5 h-5 text-purple-500" />, label: 'Vídeo', desc: 'Cabeçalho com vídeo (MP4) + corpo de texto.' },
          { tipo: 'audio', icon: <Mic className="w-5 h-5 text-amber-500" />, label: 'Áudio', desc: 'Mensagem de voz ou arquivo de áudio.' },
          { tipo: 'documento', icon: <File className="w-5 h-5 text-red-500" />, label: 'Documento PDF', desc: 'Cabeçalho com arquivo PDF/documento + corpo de texto.' },
        ];

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
                    {/* Cabeçalho com mídia */}
                    {tipoAtual === 'imagem' && d.cabecalho_midia_url && !/^\d+$/.test(String(d.cabecalho_midia_url).trim()) && (
                      <img src={d.cabecalho_midia_url} alt="Imagem do template" className="w-full rounded-lg object-cover max-h-48" onError={e => { e.target.style.display='none'; }} />
                    )}
                    {tipoAtual === 'imagem' && d.cabecalho_midia_url && /^\d+$/.test(String(d.cabecalho_midia_url).trim()) && (
                      <div className="w-full h-28 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg flex items-center justify-center text-blue-500 text-sm gap-2">🖼️ Imagem do template (handle Meta)</div>
                    )}
                    {tipoAtual === 'imagem' && !d.cabecalho_midia_url && (
                      <div className="w-full h-28 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg flex items-center justify-center text-blue-500 text-sm gap-2">🖼️ Imagem do template</div>
                    )}
                    {tipoAtual === 'video' && d.cabecalho_midia_url && !/^\d+$/.test(String(d.cabecalho_midia_url).trim()) && (
                      <video src={d.cabecalho_midia_url} controls className="w-full rounded-lg max-h-48" />
                    )}
                    {tipoAtual === 'video' && d.cabecalho_midia_url && /^\d+$/.test(String(d.cabecalho_midia_url).trim()) && (
                      <div className="w-full h-28 bg-gradient-to-br from-slate-700 to-slate-900 rounded-lg flex items-center justify-center text-slate-300 text-sm gap-2">🎥 Vídeo do template (handle Meta)</div>
                    )}
                    {tipoAtual === 'documento' && d.cabecalho_midia_url && !/^\d+$/.test(String(d.cabecalho_midia_url).trim()) && (
                      <div className="w-full bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-600">
                        <span className="text-xl">📄</span>
                        <span className="text-xs font-medium">Documento PDF</span>
                        <a href={d.cabecalho_midia_url} target="_blank" rel="noreferrer" className="ml-auto text-xs text-blue-500 underline">Abrir</a>
                      </div>
                    )}
                    {tipoAtual === 'documento' && d.cabecalho_midia_url && /^\d+$/.test(String(d.cabecalho_midia_url).trim()) && (
                      <div className="w-full bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-600">
                        <span className="text-xl">📄</span>
                        <span className="text-xs font-medium">Documento PDF (handle Meta)</span>
                      </div>
                    )}
                    {/* Cabeçalho texto */}
                    {tipoAtual === 'texto' && d.cabecalho && (
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
                  {/* Botões do template */}
                  {Array.isArray(d.botoes) && d.botoes.length > 0 && (
                    <div className="max-w-xs ml-auto mt-1 space-y-1">
                      {d.botoes.map((btn, idx) => (
                        <div key={idx} className="bg-white rounded-xl shadow-sm py-2 px-3 text-center text-sm text-blue-600 font-medium border border-white/50">
                          {btn.tipo === 'URL' ? '🔗 ' : btn.tipo === 'PHONE_NUMBER' ? '📞 ' : btn.tipo === 'COPY_CODE' ? '🎟️ ' : '↩️ '}
                          {btn.tipo === 'COPY_CODE' ? (btn.texto || 'Copiar código') : (btn.texto || 'Botão')}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tipos de mídia suportados — só exibe se não há mídia real */}
                {!ocultarTipos && (
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
                )}
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
      <Dialog open={!!modalTemplate} onOpenChange={v => { if (!v) { setModalTemplate(null); setFormTemplate({ nome: '', categoria: 'marketing', idioma: 'pt_BR', corpo: '', cabecalho: '', rodape: '', tipo_cabecalho: 'TEXT', botoes: [] }); } }}>
        <DialogContent className="max-w-[65vw] w-[65vw] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-green-600" />
              {modalTemplate === 'novo' ? '✨ Novo Template — Enviar para Meta' : 'Editar Template'}
            </DialogTitle>
          </DialogHeader>

          {/* Banner informativo */}
          {modalTemplate === 'novo' && (
            <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-xs text-green-800 flex items-start gap-2">
              <span className="text-base">🚀</span>
              <div>
                <strong>Criação direta via API!</strong> O template será enviado automaticamente para aprovação da Meta.
                Após aprovado (geralmente em minutos a horas), ele ficará disponível para uso nos disparos em massa.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 py-1">
            {/* Coluna Esquerda: Formulário */}
            <div className="space-y-3">
              {/* Nome e Categoria */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm mb-1 block font-semibold">Nome do template *</Label>
                  <Input
                    value={formTemplate.nome}
                    onChange={e => setFormTemplate(p => ({ ...p, nome: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') }))}
                    placeholder="ex: boas_vindas"
                    className="text-sm"
                  />
                  <p className="text-xs text-slate-400 mt-0.5">Apenas minúsculas e underscores</p>
                </div>
                <div>
                  <Label className="text-sm mb-1 block font-semibold">Categoria *</Label>
                  <Select value={formTemplate.categoria} onValueChange={v => setFormTemplate(p => ({ ...p, categoria: v }))}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Idioma */}
              <div>
                <Label className="text-sm mb-1 block font-semibold">Idioma</Label>
                <Select value={formTemplate.idioma} onValueChange={v => setFormTemplate(p => ({ ...p, idioma: v }))}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IDIOMAS.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Tipo de Cabeçalho */}
              <div>
                <Label className="text-sm mb-1 block font-semibold">Tipo de Cabeçalho</Label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'NONE', label: '— Nenhum' },
                    { value: 'TEXT', label: '📝 Texto' },
                    { value: 'IMAGE', label: '🖼️ Imagem' },
                    { value: 'VIDEO', label: '🎥 Vídeo' },
                    { value: 'DOCUMENT', label: '📄 Documento' },
                  ].map(t => (
                    <button
                      key={t.value}
                      onClick={() => setFormTemplate(p => ({ ...p, tipo_cabecalho: t.value, cabecalho: t.value === 'NONE' ? '' : p.cabecalho }))}
                      className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
                        formTemplate.tipo_cabecalho === t.value
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cabeçalho texto */}
              {formTemplate.tipo_cabecalho === 'TEXT' && (
                <div>
                  <Label className="text-sm mb-1 block font-semibold">Texto do Cabeçalho</Label>
                  <Input
                    value={formTemplate.cabecalho}
                    onChange={e => setFormTemplate(p => ({ ...p, cabecalho: e.target.value }))}
                    placeholder="Ex: 🎉 Oferta Especial!"
                    className="text-sm"
                    maxLength={60}
                  />
                  <p className="text-xs text-slate-400 mt-0.5">{formTemplate.cabecalho.length}/60 caracteres</p>
                </div>
              )}

              {/* Upload de Mídia (Imagem / Vídeo / Documento) */}
              {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(formTemplate.tipo_cabecalho) && (
                <div className="space-y-2">
                  <Label className="text-sm mb-1 block font-semibold">
                    {formTemplate.tipo_cabecalho === 'IMAGE' && '🖼️ Imagem do Cabeçalho'}
                    {formTemplate.tipo_cabecalho === 'VIDEO' && '🎥 Vídeo do Cabeçalho'}
                    {formTemplate.tipo_cabecalho === 'DOCUMENT' && '📄 Documento PDF'}
                  </Label>

                  {formTemplate.cabecalho_midia_url ? (
                    <div className="space-y-2">
                      {/* Preview */}
                      {formTemplate.tipo_cabecalho === 'IMAGE' && (
                        <img src={formTemplate.cabecalho_midia_url} alt="Preview" className="w-full h-32 object-cover rounded-lg border" onError={e => e.target.style.display='none'} />
                      )}
                      {formTemplate.tipo_cabecalho === 'VIDEO' && (
                        <div className="w-full h-20 bg-black rounded-lg flex items-center justify-center text-white gap-2">
                          <span className="text-xl">▶️</span>
                          <span className="text-xs opacity-70">Vídeo carregado</span>
                        </div>
                      )}
                      {formTemplate.tipo_cabecalho === 'DOCUMENT' && (
                        <div className="w-full h-14 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center gap-2 text-red-600">
                          <span className="text-lg">📄</span>
                          <span className="text-xs font-medium">Documento carregado</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-green-600 flex-1 truncate">✓ Arquivo enviado com sucesso</p>
                        <button
                          onClick={() => setFormTemplate(p => ({ ...p, cabecalho_midia_url: '' }))}
                          className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 px-2 py-1 border border-red-200 rounded-lg hover:bg-red-50"
                        >
                          <X className="w-3 h-3" /> Remover
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-5 cursor-pointer transition-colors ${uploadingMidia ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-green-400 hover:bg-green-50'}`}>
                      {uploadingMidia ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                          <span className="text-sm text-blue-600 font-medium">Enviando arquivo...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-slate-400" />
                          <span className="text-sm text-slate-600 font-medium">Clique para selecionar o arquivo</span>
                          <span className="text-xs text-slate-400">
                            {formTemplate.tipo_cabecalho === 'IMAGE' && 'JPG, PNG (máx. 5MB)'}
                            {formTemplate.tipo_cabecalho === 'VIDEO' && 'MP4 (máx. 16MB)'}
                            {formTemplate.tipo_cabecalho === 'DOCUMENT' && 'PDF (máx. 100MB)'}
                          </span>
                        </>
                      )}
                      <input
                        type="file"
                        className="hidden"
                        accept={
                          formTemplate.tipo_cabecalho === 'IMAGE' ? 'image/jpeg,image/png' :
                          formTemplate.tipo_cabecalho === 'VIDEO' ? 'video/mp4' :
                          'application/pdf'
                        }
                        disabled={uploadingMidia}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingMidia(true);
                          try {
                            const { file_url } = await base44.integrations.Core.UploadFile({ file });
                            setFormTemplate(p => ({ ...p, cabecalho_midia_url: file_url }));
                            toast.success('Arquivo enviado com sucesso!');
                          } catch (err) {
                            toast.error('Erro ao enviar arquivo: ' + err.message);
                          } finally {
                            setUploadingMidia(false);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              )}

              {/* Corpo */}
              <div>
                <Label className="text-sm mb-1 block font-semibold">Corpo da mensagem *</Label>
                <Textarea
                  value={formTemplate.corpo}
                  onChange={e => setFormTemplate(p => ({ ...p, corpo: e.target.value }))}
                  placeholder={"Olá {{1}}! 👋\n\nTemos uma oferta especial de consórcio para você.\n\nClique abaixo para saber mais!"}
                  rows={6}
                  className="text-sm resize-none"
                />
                <p className="text-xs text-slate-400 mt-0.5">
                  Use <code className="bg-slate-100 px-1 rounded">{'{{1}}'}</code>, <code className="bg-slate-100 px-1 rounded">{'{{2}}'}</code> para variáveis. {formTemplate.corpo.length} caracteres.
                </p>
              </div>

              {/* Rodapé */}
              <div>
                <Label className="text-sm mb-1 block font-semibold">Rodapé (opcional)</Label>
                <Input
                  value={formTemplate.rodape}
                  onChange={e => setFormTemplate(p => ({ ...p, rodape: e.target.value }))}
                  placeholder="Ex: Para cancelar, responda SAIR"
                  className="text-sm"
                  maxLength={60}
                />
              </div>

              {/* Botões */}
              <div className="border rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Botões (opcional, máx. 3)</Label>
                  {(formTemplate.botoes || []).length < 10 && (
                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        onClick={() => setFormTemplate(p => ({ ...p, botoes: [...(p.botoes || []), { tipo: 'QUICK_REPLY', texto: 'Saiba mais' }] }))}
                        className="px-2.5 py-1 text-xs rounded-lg border bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200 font-medium"
                      >↩️ Personalizar</button>
                      <button
                        onClick={() => setFormTemplate(p => ({ ...p, botoes: [...(p.botoes || []), { tipo: 'URL', texto: 'Aceder ao site', url: '' }] }))}
                        className="px-2.5 py-1 text-xs rounded-lg border bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 font-medium"
                      >🔗 Aceder ao site</button>
                      <button
                        onClick={() => setFormTemplate(p => ({ ...p, botoes: [...(p.botoes || []), { tipo: 'PHONE_NUMBER', texto: 'Ligar agora', telefone: '' }] }))}
                        className="px-2.5 py-1 text-xs rounded-lg border bg-green-50 hover:bg-green-100 text-green-700 border-green-200 font-medium"
                      >📞 Ligar p/ número</button>
                      <button
                        onClick={() => setFormTemplate(p => ({ ...p, botoes: [...(p.botoes || []), { tipo: 'COPY_CODE', texto: 'Copiar código', codigo: '' }] }))}
                        className="px-2.5 py-1 text-xs rounded-lg border bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200 font-medium"
                      >🎟️ Copiar código</button>
                    </div>
                  )}
                </div>
                {(formTemplate.botoes || []).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-2 border border-dashed rounded-lg">Nenhum botão adicionado. Clique em + para adicionar.</p>
                )}
                {(formTemplate.botoes || []).map((btn, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        btn.tipo === 'QUICK_REPLY' ? 'bg-purple-100 text-purple-700' :
                        btn.tipo === 'URL' ? 'bg-blue-100 text-blue-700' :
                        btn.tipo === 'COPY_CODE' ? 'bg-amber-100 text-amber-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {btn.tipo === 'QUICK_REPLY' ? '↩️ Personalizar' :
                         btn.tipo === 'URL' ? '🔗 Aceder ao site' :
                         btn.tipo === 'COPY_CODE' ? '🎟️ Copiar código' :
                         '📞 Ligar para número'}
                      </span>
                      <button onClick={() => setFormTemplate(p => ({ ...p, botoes: p.botoes.filter((_, i) => i !== idx) }))} className="text-red-400 hover:text-red-600 text-sm">✕ Remover</button>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500 mb-1 block">Texto do botão *</Label>
                      <Input
                        value={btn.texto}
                        onChange={e => setFormTemplate(p => ({ ...p, botoes: p.botoes.map((b, i) => i === idx ? { ...b, texto: e.target.value } : b) }))}
                        placeholder="Ex: Saiba mais, Acessar, Ligar"
                        className="text-sm h-8"
                        maxLength={25}
                      />
                    </div>
                    {btn.tipo === 'URL' && (
                      <div>
                        <Label className="text-xs text-slate-500 mb-1 block">URL de destino *</Label>
                        <Input
                          value={btn.url || ''}
                          onChange={e => setFormTemplate(p => ({ ...p, botoes: p.botoes.map((b, i) => i === idx ? { ...b, url: e.target.value } : b) }))}
                          placeholder="https://seusite.com.br"
                          className="text-sm h-8"
                        />
                      </div>
                    )}
                    {btn.tipo === 'PHONE_NUMBER' && (
                      <div>
                        <Label className="text-xs text-slate-500 mb-1 block">Número de telefone *</Label>
                        <Input
                          value={btn.telefone || ''}
                          onChange={e => setFormTemplate(p => ({ ...p, botoes: p.botoes.map((b, i) => i === idx ? { ...b, telefone: e.target.value } : b) }))}
                          placeholder="+5511999999999"
                          className="text-sm h-8"
                        />
                      </div>
                    )}
                    {btn.tipo === 'COPY_CODE' && (
                      <div>
                        <Label className="text-xs text-slate-500 mb-1 block">Código de oferta *</Label>
                        <Input
                          value={btn.codigo || ''}
                          onChange={e => setFormTemplate(p => ({ ...p, botoes: p.botoes.map((b, i) => i === idx ? { ...b, codigo: e.target.value } : b) }))}
                          placeholder="Ex: DESCONTO20"
                          className="text-sm h-8"
                          maxLength={15}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Coluna Direita: Preview */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-slate-600 block">📱 Pré-visualização WhatsApp</Label>
              <div className="bg-[#e5ddd5] rounded-2xl p-4 min-h-[350px] flex flex-col justify-start">
                <div className="bg-white rounded-2xl shadow-sm max-w-[80%] ml-auto p-3 space-y-2">
                  {/* Cabeçalho preview */}
                  {formTemplate.tipo_cabecalho === 'TEXT' && formTemplate.cabecalho && (
                    <p className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-1.5">{formTemplate.cabecalho}</p>
                  )}
                  {formTemplate.tipo_cabecalho === 'IMAGE' && (
                    formTemplate.cabecalho_midia_url
                      ? <img src={formTemplate.cabecalho_midia_url} alt="Imagem" className="w-full h-32 object-cover rounded-lg" />
                      : <div className="w-full h-28 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg flex items-center justify-center text-blue-500 text-sm gap-2">🖼️ Envie uma imagem</div>
                  )}
                  {formTemplate.tipo_cabecalho === 'VIDEO' && (
                    formTemplate.cabecalho_midia_url
                      ? <div className="w-full h-28 bg-black rounded-lg flex items-center justify-center text-white gap-1">
                          <span className="text-2xl">▶️</span>
                          <span className="text-xs opacity-60">Vídeo carregado</span>
                        </div>
                      : <div className="w-full h-28 bg-gradient-to-br from-slate-700 to-slate-900 rounded-lg flex items-center justify-center text-slate-300 text-sm gap-2">🎥 Envie um vídeo</div>
                  )}
                  {formTemplate.tipo_cabecalho === 'DOCUMENT' && (
                    <div className="w-full h-16 bg-gradient-to-br from-red-50 to-red-100 rounded-lg flex items-center justify-center text-red-400 text-sm gap-1">📄 Documento PDF</div>
                  )}

                  {/* Corpo preview */}
                  {formTemplate.corpo ? (
                    <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{formTemplate.corpo}</p>
                  ) : (
                    <p className="text-sm text-slate-300 italic">Corpo da mensagem aparecerá aqui...</p>
                  )}

                  {/* Rodapé preview */}
                  {formTemplate.rodape && (
                    <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-1.5">{formTemplate.rodape}</p>
                  )}

                  <p className="text-[10px] text-slate-400 text-right">agora ✓✓</p>
                </div>

                {/* Botões preview */}
                {(formTemplate.botoes || []).length > 0 && (
                  <div className="max-w-[80%] ml-auto mt-1 space-y-1">
                    {formTemplate.botoes.map((btn, idx) => (
                      <div key={idx} className="bg-white rounded-xl shadow-sm py-2 px-3 text-center text-sm text-blue-600 font-medium border border-white/50">
                        {btn.tipo === 'URL' ? '🔗 ' : btn.tipo === 'PHONE_NUMBER' ? '📞 ' : btn.tipo === 'COPY_CODE' ? '🎟️ ' : '↩️ '}
                        {btn.tipo === 'COPY_CODE' ? (btn.texto || 'Copiar código') : (btn.texto || 'Texto do botão')}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Info nome */}
              {formTemplate.nome && (
                <div className="bg-slate-50 border rounded-lg p-3 space-y-1">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">Identificação na Meta</p>
                  <p className="text-sm font-mono text-slate-700">{formTemplate.nome}</p>
                  <p className="text-[10px] text-slate-400">{formTemplate.categoria.toUpperCase()} · {formTemplate.idioma}</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => { setModalTemplate(null); setFormTemplate({ nome: '', categoria: 'marketing', idioma: 'pt_BR', corpo: '', cabecalho: '', rodape: '', tipo_cabecalho: 'TEXT', botoes: [] }); }}>
              Cancelar
            </Button>
            <Button
              className="gap-2 bg-green-600 hover:bg-green-700"
              onClick={() => salvarTemplateMutation.mutate({ ...formTemplate, id: modalTemplate !== 'novo' ? modalTemplate?.id : undefined })}
              disabled={salvarTemplateMutation.isPending || !formTemplate.nome || !formTemplate.corpo}
            >
              {salvarTemplateMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando para Meta...</>
                : modalTemplate === 'novo'
                  ? <><Send className="w-4 h-4" /> Criar e Enviar para Aprovação</>
                  : <><FileText className="w-4 h-4" /> Salvar Alterações</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}