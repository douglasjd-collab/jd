import React, { useState, useEffect } from 'react';
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

export default function Campanhas() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todas');
  const [filtroRenovacao, setFiltroRenovacao] = useState('aguardando');
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

  // Buscar histórico de campanhas enviadas
  const { data: campanhas = [], refetch: refetchCampanhas } = useQuery({
    queryKey: ['campanhas', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.CampanhaLog.filter({ empresa_id: empresaId }, '-created_date', 1000),
  });

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
      refetchCampanhas();
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
      return todasOport.filter(o => etapaIds.includes(o.etapa_id));
    },
  });

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

  // Filtros histórico
  const campanhasFiltradas = campanhas.filter(c => {
    const matchSearch =
      (c.cliente_nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.cliente_telefone || '').includes(searchTerm);
    return matchSearch && (filtroStatus === 'todas' || c.status === filtroStatus);
  });

  // Filtros renovação
  const renovacoesFiltradas = renovacoes.filter(r => {
    const matchSearch =
      (r.cliente_nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.cliente_telefone || '').includes(searchTerm) ||
      (r.cliente_cpf || '').includes(searchTerm);
    return matchSearch && (filtroRenovacao === 'todas' || r.status === filtroRenovacao);
  });

  const hoje = new Date().toISOString().slice(0, 10);

  // Estatísticas
  const stats = {
    total: campanhas.length,
    enviadas: campanhas.filter(c => c.status === 'enviada').length,
    erros: campanhas.filter(c => c.status === 'erro').length,
    taxa_sucesso: campanhas.length > 0
      ? Math.round((campanhas.filter(c => c.status === 'enviada').length / campanhas.length) * 100)
      : 0,
  };

  const renovacaoStats = {
    aguardando: renovacoes.filter(r => r.status === 'aguardando').length,
    vencidas: renovacoes.filter(r => r.status === 'aguardando' && r.data_agendada_envio <= hoje).length,
    enviadas: renovacoes.filter(r => r.status === 'enviada').length,
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

      {/* Alerta de renovações vencidas */}
      {renovacaoStats.vencidas > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900">
              {renovacaoStats.vencidas} renovação(ões) prontas para envio!
            </p>
            <p className="text-sm text-amber-700">
              Clique em "Executar Campanhas Agora" para enviar as mensagens de renovação.
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
                <p className="text-xs text-slate-500 uppercase font-semibold">Prontas p/ Envio</p>
                <p className="text-3xl font-bold text-red-600 mt-1">{renovacaoStats.vencidas}</p>
                <p className="text-xs text-slate-400 mt-0.5">data chegou</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Enviadas</p>
                <p className="text-3xl font-bold text-emerald-600 mt-1">{stats.enviadas + renovacaoStats.enviadas}</p>
                <p className="text-xs text-slate-400 mt-0.5">total histórico</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-emerald-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Taxa de Sucesso</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">{stats.taxa_sucesso}%</p>
                <p className="text-xs text-slate-400 mt-0.5">enviadas com sucesso</p>
              </div>
              <BarChart3 className="w-8 h-8 text-blue-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Abas */}
      <Tabs defaultValue="fila">
        <TabsList className="mb-4">
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
          <TabsTrigger value="historico" className="gap-1.5">
            <BarChart3 className="w-4 h-4" />
            Histórico de Envios
          </TabsTrigger>
        </TabsList>

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
                <div className="flex gap-1">
                  {[
                    { value: 'aguardando', label: 'Aguardando' },
                    { value: 'enviada', label: 'Enviadas' },
                    { value: 'cancelada', label: 'Canceladas' },
                    { value: 'todas', label: 'Todas' },
                  ].map(f => (
                    <Button
                      key={f.value}
                      variant={filtroRenovacao === f.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFiltroRenovacao(f.value)}
                    >
                      {f.label}
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
                      const vencida = r.status === 'aguardando' && dias !== null && dias <= 0;
                      const proximo = r.status === 'aguardando' && dias !== null && dias > 0 && dias <= 30;

                      return (
                        <div
                          key={r.id}
                          className={`p-3 rounded-lg border transition-colors ${
                            vencida
                              ? 'bg-red-50 border-red-200'
                              : proximo
                              ? 'bg-amber-50 border-amber-200'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
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

                            {/* Datas e status */}
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              {r.status === 'aguardando' && (
                                <div className="text-right">
                                  <p className="text-[10px] text-slate-400">Envio agendado</p>
                                  <p className={`text-xs font-semibold ${vencida ? 'text-red-600' : proximo ? 'text-amber-600' : 'text-slate-700'}`}>
                                    {formatDate(r.data_agendada_envio)}
                                  </p>
                                  {dias !== null && (
                                    <p className={`text-[10px] ${vencida ? 'text-red-500' : 'text-slate-400'}`}>
                                      {vencida ? `${Math.abs(dias)}d atrasado` : `em ${dias}d`}
                                    </p>
                                  )}
                                </div>
                              )}
                              {r.status === 'enviada' && (
                                <Badge className="bg-emerald-100 text-emerald-700 text-xs">✓ Enviada</Badge>
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

                          {/* Ações */}
                          {r.status === 'aguardando' && (
                            <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100">
                              {r.cliente_telefone && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs gap-1 border-green-200 text-green-700 hover:bg-green-50"
                                  onClick={() => setChatPopup({ nome: r.cliente_nome, telefone: r.cliente_telefone })}
                                >
                                  <MessageCircle className="w-3.5 h-3.5" /> Conversar
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs gap-1 text-red-500 hover:bg-red-50 ml-auto"
                                onClick={() => cancelarRenovacaoMutation.mutate(r.id)}
                                disabled={cancelarRenovacaoMutation.isPending}
                              >
                                <X className="w-3.5 h-3.5" /> Cancelar
                              </Button>
                            </div>
                          )}
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
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-1">
                    Leads que estabeleceram um prazo futuro de fechamento. Envie campanhas quinzenais para manter o interesse.
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
              <div className="grid grid-cols-3 gap-3 mb-2">
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
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      oportunidadesPlanejamento.reduce((s, o) => s + (o.valor_estimado || 0), 0)
                    )}
                  </p>
                  <p className="text-xs text-slate-500">Valor total estimado</p>
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

                      return (
                        <div key={o.id} className="p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                                {(o.cliente_nome || o.titulo)?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <div className="min-w-0">
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
                                  {diasParaFechar !== null && (
                                    <p className="text-[10px] text-slate-400">
                                      {diasParaFechar > 0 ? `em ${diasParaFechar}d` : `${Math.abs(diasParaFechar)}d atrás`}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          {temTelefone && (
                            <div className="mt-2 pt-2 border-t border-slate-100">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs gap-1 border-green-200 text-green-700 hover:bg-green-50"
                                onClick={() => setChatPopup({ nome: o.cliente_nome || o.titulo, telefone: o.telefone_lead || o.cliente_telefone })}
                              >
                                <MessageCircle className="w-3.5 h-3.5" /> Conversar agora
                              </Button>
                            </div>
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

        {/* ABA: Histórico */}
        <TabsContent value="historico">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="w-5 h-5" />
                Histórico de Campanhas Enviadas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Buscar por cliente ou telefone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-1">
                  {['todas', 'enviada', 'erro'].map(s => (
                    <Button
                      key={s}
                      variant={filtroStatus === s ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFiltroStatus(s)}
                      className="capitalize"
                    >
                      {s === 'todas' ? 'Todas' : s}
                    </Button>
                  ))}
                </div>
              </div>

              <ScrollArea className="h-[500px] border rounded-lg">
                <div className="space-y-2 p-3">
                  {campanhasFiltradas.length === 0 ? (
                    <div className="flex items-center justify-center h-64 text-slate-400">
                      <p className="text-sm">Nenhuma campanha encontrada</p>
                    </div>
                  ) : (
                    campanhasFiltradas.map(c => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-slate-900">{c.cliente_nome}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{c.cliente_telefone}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {c.tipo_campanha === 'aniversario_emprestimo' ? 'Aniversário de Empréstimo' : c.tipo_campanha}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 ml-4">
                          <span className="text-xs text-slate-500">
                            {new Date(c.created_date).toLocaleDateString('pt-BR')}
                          </span>
                          <Badge
                            variant={c.status === 'enviada' ? 'default' : 'destructive'}
                          >
                            {c.status === 'enviada' ? '✓ Enviada' : '✗ Erro'}
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