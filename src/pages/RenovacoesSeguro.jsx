import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { RefreshCw, Clock, Loader2, Search, MessageSquare, Check, X, AlertTriangle, Shield } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

export default function RenovacoesSeguro() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [busca, setBusca] = useState('');

  useEffect(() => { loadUser(); }, []);
  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
    if (me.empresa_id) { setEmpresaId(me.empresa_id); return; }
    const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' }, '-created_date', 1);
    if (colabs?.[0]?.empresa_id) setEmpresaId(colabs[0].empresa_id);
  };

  const { data: renovacoes = [], isLoading, refetch } = useQuery({
    queryKey: ['renovacoes-seguro', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const all = await base44.entities.PropostaSeguro.filter({ empresa_id: empresaId }, '-data_vencimento', 2000);
      return all.filter(p => p.status === 'em_renovacao' || p.status === 'vencido');
    },
  });

  const { data: vencendo30 = [] } = useQuery({
    queryKey: ['vencendo-30-seguro', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const all = await base44.entities.PropostaSeguro.filter({ empresa_id: empresaId }, 'data_vencimento', 2000);
      return all.filter(p => {
        if (!p.data_vencimento || p.status === 'cancelado') return false;
        const d = differenceInDays(parseISO(p.data_vencimento), new Date());
        return d >= 0 && d <= 30;
      });
    },
  });

  const hoje = new Date();

  const filtradas = renovacoes.filter(p => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (p.cliente_nome || '').toLowerCase().includes(q) || (p.seguradora_nome || '').toLowerCase().includes(q);
  });

  const handleRenovar = async (p) => {
    const novaInicio = new Date(p.data_vencimento || hoje);
    novaInicio.setDate(novaInicio.getDate() + 1);
    const novaFim = new Date(novaInicio);
    if (p.tipo_plano === 'anual') novaFim.setFullYear(novaFim.getFullYear() + 1);
    else novaFim.setMonth(novaFim.getMonth() + 1);
    const novaRenovacao = new Date(novaFim);
    novaRenovacao.setDate(novaRenovacao.getDate() - 30);

    await base44.entities.PropostaSeguro.create({
      ...p, id: undefined, created_date: undefined, updated_date: undefined, numero_proposta: undefined,
      data_inicio: novaInicio.toISOString().slice(0, 10),
      data_vencimento: novaFim.toISOString().slice(0, 10),
      data_renovacao: novaRenovacao.toISOString().slice(0, 10),
      status: 'em_dia', renovacao_origem_id: p.id,
      numero_renovacao: (p.numero_renovacao || 0) + 1,
    });
    await base44.entities.PropostaSeguro.update(p.id, { status: 'vencido' });
    toast.success('Seguro renovado!');
    refetch();
  };

  const handleNaoRenovado = async (p) => {
    await base44.entities.PropostaSeguro.update(p.id, { status: 'cancelado', motivo_cancelamento: 'Não renovado pelo cliente' });
    toast.success('Marcado como não renovado');
    refetch();
  };

  const handleAdiado = (p) => {
    toast.success('Contato adiado para amanhã');
  };

  if (!user) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <RefreshCw className="w-7 h-7 text-amber-600" /> Renovações
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Seguros em renovação ou vencidos — {filtradas.length} pendentes</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </Button>
      </div>

      {/* Relatório: Vencimentos nos próximos 30 dias */}
      <Card className="border-0 shadow-sm bg-amber-50 border border-amber-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-amber-800">
            <Clock className="w-5 h-5 text-amber-600" />
            Seguros com vencimento nos próximos 30 dias — {vencendo30.length} encontrado{vencendo30.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {vencendo30.length === 0 ? (
            <p className="text-sm text-amber-700 text-center py-5">Nenhum seguro vencendo nos próximos 30 dias.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-amber-200">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-amber-700 uppercase tracking-wide">Cliente</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-amber-700 uppercase tracking-wide">Vendedor</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-amber-700 uppercase tracking-wide">Seguradora</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-amber-700 uppercase tracking-wide">Tipo</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-amber-700 uppercase tracking-wide">Vencimento</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-amber-700 uppercase tracking-wide">Dias</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-amber-700 uppercase tracking-wide">Parcela</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {vencendo30.map((p) => {
                    const dias = differenceInDays(parseISO(p.data_vencimento), hoje);
                    const urgente = dias <= 7;
                    return (
                      <tr key={p.id} className="bg-white/60 hover:bg-white transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800">{p.cliente_nome || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{p.vendedor_nome || '—'}</td>
                        <td className="px-4 py-3 text-slate-500">{p.seguradora_nome || '—'}</td>
                        <td className="px-4 py-3 text-slate-500 capitalize">{p.tipo_plano || '—'}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{format(parseISO(p.data_vencimento), 'dd/MM/yyyy')}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${urgente ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            {dias === 0 ? 'Hoje' : `${dias}d`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-700 whitespace-nowrap">
                          R$ {(p.valor_parcela || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <Input placeholder="Buscar cliente ou seguradora..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9 h-9 max-w-sm" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-slate-300" /></div>
      ) : filtradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <Check className="w-12 h-12 mb-3 text-emerald-400" />
          <p className="font-medium text-slate-600">Nenhuma renovação pendente</p>
          <p className="text-sm mt-1">Todos os seguros estão em dia!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtradas.map((p) => {
            const dias = p.data_vencimento ? differenceInDays(parseISO(p.data_vencimento), hoje) : null;
            const urgente = dias !== null && dias <= 7;
            return (
              <Card key={p.id} className={`border-0 shadow-sm ${urgente ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-amber-400'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${urgente ? 'bg-red-50' : 'bg-amber-50'}`}>
                        <AlertTriangle className={`w-5 h-5 ${urgente ? 'text-red-600' : 'text-amber-600'}`} />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{p.cliente_nome}</p>
                        <p className="text-sm text-slate-500">{p.seguradora_nome} · {p.tipo_plano === 'anual' ? 'Anual' : 'Mensal'}</p>
                        {p.veiculo_modelo && <p className="text-xs text-slate-400">{p.veiculo_marca} {p.veiculo_modelo} {p.veiculo_ano}</p>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-sm font-bold ${dias !== null && dias < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                        {dias !== null ? (dias < 0 ? `Vencido há ${Math.abs(dias)} dias` : `Vence em ${dias} dias`) : '—'}
                      </span>
                      <span className="text-xs text-slate-400">Vencimento: {p.data_vencimento ? format(parseISO(p.data_vencimento), 'dd/MM/yyyy') : '—'}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Button size="sm" onClick={() => handleRenovar(p)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-8">
                      <RefreshCw className="w-3.5 h-3.5" /> Renovar agora
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toast.info('WhatsApp em desenvolvimento')} className="gap-1.5 h-8">
                      <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleAdiado(p)} className="gap-1.5 h-8">
                      <Clock className="w-3.5 h-3.5" /> Adiar contato
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleNaoRenovado(p)} className="gap-1.5 h-8 text-red-600 hover:text-red-700 hover:border-red-300">
                      <X className="w-3.5 h-3.5" /> Não renovado
                    </Button>
                    {p.valor_parcela && (
                      <span className="ml-auto text-sm font-semibold text-slate-700">
                        R$ {p.valor_parcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}