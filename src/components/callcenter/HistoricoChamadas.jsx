import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Phone, PhoneIncoming, PhoneOutgoing, Play, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const statusConfig = {
  'Completada': { color: 'bg-green-100 text-green-700', label: 'Completada' },
  'Nao atendida': { color: 'bg-yellow-100 text-yellow-700', label: 'Não Atendida' },
  'Ocupado': { color: 'bg-red-100 text-red-700', label: 'Ocupado' },
  'Falha': { color: 'bg-red-100 text-red-700', label: 'Falha' },
};

export default function HistoricoChamadas() {
  const [chamadas, setChamadas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tipo, setTipo] = useState('');
  const [data, setData] = useState('');

  const carregar = async () => {
    setLoading(true);
    const res = await base44.functions.invoke('nvoipCallCenter', {
      action: 'historicoChamadas',
      type: tipo || undefined,
      date: data || undefined,
    });
    setLoading(false);
    if (res.data?.calls) {
      setChamadas(res.data.calls.filter(c => c && c.date));
    }
  };

  useEffect(() => { carregar(); }, [tipo, data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={null}>Todos</SelectItem>
            <SelectItem value="inbound">Entrantes</SelectItem>
            <SelectItem value="outbound">Saintes</SelectItem>
          </SelectContent>
        </Select>

        <Select value={data} onValueChange={setData}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={null}>Todos</SelectItem>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="yesterday">Ontem</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : chamadas.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Phone className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>Nenhuma chamada encontrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {chamadas.map((c, i) => {
            const cfg = statusConfig[c.status] || { color: 'bg-slate-100 text-slate-600', label: c.status };
            return (
              <div key={i} className="flex items-center justify-between p-3 bg-white border rounded-lg hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-3">
                  {c.type === 'outbound'
                    ? <PhoneOutgoing className="w-5 h-5 text-blue-500" />
                    : <PhoneIncoming className="w-5 h-5 text-green-500" />
                  }
                  <div>
                    <p className="font-medium text-sm">{c.destination || c.origin}</p>
                    <p className="text-xs text-slate-400">{c.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{c.duration}</span>
                  {c.cost && <span className="text-xs text-slate-500">{c.cost}</span>}
                  <Badge className={cfg.color}>{cfg.label}</Badge>
                  {c.audio && (
                    <a href={c.audio} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="sm">
                        <Play className="w-4 h-4" />
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}