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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Clock,
  BarChart3,
  Users,
  Tag,
  Zap,
  Filter,
  CheckCircle2,
  MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';

export default function CampanhaDisparos({ empresaId }) {
  const queryClient = useQueryClient();
  const [abaAtiva, setAbaAtiva] = useState('disparo');

  // ─── Disparo em Massa state ─────────────────────────────────────────────────
  const [busca, setBusca] = useState('');
  const [filtroTag, setFiltroTag] = useState('todas');
  const [filtroHistoricoDisparo, setFiltroHistoricoDisparo] = useState('todos');
  const [contatosSelecionados, setContatosSelecionados] = useState(new Set());
  const [nomeCampanha, setNomeCampanha] = useState('');
  const [delaySegundos, setDelaySegundos] = useState(7);
  const [tipoMensagem, setTipoMensagem] = useState('texto'); // 'texto' | 'template'
  const [mensagemTexto, setMensagemTexto] = useState('');
  const [disparando, setDisparando] = useState(false);
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

  const dispararCampanha = async () => {
    if (!nomeCampanha.trim()) { toast.error('Informe o nome da campanha'); return; }
    if (contatosSelecionados.size === 0) { toast.error('Selecione pelo menos 1 lead'); return; }
    if (tipoMensagem === 'texto' && !mensagemTexto.trim()) { toast.error('Digite a mensagem'); return; }
    if (adicionarAoFunil && !etapaSelecionada) { toast.error('Selecione uma etapa do funil'); return; }

    const contatos = contatosSelecionadosLista.map(c => c.telefone).filter(Boolean);

    setDisparando(true);
    try {
      // Modo texto: usar função dedicada de disparo em massa
      const resp = await base44.functions.invoke('dispararCampanhaTexto', {
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
    } catch (e) {
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-slate-500 mb-1 block">Buscar</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                      <Input
                        placeholder="Nome, telefone..."
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
                  <div>
                    <Label className="text-xs text-slate-500 mb-1 block">Delay entre mensagens (segundos)</Label>
                    <Input type="number" value={delaySegundos} onChange={e => setDelaySegundos(e.target.value)} className="text-sm" min={1} />
                    <p className="text-[10px] text-slate-400 mt-0.5">Recomendado: 5-10 segundos</p>
                  </div>
                </div>

                {/* Mensagem da Campanha */}
                <div className="border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-slate-500" /> Mensagem da Campanha
                    </p>
                    <div className="flex gap-1">
                      {['Texto', 'Template'].map(tipo => (
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
                        </button>
                      ))}
                    </div>
                  </div>

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
                            ? '⚠️ API Meta só envia para contatos dentro da janela de 24h.'
                            : '⚠️ Evolution API requer que o contato esteja dentro da janela de 24h de conversas ativas.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {tipoMensagem === 'template' && (
                    <div className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-slate-200 rounded-lg text-slate-400">
                      <p className="text-sm">Use a aba "Meta Oficial" para criar templates</p>
                      <p className="text-xs mt-1">Templates permitem enviar mensagens fora da janela de 24h</p>
                    </div>
                  )}
                </div>

                {/* Rodapé: status + botão */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <p className="text-sm text-slate-500">
                    <span className="text-slate-400">{contatosSelecionados.size} leads selecionados</span>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setContatosSelecionados(new Set()); setNomeCampanha(''); setMensagemTexto(''); }}
                    >
                      ✕ Limpar
                    </Button>
                    <Button
                      size="sm"
                      className="gap-2 bg-green-600 hover:bg-green-700"
                      onClick={dispararCampanha}
                      disabled={disparando || contatosSelecionados.size === 0 || !nomeCampanha.trim() || (tipoMensagem === 'texto' && !mensagemTexto.trim())}
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

        {/* ═══ ABA: HISTÓRICO ══════════════════════════════════════════════════ */}
        <TabsContent value="historico">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="w-5 h-5 text-amber-500" /> Histórico de Disparos
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
    </div>
  );
}