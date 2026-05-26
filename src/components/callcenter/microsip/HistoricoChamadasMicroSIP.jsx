import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusMap = {
  atendida: { label: 'Atendida', color: 'bg-green-100 text-green-700' },
  nao_atendida: { label: 'Não atendida', color: 'bg-red-100 text-red-700' },
  em_andamento: { label: 'Em andamento', color: 'bg-yellow-100 text-yellow-700' },
  ocupado: { label: 'Ocupado', color: 'bg-orange-100 text-orange-700' },
};

const formatDuracao = (s) => {
  if (!s) return '-';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};

export default function HistoricoChamadasMicroSIP({ empresaId }) {
  const [chamadas, setChamadas] = useState([]);
  const [loading, setLoading] = useState(true);

  const carregar = async () => {
    if (!empresaId) return;
    setLoading(true);
    const data = await base44.entities.HistoricoChamadaMicroSIP.filter(
      { empresa_id: empresaId },
      '-created_date',
      100
    );

    // Auto-encerra chamadas "em_andamento" com mais de 2 horas (ficaram presas)
    const limite = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const presas = data.filter(c => c.status === 'em_andamento' && c.inicio && c.inicio < limite);
    for (const c of presas) {
      await base44.entities.HistoricoChamadaMicroSIP.update(c.id, {
        status: 'nao_atendida',
        fim: c.inicio,
        duracao_segundos: 0,
      });
    }

    // Recarrega se havia presas
    if (presas.length > 0) {
      const atualizado = await base44.entities.HistoricoChamadaMicroSIP.filter(
        { empresa_id: empresaId },
        '-created_date',
        100
      );
      setChamadas(atualizado);
    } else {
      setChamadas(data);
    }
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [empresaId]);

  const DirecaoIcon = ({ direcao, status }) => {
    if (status === 'nao_atendida') return <PhoneMissed className="w-4 h-4 text-red-500" />;
    if (direcao === 'entrada') return <PhoneIncoming className="w-4 h-4 text-blue-500" />;
    return <PhoneOutgoing className="w-4 h-4 text-green-500" />;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700 text-sm">Histórico MicroSIP</h3>
        <Button variant="ghost" size="sm" onClick={carregar} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : chamadas.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">
          <Phone className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Nenhuma chamada registrada ainda
        </div>
      ) : (
        <div className="space-y-1.5">
          {chamadas.map(c => (
            <div key={c.id} className="flex items-center gap-3 p-3 bg-white border rounded-xl hover:bg-slate-50 transition-colors">
              <DirecaoIcon direcao={c.direcao} status={c.status} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm text-slate-800 truncate">
                    {c.cliente_nome || c.numero}
                  </p>
                  {c.cliente_id && (
                    <a
                      href={createPageUrl(`ClienteDetalhes?id=${c.cliente_id}`)}
                      className="text-blue-500 hover:text-blue-700"
                      title="Abrir ficha"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {c.cliente_nome ? c.numero : ''}{' '}
                  {c.inicio ? format(parseISO(c.inicio), "dd/MM HH:mm", { locale: ptBR }) : ''}
                  {' · '}{formatDuracao(c.duracao_segundos)}
                </p>
              </div>

              <div className="shrink-0 text-right space-y-1">
                <Badge className={`text-xs ${(statusMap[c.status] || statusMap.em_andamento).color}`}>
                  {(statusMap[c.status] || statusMap.em_andamento).label}
                </Badge>
                <p className="text-xs text-slate-400 capitalize">{c.direcao}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}