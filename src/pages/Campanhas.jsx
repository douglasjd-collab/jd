import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  User,
  Building2,
  DollarSign,
  X,
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
        <Button
          onClick={() => executarMutation.mutate()}
          disabled={executarMutation.isPending}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
        >
          {executarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Executar Campanhas Agora
        </Button>
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