import React, { useState, useEffect, useMemo } from 'react';
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
  BarChart3,
  Send,
  Loader2,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  CalendarClock,
  RefreshCw,
  MessageCircle,
  MessageSquare,
  Building2,
  DollarSign,
  X,
  Download,
  Calendar,
  Target,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import ChatPopupModal from '@/components/chat/ChatPopupModal';
import CampanhasPlanejamentoBadge from '@/components/funil/CampanhasPlanejamentoBadge';
import CampanhaMetaOficial from '@/components/campanhas/CampanhaMetaOficial';

export default function Campanhas() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroRenovacao, setFiltroRenovacao] = useState('aguardando');
  const [modalSimulacaoOpen, setModalSimulacaoOpen] = useState(false);
  const [renovacaoSelecionada, setRenovacaoSelecionada] = useState(null);
  const [obsSimulacao, setObsSimulacao] = useState('');
  const [chatPopup, setChatPopup] = useState(null); // { nome, telefone }
  const [campanhaPlanejamentoOpen, setCampanhaPlanejamentoOpen] = useState(false);
  const [mensagemPlanejamento, setMensagemPlanejamento] = useState('');
  const [searchPlanejamento, setSearchPlanejamento] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        setEmpresaId('699696c2c9f5bffc2e67402b');
      } else {
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
        if (colabs.length > 0) setEmpresaId(colabs[0].empresa_id);
      }
      setUser(me);
    } catch (e) {
      toast.error('Erro ao carregar usuário');
    }
  };

  // Buscar fila de renovações
  const { data: renovacoes = [], refetch: refetchRenovacoes } = useQuery({
    queryKey: ['campanhas-renovacao', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.CampanhaRenovacao.filter({ empresa_id: empresaId }, 'data_agendada_envio', 1000),
  });

  // Executar campanhas
  const executarMutation = useMutation({
    mutationFn: async () => {
      const resp = await base44.functions.invoke('verificarEEnviarCampanhas', {});
      return resp?.data;
    },
    onSuccess: (data) => {
      toast.success(`✅ ${data.campanhasEnviadas} campanhas enviadas`);
      if (data.erros > 0) toast.warning(`⚠️ ${data.erros} erros`);
      refetchRenovacoes();
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  // Sincronizar propostas pagas existentes
  const sincronizarMutation = useMutation({
    mutationFn: async () => {
      const resp = await base44.functions.invoke('sincronizarPropostasPagasParaRenovacao', { empresa_id: empresaId });
      return resp?.data;
    },
    onSuccess: (data) => {
      if (data?.ok) {
        toast.success(`✅ ${data.criadas} novas renovações importadas (${data.ignoradas} já existiam)`);
        refetchRenovacoes();
      } else {
        toast.error('Erro: ' + (data?.error || 'Desconhecido'));
      }
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  // Buscar etapas tipo "planejamento"
  const { data: etapasPlanejamento = [] } = useQuery({
    queryKey: ['etapas-planejamento', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.EtapaFunil.filter({ empresa_id: empresaId, tipo: 'planejamento', status: 'ativa' }),
  });

  // Buscar oportunidades nas etapas de planejamento
  const { data: oportunidadesPlanejamento = [], refetch: refetchPlanejamento } = useQuery({
    queryKey: ['oportunidades-planejamento', empresaId, etapasPlanejamento],
    enabled: !!empresaId && etapasPlanejamento.length > 0,
    queryFn: async () => {
      const todasOport = await base44.entities.Oportunidade.filter({ empresa_id: empresaId, status: 'aberta' }, '-data_ultima_movimentacao', 500);
      const etapaIds = etapasPlanejamento.map(e => e.id);
      // Apenas leads do funil de Consórcio
      const filtradas = todasOport.filter(o => etapaIds.includes(o.etapa_id) && o.produto === 'consorcio');

      // Marcar data de entrada para leads sem ela
      const semData = filtradas.filter(o => !o.data_entrada_planejamento);
      for (const o of semData) {
        base44.entities.Oportunidade.update(o.id, {
          data_entrada_planejamento: new Date().toISOString(),
          campanha_planejamento_ultima: 0,
        }).catch(() => {});
        o.data_entrada_planejamento = new Date().toISOString();
        o.campanha_planejamento_ultima = 0;
      }

      return filtradas;
    },
  });

  // Buscar logs de campanhas de planejamento por oportunidade
  const { data: logsCampanhasPlanejamento = [], refetch: refetchLogs } = useQuery({
    queryKey: ['logs-campanhas-planejamento', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.CampanhaLog.filter({ empresa_id: empresaId }, '-created_date', 2000),
  });

  // Mapa: oportunidade_id -> array de números das campanhas enviadas com sucesso
  const campanhasEnviadasPorLead = useMemo(() => {
    const mapa = {};
    logsCampanhasPlanejamento
      .filter(l => l.oportunidade_id && l.status === 'enviada' && l.numero_sequencia)
      .forEach(l => {
        if (!mapa[l.oportunidade_id]) mapa[l.oportunidade_id] = [];
        if (!mapa[l.oportunidade_id].includes(l.numero_sequencia)) {
          mapa[l.oportunidade_id].push(l.numero_sequencia);
        }
      });
    return mapa;
  }, [logsCampanhasPlanejamento]);

  // Enviar campanha quinzenal para leads de planejamento
  const enviarCampanhaPlanejamentoMutation = useMutation({
    mutationFn: async ({ mensagem, leads }) => {
      if (!mensagem.trim()) throw new Error('Digite uma mensagem');
      if (leads.length === 0) throw new Error('Nenhum lead selecionado');

      let enviados = 0;
      let erros = 0;

      for (const lead of leads) {
        const telefone = lead.telefone_lead || lead.cliente_telefone;
        if (!telefone) continue;
        try {
          const textoFinal = mensagem
            .replace('{nome}', lead.titulo || lead.cliente_nome || 'Prezado(a)')
            .replace('{valor}', lead.valor_estimado ? `R$ ${Number(lead.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '');

          await base44.functions.invoke('enviarMensagemWhatsapp', {
            empresa_id: empresaId,
            telefone,
            mensagem: textoFinal,
          });

          // Registrar no histórico
          await base44.entities.CampanhaLog.create({
            empresa_id: empresaId,
            cliente_nome: lead.cliente_nome || lead.titulo,
            cliente_telefone: telefone,
            tipo_campanha: 'planejamento_compra',
            status: 'enviada',
          });

          enviados++;
        } catch {
          erros++;
          await base44.entities.CampanhaLog.create({
            empresa_id: empresaId,
            cliente_nome: lead.cliente_nome || lead.titulo,
            cliente_telefone: telefone,
            tipo_campanha: 'planejamento_compra',
            status: 'erro',
          });
        }
      }
      return { enviados, erros };
    },
    onSuccess: (data) => {
      toast.success(`✅ ${data.enviados} mensagens enviadas${data.erros > 0 ? ` | ⚠️ ${data.erros} erros` : ''}`);
      setCampanhaPlanejamentoOpen(false);
      setMensagemPlanejamento('');
      refetchPlanejamento();
      queryClient.invalidateQueries({ queryKey: ['campanhas'] });
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  // Cancelar renovação
  const cancelarRenovacaoMutation = useMutation({
    mutationFn: (id) => base44.entities.CampanhaRenovacao.update(id, { status: 'cancelada' }),
    onSuccess: () => { toast.success('Renovação cancelada'); refetchRenovacoes(); },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  // Marcar como Nova Simulação
  const marcarSimulacaoMutation = useMutation({
    mutationFn: ({ id, obs }) => base44.entities.CampanhaRenovacao.update(id, {
      status: 'nova_simulacao',
      data_simulacao: new Date().toISOString(),
      observacoes_simulacao: obs || '',
    }),
    onSuccess: () => {
      toast.success('✅ Marcado como Nova Simulação');
      setModalSimulacaoOpen(false);
      setObsSimulacao('');
      setRenovacaoSelecionada(null);
      refetchRenovacoes();
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  // Marcar como Oportunidade Aceita
  const marcarOportunidadeAceitaMutation = useMutation({
    mutationFn: (id) => base44.entities.CampanhaRenovacao.update(id, {
      status: 'oportunidade_aceita',
      data_oportunidade_aceita: new Date().toISOString(),
    }),
    onSuccess: () => { toast.success('✅ Oportunidade marcada como Aceita!'); refetchRenovacoes(); },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  // Filtros renovação
  const renovacoesFiltradas = renovacoes.filter(r => {
    const matchSearch =
      (r.cliente_nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.cliente_telefone || '').includes(searchTerm) ||
      (r.cliente_cpf || '').includes(searchTerm);
    return matchSearch && (filtroRenovacao === 'todas' || r.status === filtroRenovacao);
  });

  // Contadores por status para a fila de renovações
  const renovacaoContadores = {
    aguardando: renovacoes.filter(r => r.status === 'aguardando').length,
    nova_simulacao: renovacoes.filter(r => r.status === 'nova_simulacao').length,
    oportunidade_aceita: renovacoes.filter(r => r.status === 'oportunidade_aceita').length,
    enviada: renovacoes.filter(r => r.status === 'enviada').length,
    cancelada: renovacoes.filter(r => r.status === 'cancelada').length,
  };

  const hoje = new Date().toISOString().slice(0, 10);

  const renovacaoStats = {
    aguardando: renovacoes.filter(r => r.status === 'aguardando').length,
    nova_simulacao: renovacoes.filter(r => r.status === 'nova_simulacao').length,
    oportunidade_aceita: renovacoes.filter(r => r.status === 'oportunidade_aceita').length,
    enviadas: renovacoes.filter(r => r.status === 'enviada').length,
    // Leads aguardando cujo prazo de 1 ano chegou (mas ainda não foram marcados como nova_simulacao)
    prontas: renovacoes.filter(r => r.status === 'aguardando' && r.data_agendada_envio <= hoje).length,
  };

  const leadsPlanejaFiltrados = oportunidadesPlanejamento.filter(o => {
    const t = searchPlanejamento.toLowerCase();
    return !t || (o.titulo || '').toLowerCase().includes(t) ||
      (o.cliente_nome || '').toLowerCase().includes(t) ||
      (o.telefone_lead || '').includes(t);
  });

  const formatCurrency = (v) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
  };

  const getDiasRestantes = (dataAgendada) => {
    if (!dataAgendada) return null;
    const diff = Math.ceil((new Date(dataAgendada + 'T12:00:00') - new Date()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (!user || !empresaId) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Campanhas</h1>
          <p className="text-sm text-slate-500 mt-1">Renovações automáticas e reengajamento de clientes</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => sincronizarMutation.mutate()}
            disabled={sincronizarMutation.isPending}
            variant="outline"
            className="gap-2"
          >
            {sincronizarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Importar Propostas Pagas
          </Button>
          <Button
            onClick={() => executarMutation.mutate()}
            disabled={executarMutation.isPending}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {executarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Executar Campanhas Agora
          </Button>
        </div>
      </div>

      {/* Alerta de prontas para nova simulação */}
      {renovacaoStats.prontas > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900">
              {renovacaoStats.prontas} cliente(s) completaram 1 ano — prontos para Nova Simulação!
            </p>
            <p className="text-sm text-amber-700">
              Acesse a aba "Fila de Renovações" e marque como "Nova Simulação" para o time comercial simular uma nova proposta.
            </p>
          </div>
        </div>
      )}
      {renovacaoStats.oportunidade_aceita > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-emerald-900">
              {renovacaoStats.oportunidade_aceita} oportunidade(s) aceita(s) aguardando envio pelo time comercial!
            </p>
            <p className="text-sm text-emerald-700">
              Simulação aprovada — o time comercial deve enviar a proposta manualmente ao cliente para negociar.
            </p>
          </div>
        </div>
      )}

      {/* Estatísticas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Aguardando</p>
                <p className="text-3xl font-bold text-amber-600 mt-1">{renovacaoStats.aguardando}</p>
                <p className="text-xs text-slate-400 mt-0.5">renovações na fila</p>
              </div>
              <CalendarClock className="w-8 h-8 text-amber-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Nova Simulação</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">{renovacaoStats.nova_simulacao}</p>
                <p className="text-xs text-slate-400 mt-0.5">1 ano completo</p>
              </div>
              <AlertCircle className="w-8 h-8 text-orange-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Oport. Aceita</p>
                <p className="text-3xl font-bold text-emerald-600 mt-1">{renovacaoStats.oportunidade_aceita}</p>
                <p className="text-xs text-slate-400 mt-0.5">aguard. envio comercial</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-emerald-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Enviadas</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">{renovacaoStats.enviadas}</p>
                <p className="text-xs text-slate-400 mt-0.5">total histórico</p>
              </div>
              <BarChart3 className="w-8 h-8 text-blue-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Abas */}
      <Tabs defaultValue="fila">
        <TabsList className="mb-4">
          <TabsTrigger value="meta_oficial" className="gap-1.5">
            <MessageSquare className="w-4 h-4 text-green-600" />
            <span className="text-green-700 font-semibold">Meta Oficial</span>
            <span className="ml-1 bg-green-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">NOVO</span>
          </TabsTrigger>
          <TabsTrigger value="fila" className="gap-1.5">
            <CalendarClock className="w-4 h-4" />
            Fila de Renovações
            {renovacaoStats.aguardando > 0 && (
              <span className="ml-1 bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                {renovacaoStats.aguardando}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="planejamento" className="gap-1.5">
            <Target className="w-4 h-4" />
            Planejamento de Compra
            {leadsPlanejaFiltrados.length > 0 && (
              <span className="ml-1 bg-purple-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                {oportunidadesPlanejamento.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ABA: Meta Oficial */}
        <TabsContent value="meta_oficial">
          <CampanhaMetaOficial empresaId={empresaId} />
        </TabsContent>

        {/* ABA: Fila de Renovações */}
        <TabsContent value="fila">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="w-5 h-5 text-amber-500" />
                Fila de Renovações — Empréstimos Pagos
              </CardTitle>
              <p className="text-xs text-slate-500">
                Clientes com empréstimos pagos que receberão uma nova oferta 1 ano após o pagamento
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Filtros */}
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Buscar por nome, CPF ou telefone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-1 flex-wrap">
                  {[
                    { value: 'aguardando', label: 'Aguardando', count: renovacaoContadores.aguardando },
                    { value: 'nova_simulacao', label: 'Nova Simulação', count: renovacaoContadores.nova_simulacao, color: 'bg-orange-500' },
                    { value: 'oportunidade_aceita', label: 'Oport. Aceita', count: renovacaoContadores.oportunidade_aceita, color: 'bg-emerald-600' },
                    { value: 'enviada', label: 'Enviadas', count: renovacaoContadores.enviada },
                    { value: 'cancelada', label: 'Canceladas', count: renovacaoContadores.cancelada },
                    { value: 'todas', label: 'Todas' },
                  ].map(f => (
                    <Button
                      key={f.value}
                      variant={filtroRenovacao === f.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFiltroRenovacao(f.value)}
                      className="gap-1.5"
                    >
                      {f.label}
                      {f.count > 0 && (
                        <span className={`text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 ${f.color || 'bg-slate-500'}`}>
                          {f.count}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchRenovacoes()}
                  className="gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Atualizar
                </Button>
              </div>

              {/* Lista */}
              <ScrollArea className="h-[520px] border rounded-lg">
                <div className="p-3 space-y-2">
                  {renovacoesFiltradas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                      <CalendarClock className="w-10 h-10 opacity-30" />
                      <p className="text-sm">Nenhuma renovação encontrada</p>
                    </div>
                  ) : (
                    renovacoesFiltradas.map(r => {
                      const dias = getDiasRestantes(r.data_agendada_envio);
                      const prontoParaSimular = r.status === 'aguardando' && dias !== null && dias <= 0;
                      const proximo = r.status === 'aguardando' && dias !== null && dias > 0 && dias <= 30;

                      const cardColor = r.status === 'nova_simulacao'
                        ? 'bg-orange-50 border-orange-200'
                        : r.status === 'oportunidade_aceita'
                        ? 'bg-emerald-50 border-emerald-200'
                        : prontoParaSimular
                        ? 'bg-amber-50 border-amber-200'
                        : proximo
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-white border-slate-200 hover:bg-slate-50';

                      return (
                        <div key={r.id} className={`p-3 rounded-lg border transition-colors ${cardColor}`}>
                          <div className="flex items-start justify-between gap-3">
                            {/* Info cliente */}
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                                {r.cliente_nome?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-sm text-slate-900 truncate">{r.cliente_nome || '-'}</p>
                                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                  {r.cliente_cpf && (
                                    <span className="text-xs text-slate-400">CPF: {r.cliente_cpf}</span>
                                  )}
                                  {r.banco_nome && (
                                    <span className="flex items-center gap-1 text-xs text-slate-500">
                                      <Building2 className="w-3 h-3" />{r.banco_nome}
                                    </span>
                                  )}
                                  {r.valor_credito > 0 && (
                                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                                      <DollarSign className="w-3 h-3" />{formatCurrency(r.valor_credito)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Status badge + datas */}
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              {r.status === 'aguardando' && !prontoParaSimular && (
                                <div className="text-right">
                                  <p className="text-[10px] text-slate-400">1 ano em</p>
                                  <p className={`text-xs font-semibold ${proximo ? 'text-blue-600' : 'text-slate-700'}`}>
                                    {formatDate(r.data_agendada_envio)}
                                  </p>
                                  {dias !== null && (
                                    <p className="text-[10px] text-slate-400">em {dias}d</p>
                                  )}
                                </div>
                              )}
                              {prontoParaSimular && (
                                <Badge className="bg-amber-500 text-white text-xs">🔔 Pronto p/ Simular</Badge>
                              )}
                              {r.status === 'nova_simulacao' && (
                                <Badge className="bg-orange-500 text-white text-xs">📋 Nova Simulação</Badge>
                              )}
                              {r.status === 'oportunidade_aceita' && (
                                <Badge className="bg-emerald-600 text-white text-xs">✅ Oport. Aceita</Badge>
                              )}
                              {r.status === 'enviada' && (
                                <Badge className="bg-blue-100 text-blue-700 text-xs">✓ Enviada</Badge>
                              )}
                              {r.status === 'cancelada' && (
                                <Badge variant="secondary" className="text-xs">Cancelada</Badge>
                              )}
                              {r.status === 'erro' && (
                                <Badge variant="destructive" className="text-xs">Erro</Badge>
                              )}
                              <p className="text-[10px] text-slate-400">
                                Pago em: {formatDate(r.data_pagamento)}
                              </p>
                            </div>
                          </div>

                          {/* Observações de simulação */}
                          {r.observacoes_simulacao && (
                            <p className="text-xs text-orange-700 bg-orange-50 rounded px-2 py-1 mt-2">
                              📝 {r.observacoes_simulacao}
                            </p>
                          )}

                          {/* Ações */}
                          <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100 flex-wrap">
                            {/* Aguardando + pronto para simular → botão Nova Simulação */}
                            {prontoParaSimular && (
                              <Button
                                size="sm"
                                className="text-xs gap-1 bg-orange-500 hover:bg-orange-600 text-white"
                                onClick={() => { setRenovacaoSelecionada(r); setModalSimulacaoOpen(true); }}
                              >
                                📋 Marcar Nova Simulação
                              </Button>
                            )}

                            {/* Nova Simulação → botão Oportunidade Aceita */}
                            {r.status === 'nova_simulacao' && (
                              <Button
                                size="sm"
                                className="text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => marcarOportunidadeAceitaMutation.mutate(r.id)}
                                disabled={marcarOportunidadeAceitaMutation.isPending}
                              >
                                ✅ Oportunidade Aceita
                              </Button>
                            )}

                            {/* Oportunidade Aceita → botão Conversar (envio manual pelo comercial) */}
                            {r.status === 'oportunidade_aceita' && r.cliente_telefone && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => setChatPopup({ nome: r.cliente_nome, telefone: r.cliente_telefone })}
                              >
                                <MessageCircle className="w-3.5 h-3.5" /> Enviar Proposta pelo WhatsApp
                              </Button>
                            )}

                            {/* Chat disponível para aguardando também */}
                            {r.status === 'aguardando' && r.cliente_telefone && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs gap-1 border-green-200 text-green-700 hover:bg-green-50"
                                onClick={() => setChatPopup({ nome: r.cliente_nome, telefone: r.cliente_telefone })}
                              >
                                <MessageCircle className="w-3.5 h-3.5" /> Conversar
                              </Button>
                            )}

                            {/* Cancelar somente para aguardando */}
                            {r.status === 'aguardando' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs gap-1 text-red-500 hover:bg-red-50 ml-auto"
                                onClick={() => cancelarRenovacaoMutation.mutate(r.id)}
                                disabled={cancelarRenovacaoMutation.isPending}
                              >
                                <X className="w-3.5 h-3.5" /> Cancelar
                              </Button>
                            )}
                          </div>

                          {r.motivo_erro && (
                            <p className="text-xs text-red-500 mt-1">⚠️ {r.motivo_erro}</p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA: Planejamento de Compra */}
        <TabsContent value="planejamento">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="w-5 h-5 text-purple-500" />
                    Leads — Planejamento de Compra
                    <span className="ml-1 bg-blue-100 text-blue-700 text-[10px] font-bold rounded px-1.5 py-0.5">Consórcio</span>
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-1">
                    Leads do <strong>Funil de Consórcio</strong> na coluna "Planejamento de Compra". Envie campanhas quinzenais para manter o interesse.
                  </p>
                </div>
                <Button
                  onClick={() => setCampanhaPlanejamentoOpen(true)}
                  disabled={oportunidadesPlanejamento.length === 0}
                  className="gap-2 bg-purple-600 hover:bg-purple-700 whitespace-nowrap flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                  Enviar Campanha Quinzenal
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-purple-700">{oportunidadesPlanejamento.length}</p>
                  <p className="text-xs text-slate-500">Leads no planejamento</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">
                    {oportunidadesPlanejamento.filter(o => o.telefone_lead || o.cliente_telefone).length}
                  </p>
                  <p className="text-xs text-slate-500">Com telefone</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">
                    {logsCampanhasPlanejamento.filter(l => l.oportunidade_id && l.status === 'enviada').length}
                  </p>
                  <p className="text-xs text-slate-500">Campanhas enviadas</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">
                    {oportunidadesPlanejamento.filter(o => (o.campanha_planejamento_ultima || 0) === 4).length}
                  </p>
                  <p className="text-xs text-slate-500">Jornadas completas</p>
                </div>
              </div>

              {/* Busca */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar lead por nome ou telefone..."
                  value={searchPlanejamento}
                  onChange={(e) => setSearchPlanejamento(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Lista */}
              <ScrollArea className="h-[480px] border rounded-lg">
                <div className="p-3 space-y-2">
                  {leadsPlanejaFiltrados.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                      <Target className="w-10 h-10 opacity-30" />
                      <p className="text-sm">Nenhum lead em Planejamento de Compra</p>
                      <p className="text-xs text-center max-w-xs">
                        Mova leads do funil para a coluna "Planejamento de Compra" para aparecerem aqui.
                      </p>
                    </div>
                  ) : (
                    leadsPlanejaFiltrados.map(o => {
                      const temTelefone = !!(o.telefone_lead || o.cliente_telefone);
                      const diasParaFechar = o.data_fechamento_prevista
                        ? Math.ceil((new Date(o.data_fechamento_prevista + 'T12:00:00') - new Date()) / (1000 * 60 * 60 * 24))
                        : null;
                      const ultimaCampanha = o.campanha_planejamento_ultima || 0;
                      const diasNoPlano = o.data_entrada_planejamento
                        ? Math.floor((new Date() - new Date(o.data_entrada_planejamento)) / (1000 * 60 * 60 * 24))
                        : 0;

                      return (
                        <div key={o.id} className="p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="relative flex-shrink-0">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm">
                                  {(o.cliente_nome || o.titulo)?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                {ultimaCampanha === 4 && (
                                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                                    <span className="text-white text-[8px] font-bold">✓</span>
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-sm text-slate-900 truncate">{o.titulo}</p>
                                {o.cliente_nome && <p className="text-xs text-slate-500 truncate">👤 {o.cliente_nome}</p>}
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {(o.telefone_lead || o.cliente_telefone) && (
                                    <span className="text-xs text-slate-400">📞 {o.telefone_lead || o.cliente_telefone}</span>
                                  )}
                                  {o.valor_estimado > 0 && (
                                    <span className="text-xs font-medium text-emerald-700">
                                      💰 {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(o.valor_estimado)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              {!temTelefone && (
                                <Badge variant="secondary" className="text-xs">Sem telefone</Badge>
                              )}
                              {o.data_fechamento_prevista && (
                                <div className="text-right">
                                  <p className="text-[10px] text-slate-400">Previsão fechamento</p>
                                  <p className={`text-xs font-semibold ${diasParaFechar !== null && diasParaFechar <= 30 ? 'text-amber-600' : 'text-slate-700'}`}>
                                    {new Date(o.data_fechamento_prevista + 'T12:00:00').toLocaleDateString('pt-BR')}
                                  </p>
                                </div>
                              )}
                              <div className="text-right mt-1">
                                <p className="text-[10px] text-slate-400">{diasNoPlano}d no plano</p>
                              </div>
                            </div>
                          </div>

                          {/* Bolinhas das 4 campanhas */}
                          <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-[9px] text-slate-400 uppercase font-semibold mb-1.5">Jornada de 60 dias</p>
                                <CampanhasPlanejamentoBadge
                                  ultimaCampanha={ultimaCampanha}
                                  dataEntrada={o.data_entrada_planejamento}
                                  compact={false}
                                />
                              </div>
                              {temTelefone && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs gap-1 border-green-200 text-green-700 hover:bg-green-50 h-7"
                                  onClick={() => setChatPopup({ nome: o.cliente_nome || o.titulo, telefone: o.telefone_lead || o.cliente_telefone })}
                                >
                                  <MessageCircle className="w-3.5 h-3.5" /> Chat
                                </Button>
                              )}
                            </div>
                            {ultimaCampanha === 4 && (
                              <p className="text-[10px] text-emerald-600 font-semibold mt-1">✅ Jornada completa — 4 campanhas enviadas!</p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>


      </Tabs>

      {/* Modal envio campanha planejamento */}
      <Dialog open={campanhaPlanejamentoOpen} onOpenChange={setCampanhaPlanejamentoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-500" />
              Enviar Campanha — Planejamento de Compra
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-sm text-purple-800">
                <strong>{oportunidadesPlanejamento.filter(o => o.telefone_lead || o.cliente_telefone).length} leads</strong> com telefone receberão essa mensagem via WhatsApp.
              </p>
              <p className="text-xs text-purple-600 mt-1">
                Use <code className="bg-purple-100 px-1 rounded">{'{nome}'}</code> para o nome do lead e <code className="bg-purple-100 px-1 rounded">{'{valor}'}</code> para o valor estimado.
              </p>
            </div>

            <div>
              <Label className="text-sm mb-2 block">Mensagem da Campanha *</Label>
              <Textarea
                value={mensagemPlanejamento}
                onChange={(e) => setMensagemPlanejamento(e.target.value)}
                placeholder={`Ex: Olá {nome}! 👋\n\nLembramos que temos uma oferta especial esperando por você.\n\nSua proposta de {valor} ainda está disponível com condições únicas. Que tal fecharmos essa semana?\n\nAguardamos seu contato! 😊`}
                rows={7}
                className="resize-none text-sm"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setCampanhaPlanejamentoOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => enviarCampanhaPlanejamentoMutation.mutate({
                  mensagem: mensagemPlanejamento,
                  leads: oportunidadesPlanejamento.filter(o => o.telefone_lead || o.cliente_telefone),
                })}
                disabled={enviarCampanhaPlanejamentoMutation.isPending || !mensagemPlanejamento.trim()}
                className="gap-2 bg-purple-600 hover:bg-purple-700"
              >
                {enviarCampanhaPlanejamentoMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                  : <><Send className="w-4 h-4" /> Enviar para todos</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Marcar Nova Simulação */}
      <Dialog open={modalSimulacaoOpen} onOpenChange={(v) => { setModalSimulacaoOpen(v); if (!v) { setObsSimulacao(''); setRenovacaoSelecionada(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              📋 Marcar como Nova Simulação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {renovacaoSelecionada && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="font-semibold text-sm text-slate-900">{renovacaoSelecionada.cliente_nome}</p>
                <p className="text-xs text-slate-500">
                  Empréstimo pago em {formatDate(renovacaoSelecionada.data_pagamento)} — {renovacaoSelecionada.banco_nome}
                </p>
                {renovacaoSelecionada.valor_credito > 0 && (
                  <p className="text-xs font-medium text-emerald-700 mt-1">
                    Valor original: {formatCurrency(renovacaoSelecionada.valor_credito)}
                  </p>
                )}
              </div>
            )}
            <p className="text-sm text-slate-600">
              O cliente completou 1 ano desde o pagamento. Marque como <strong>Nova Simulação</strong> para que o time comercial faça uma nova simulação e veja se há uma nova proposta aceita.
            </p>
            <div>
              <Label className="text-sm mb-2 block">Observações (opcional)</Label>
              <Textarea
                value={obsSimulacao}
                onChange={(e) => setObsSimulacao(e.target.value)}
                placeholder="Ex: Cliente já sinalizou interesse. Simular mesmo banco e valor..."
                rows={3}
                className="resize-none text-sm"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setModalSimulacaoOpen(false); setObsSimulacao(''); setRenovacaoSelecionada(null); }}>
                Cancelar
              </Button>
              <Button
                className="gap-2 bg-orange-500 hover:bg-orange-600"
                onClick={() => marcarSimulacaoMutation.mutate({ id: renovacaoSelecionada.id, obs: obsSimulacao })}
                disabled={marcarSimulacaoMutation.isPending}
              >
                {marcarSimulacaoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirmar Nova Simulação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Chat popup */}
      <ChatPopupModal
        open={!!chatPopup}
        onOpenChange={(v) => !v && setChatPopup(null)}
        contato={chatPopup}
        empresaId={empresaId}
        user={user}
      />
    </div>
  );
}