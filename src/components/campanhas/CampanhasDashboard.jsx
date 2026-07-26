import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Megaphone,
  Send,
  CheckCircle2,
  MessageCircle,
  FileText,
  Wallet,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { subDays, format, isAfter, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PERIODOS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'mes', label: 'Este mês' },
  { id: '30dias', label: 'Últimos 30 dias' },
  { id: 'ano', label: 'Último ano' },
];

function dentroPeriodo(data, periodo) {
  if (!data) return false;
  const d = new Date(data);
  const agora = new Date();
  switch (periodo) {
    case 'hoje':
      return format(d, 'yyyy-MM-dd') === format(agora, 'yyyy-MM-dd');
    case 'mes':
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    case '30dias':
      return isAfter(d, subDays(agora, 30));
    case 'ano':
      return d.getFullYear() === agora.getFullYear();
    default:
      return true;
  }
}

const STAT_CARDS = [
  { key: 'total', label: 'Campanhas enviadas', icon: Megaphone, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'enviados', label: 'Mensagens enviadas', icon: Send, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: 'entregues', label: 'Mensagens entregues', icon: CheckCircle2, color: 'text-teal-600', bg: 'bg-teal-50' },
  { key: 'lidos', label: 'Mensagens lidas', icon: MessageCircle, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { key: 'respondidos', label: 'Mensagens respondidas', icon: MessageCircle, color: 'text-purple-600', bg: 'bg-purple-50' },
  { key: 'propostas', label: 'Propostas geradas', icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'vendas', label: 'Vendas realizadas', icon: Users, color: 'text-rose-600', bg: 'bg-rose-50' },
  { key: 'valor', label: 'Valor vendido', icon: Wallet, color: 'text-green-600', bg: 'bg-green-50', money: true },
  { key: 'conversao', label: 'Taxa de conversão', icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50', percent: true },
];

export default function CampanhasDashboard({ empresaId, user, onNova }) {
  const [periodo, setPeriodo] = useState('30dias');

  const { data: campanhas = [], isLoading } = useQuery({
    queryKey: ['campanhas-dashboard', empresaId],
    queryFn: () =>
      base44.entities.Campanha.filter({ empresa_id: empresaId }, '-created_date', 500),
    enabled: !!empresaId,
  });

  const stats = useMemo(() => {
    const alvo = (campanhas || []).filter((c) => dentroPeriodo(c.inicio_execucao || c.created_date, periodo));
    const total = alvo.length;
    const enviados = alvo.reduce((s, c) => s + (c.enviados || 0), 0);
    const entregues = alvo.reduce((s, c) => s + (c.entregues || 0), 0);
    const lidos = alvo.reduce((s, c) => s + (c.lidos || 0), 0);
    const respondidos = alvo.reduce((s, c) => s + (c.respondidos || 0), 0);
    const propostas = alvo.reduce((s, c) => s + (c.propostas_geradas || 0), 0);
    const vendas = alvo.reduce((s, c) => s + (c.vendas_realizadas || 0), 0);
    const valor = alvo.reduce((s, c) => s + (c.valor_vendido || 0), 0);
    const conversao = enviados > 0 ? (vendas / enviados) * 100 : 0;
    return { total, enviados, entregues, lidos, respondidos, propostas, vendas, valor, conversao };
  }, [campanhas, periodo]);

  const chartData = useMemo(() => {
    const hoje = new Date();
    const dias = periodo === 'ano' ? 365 : periodo === '30dias' ? 30 : periodo === 'mes' ? 31 : 7;
    const serie = [];
    for (let i = dias - 1; i >= 0; i--) {
      const dia = subDays(hoje, i);
      const diaStr = format(dia, 'yyyy-MM-dd');
      const alvo = (campanhas || []).filter(
        (c) => c.inicio_execucao && format(new Date(c.inicio_execucao), 'yyyy-MM-dd') === diaStr
      );
      serie.push({
        dia: format(dia, periodo === 'ano' ? 'MMM' : 'dd/MM', { locale: ptBR }),
        enviadas: alvo.reduce((s, c) => s + (c.enviados || 0), 0),
        respondidas: alvo.reduce((s, c) => s + (c.respondidos || 0), 0),
      });
    }
    return serie;
  }, [campanhas, periodo]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard de Campanhas</h1>
          <p className="text-sm text-slate-500">Indicadores de campanhas via WhatsApp API Oficial</p>
        </div>
        <div className="flex items-center gap-2">
          {PERIODOS.map((p) => (
            <Button
              key={p.id}
              variant={periodo === p.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriodo(p.id)}
            >
              {p.label}
            </Button>
          ))}
          <Button size="sm" onClick={onNova} className="ml-2 gap-1.5">
            Nova Campanha
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3">
        {STAT_CARDS.map((s) => {
          const v = stats[s.key] || 0;
          return (
            <Card key={s.key} className="border border-slate-200 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${s.bg}`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{s.label}</p>
                  <p className="text-lg font-bold text-slate-800">
                    {s.money
                      ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : s.percent
                      ? v.toFixed(1) + '%'
                      : v.toLocaleString('pt-BR')}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mensagens enviadas e respondidas</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="enviadas" stroke="#0ea5e9" strokeWidth={2} name="Enviadas" />
                <Line type="monotone" dataKey="respondidas" stroke="#a855f7" strokeWidth={2} name="Respondidas" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Campanhas recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-auto">
            {(campanhas || []).slice(0, 6).map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{c.nome}</p>
                  <p className="text-xs text-slate-400">{c.template_nome || 'Sem template'}</p>
                </div>
                <StatusBadge status={c.status} />
              </div>
            ))}
            {(campanhas || []).length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">
                {isLoading ? 'Carregando…' : 'Nenhuma campanha criada ainda.'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    rascunho: 'bg-slate-100 text-slate-600',
    agendada: 'bg-blue-100 text-blue-700',
    executando: 'bg-amber-100 text-amber-700',
    concluida: 'bg-emerald-100 text-emerald-700',
    cancelada: 'bg-rose-100 text-rose-700',
    pausada: 'bg-orange-100 text-orange-700',
    erro: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}