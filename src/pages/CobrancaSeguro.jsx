import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, MessageSquare, DollarSign, AlertTriangle, Check, RefreshCw, Phone } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

export default function CobrancaSeguro() {
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

  const { data: atrasadas = [], isLoading, refetch } = useQuery({
    queryKey: ['cobranca-seguro', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const all = await base44.entities.PropostaSeguro.filter({ empresa_id: empresaId }, '-created_date', 2000);
      return all.filter(p => p.status === 'atrasado');
    },
  });

  const hoje = new Date();

  const filtradas = atrasadas.filter(p => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (p.cliente_nome || '').toLowerCase().includes(q) || (p.seguradora_nome || '').toLowerCase().includes(q);
  });

  const diasAtraso = (p) => {
    if (!p.data_vencimento) return 0;
    return Math.max(0, differenceInDays(hoje, parseISO(p.data_vencimento)));
  };

  const urgenciaColor = (dias) => {
    if (dias >= 7) return 'border-l-red-600';
    if (dias >= 3) return 'border-l-orange-500';
    return 'border-l-yellow-400';
  };

  const handleBaixarPagamento = async (p) => {
    await base44.entities.PropostaSeguro.update(p.id, { status: 'em_dia' });
    toast.success('Pagamento registrado! Seguro normalizado.');
    refetch();
  };

  const handleCancelar = async (p) => {
    if (!confirm(`Cancelar seguro de ${p.cliente_nome}?`)) return;
    await base44.entities.PropostaSeguro.update(p.id, { status: 'cancelado', data_cancelamento: new Date().toISOString().slice(0, 10) });
    toast.success('Seguro cancelado');
    refetch();
  };

  if (!user) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="w-7 h-7 text-red-600" /> Cobrança de Seguros
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Seguros com pagamento atrasado — {filtradas.length} em aberto</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </Button>
      </div>

      {/* Stats rápidos */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'D+1 a D+3', count: filtradas.filter(p => { const d = diasAtraso(p); return d >= 1 && d <= 3; }).length, color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'D+4 a D+7', count: filtradas.filter(p => { const d = diasAtraso(p); return d >= 4 && d <= 7; }).length, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Mais de 7 dias', count: filtradas.filter(p => diasAtraso(p) > 7).length, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><AlertTriangle className={`w-5 h-5 ${s.color}`} /></div>
              <div>
                <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <Input placeholder="Buscar cliente ou seguradora..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9 h-9 max-w-sm" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-slate-300" /></div>
      ) : filtradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <Check className="w-12 h-12 mb-3 text-emerald-400" />
          <p className="font-medium text-slate-600">Nenhuma cobrança em aberto</p>
          <p className="text-sm">Todos os seguros estão em dia!</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtradas.sort((a, b) => diasAtraso(b) - diasAtraso(a)).map((p) => {
            const dias = diasAtraso(p);
            return (
              <Card key={p.id} className={`border-0 shadow-sm border-l-4 ${urgenciaColor(dias)}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{p.cliente_nome}</p>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${dias >= 7 ? 'bg-red-100 text-red-700' : dias >= 3 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          D+{dias}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{p.seguradora_nome} · {p.tipo_plano === 'anual' ? 'Anual' : 'Mensal'}</p>
                      {p.cliente_telefone && <p className="text-xs text-slate-400 mt-0.5">{p.cliente_telefone}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-900">
                        R$ {(p.valor_parcela || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-slate-400">Venceu em {p.data_vencimento ? format(parseISO(p.data_vencimento), 'dd/MM/yyyy') : '—'}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Button size="sm" onClick={() => handleBaixarPagamento(p)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-8">
                      <Check className="w-3.5 h-3.5" /> Registrar Pagamento
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toast.info('WhatsApp em desenvolvimento')} className="gap-1.5 h-8">
                      <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                    </Button>
                    {p.cliente_telefone && (
                      <Button size="sm" variant="outline" onClick={() => window.open(`tel:${p.cliente_telefone}`)} className="gap-1.5 h-8">
                        <Phone className="w-3.5 h-3.5" /> Ligar
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => handleCancelar(p)} className="gap-1.5 h-8 text-red-600 hover:text-red-700 hover:border-red-300 ml-auto">
                      Cancelar seguro
                    </Button>
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