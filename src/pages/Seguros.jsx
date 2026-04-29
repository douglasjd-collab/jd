import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Shield, Plus, Search, Filter, RefreshCw, Loader2,
  Clock, AlertTriangle, CheckCircle, XCircle, TrendingUp,
  MoreVertical, Phone, MessageSquare, Calendar, ChevronRight
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import PropostaSeguroModal from '@/components/seguros/PropostaSeguroModal';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const STATUS_CONFIG = {
  em_dia:       { label: 'Em Dia',       color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  atrasado:     { label: 'Atrasado',     color: 'bg-red-100 text-red-700 border-red-200' },
  em_renovacao: { label: 'Em Renovação', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  vencido:      { label: 'Vencido',      color: 'bg-slate-100 text-slate-700 border-slate-200' },
  cancelado:    { label: 'Cancelado',    color: 'bg-slate-100 text-slate-500 border-slate-200' },
  pendente:     { label: 'Pendente',     color: 'bg-blue-100 text-blue-700 border-blue-200' },
};

const TIPO_SEGURO_LABEL = {
  auto: '🚗 Auto', vida: '❤️ Vida', residencial: '🏠 Residencial',
  empresarial: '🏢 Empresarial', saude: '🏥 Saúde', outros: '📋 Outros',
};

export default function Seguros() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [propostaModalOpen, setPropostaModalOpen] = useState(false);
  const [propostaSelecionada, setPropostaSelecionada] = useState(null);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroSeguradora, setFiltroSeguradora] = useState('todas');
  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
    const emp = me.empresa_id || null;
    if (emp) { setEmpresaId(emp); return; }
    const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' }, '-created_date', 1);
    if (colabs?.[0]?.empresa_id) setEmpresaId(colabs[0].empresa_id);
  };

  const { data: propostas = [], isLoading, refetch } = useQuery({
    queryKey: ['propostas-seguro', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.PropostaSeguro.filter({ empresa_id: empresaId }, '-created_date', 2000),
  });

  const { data: seguradoras = [] } = useQuery({
    queryKey: ['seguradoras', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Seguradora.filter({ empresa_id: empresaId }, 'nome', 200),
  });

  const hoje = new Date();

  const propostasFiltradas = propostas.filter(p => {
    if (filtroStatus !== 'todos' && p.status !== filtroStatus) return false;
    if (filtroSeguradora !== 'todas' && p.seguradora_id !== filtroSeguradora) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (!(p.cliente_nome || '').toLowerCase().includes(q) &&
          !(p.seguradora_nome || '').toLowerCase().includes(q) &&
          !(p.numero_proposta || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const stats = {
    ativos: propostas.filter(p => p.status === 'em_dia').length,
    renovacao: propostas.filter(p => p.status === 'em_renovacao').length,
    atrasados: propostas.filter(p => p.status === 'atrasado').length,
    vencidos: propostas.filter(p => p.status === 'vencido').length,
  };

  const handleEditar = (p) => { setPropostaSelecionada(p); setPropostaModalOpen(true); };
  const handleNova = () => { setPropostaSelecionada(null); setPropostaModalOpen(true); };

  const handleCancelar = async (p) => {
    if (!confirm(`Cancelar seguro de ${p.cliente_nome}?`)) return;
    await base44.entities.PropostaSeguro.update(p.id, { status: 'cancelado', data_cancelamento: new Date().toISOString().slice(0, 10) });
    toast.success('Seguro cancelado');
    refetch();
  };

  const handleRenovar = async (p) => {
    const hoje = new Date();
    const novaInicio = new Date(p.data_vencimento || hoje);
    novaInicio.setDate(novaInicio.getDate() + 1);
    const novaFim = new Date(novaInicio);
    if (p.tipo_plano === 'anual') novaFim.setFullYear(novaFim.getFullYear() + 1);
    else novaFim.setMonth(novaFim.getMonth() + 1);

    const novaRenovacao = new Date(novaFim);
    novaRenovacao.setDate(novaRenovacao.getDate() - 30);

    await base44.entities.PropostaSeguro.create({
      ...p,
      id: undefined,
      created_date: undefined,
      updated_date: undefined,
      numero_proposta: undefined,
      data_inicio: novaInicio.toISOString().slice(0, 10),
      data_vencimento: novaFim.toISOString().slice(0, 10),
      data_renovacao: novaRenovacao.toISOString().slice(0, 10),
      status: 'em_dia',
      renovacao_origem_id: p.id,
      numero_renovacao: (p.numero_renovacao || 0) + 1,
    });
    await base44.entities.PropostaSeguro.update(p.id, { status: 'vencido' });
    toast.success('Seguro renovado com sucesso!');
    refetch();
  };

  const diasVencimento = (p) => {
    if (!p.data_vencimento) return null;
    return differenceInDays(parseISO(p.data_vencimento), hoje);
  };

  if (!user) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-7 h-7 text-blue-600" /> Seguros
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestão completa de apólices e renovações</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="w-4 h-4" /> Atualizar
          </Button>
          <Button onClick={handleNova} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Nova Proposta
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Seguros Ativos', value: stats.ativos, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Em Renovação', value: stats.renovacao, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Atrasados', value: stats.atrasados, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Vencidos', value: stats.vencidos, icon: XCircle, color: 'text-slate-600', bg: 'bg-slate-50' },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg}`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input placeholder="Buscar por cliente, seguradora..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroSeguradora} onValueChange={setFiltroSeguradora}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Seguradora" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            {seguradoras.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-slate-300" /></div>
          ) : propostasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Shield className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">Nenhuma proposta encontrada</p>
              <p className="text-sm mt-1">Clique em "Nova Proposta" para começar</p>
            </div>
          ) : (
            <div className="divide-y">
              {/* Header da tabela */}
              <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50 rounded-t-xl">
                <div className="col-span-3">Cliente</div>
                <div className="col-span-2">Seguradora</div>
                <div className="col-span-1">Tipo</div>
                <div className="col-span-2">Vigência</div>
                <div className="col-span-1 text-center">Parcela</div>
                <div className="col-span-1 text-center">Recorrência<br />(%)</div>
                <div className="col-span-1 text-center">Status</div>
                <div className="col-span-1"></div>
              </div>
              {propostasFiltradas.map((p) => {
                const dias = diasVencimento(p);
                const sc = STATUS_CONFIG[p.status] || STATUS_CONFIG.em_dia;
                return (
                  <div key={p.id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-slate-50 transition-colors">
                    <div className="col-span-3">
                      <p className="font-medium text-sm text-slate-900">{p.cliente_nome || '—'}</p>
                      <p className="text-xs text-slate-400">{p.numero_proposta || p.id?.slice(-6)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-slate-700">{p.seguradora_nome || '—'}</p>
                      <p className="text-xs text-slate-400">{TIPO_SEGURO_LABEL[p.tipo_seguro] || ''}</p>
                    </div>
                    <div className="col-span-1">
                      <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium capitalize">{p.tipo_plano}</span>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-slate-700">{p.data_inicio ? format(parseISO(p.data_inicio), 'dd/MM/yy') : '—'} → {p.data_vencimento ? format(parseISO(p.data_vencimento), 'dd/MM/yy') : '—'}</p>
                      {dias !== null && (
                        <p className={`text-xs font-medium ${dias < 0 ? 'text-red-500' : dias <= 30 ? 'text-amber-500' : 'text-slate-400'}`}>
                          {dias < 0 ? `${Math.abs(dias)}d vencido` : `${dias}d restantes`}
                        </p>
                      )}
                    </div>
                    <div className="col-span-1 text-center">
                      <p className="text-sm font-semibold text-slate-900">
                        {p.valor_parcela ? `R$ ${p.valor_parcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                      </p>
                    </div>
                    <div className="col-span-1 text-center">
                      <p className="text-sm text-emerald-600 font-medium">
                        {p.valor_adesao ? `${p.valor_adesao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%` : '—'}
                      </p>
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${sc.color}`}>{sc.label}</span>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditar(p)}><ChevronRight className="w-4 h-4 mr-2" />Editar</DropdownMenuItem>
                          {['em_renovacao', 'vencido'].includes(p.status) && (
                            <DropdownMenuItem onClick={() => handleRenovar(p)} className="text-emerald-600"><RefreshCw className="w-4 h-4 mr-2" />Renovar agora</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => toast.info('Abrir WhatsApp em desenvolvimento')}><MessageSquare className="w-4 h-4 mr-2" />WhatsApp</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCancelar(p)} className="text-red-600"><XCircle className="w-4 h-4 mr-2" />Cancelar seguro</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <PropostaSeguroModal
        open={propostaModalOpen}
        onOpenChange={setPropostaModalOpen}
        proposta={propostaSelecionada}
        empresaId={empresaId}
        onSalvo={() => { refetch(); setPropostaModalOpen(false); }}
      />
    </div>
  );
}