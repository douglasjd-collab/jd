import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Phone, PhoneIncoming, PhoneOutgoing, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusConfig = {
  atendida:     { color: 'bg-green-100 text-green-700', label: 'Atendida' },
  nao_atendida: { color: 'bg-yellow-100 text-yellow-700', label: 'Não Atendida' },
  ocupado:      { color: 'bg-red-100 text-red-700', label: 'Ocupado' },
  em_andamento: { color: 'bg-blue-100 text-blue-700', label: 'Em Andamento' },
};

function formatDuracao(seg) {
  if (!seg || seg <= 0) return '-';
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}m ${s}s`;
}

function formatData(iso) {
  if (!iso) return '-';
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}

export default function HistoricoChamadas({ empresaId, usuarioId, perfil }) {
  const [chamadas, setChamadas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tipo, setTipo] = useState('todos');
  const [periodo, setPeriodo] = useState('todos');

  const carregar = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const filtro = { empresa_id: empresaId };
      // Se não for admin/gerente, filtra só as do usuário
      if (perfil && !['admin', 'gerente', 'master', 'super_admin'].includes(perfil)) {
        filtro.usuario_id = usuarioId;
      }
      if (tipo !== 'todos') filtro.direcao = tipo;

      let registros = await base44.entities.HistoricoChamadaMicroSIP.filter(filtro, '-inicio', 100);

      // Filtro de período no frontend
      if (periodo !== 'todos') {
        const agora = new Date();
        const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
        const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
        const semana = new Date(hoje); semana.setDate(semana.getDate() - 7);

        registros = registros.filter(c => {
          const d = c.inicio ? new Date(c.inicio) : null;
          if (!d) return false;
          if (periodo === 'hoje') return d >= hoje;
          if (periodo === 'ontem') return d >= ontem && d < hoje;
          if (periodo === 'semana') return d >= semana;
          return true;
        });
      }

      setChamadas(registros);
    } catch (e) {
      console.error('Erro ao carregar histórico:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, [tipo, periodo, empresaId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="entrada">Entrantes</SelectItem>
            <SelectItem value="saida">Saintes</SelectItem>
          </SelectContent>
        </Select>

        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="hoje">Hoje</SelectItem>
            <SelectItem value="ontem">Ontem</SelectItem>
            <SelectItem value="semana">Esta semana</SelectItem>
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
          <p className="text-xs mt-1">As chamadas realizadas/recebidas pelo Webphone aparecem aqui</p>
        </div>
      ) : (
        <div className="space-y-2">
          {chamadas.map((c) => {
            const cfg = statusConfig[c.status] || { color: 'bg-slate-100 text-slate-600', label: c.status || '-' };
            const isEntrada = c.direcao === 'entrada';
            return (
              <div key={c.id} className="flex items-center justify-between p-3 bg-white border rounded-lg hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-3">
                  {isEntrada
                    ? <PhoneIncoming className="w-5 h-5 text-green-500 flex-shrink-0" />
                    : <PhoneOutgoing className="w-5 h-5 text-blue-500 flex-shrink-0" />
                  }
                  <div>
                    <p className="font-medium text-sm">{c.numero || '-'}</p>
                    {c.cliente_nome && (
                      <p className="text-xs text-slate-500">{c.cliente_nome}</p>
                    )}
                    <p className="text-xs text-slate-400">{formatData(c.inicio)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{formatDuracao(c.duracao_segundos)}</span>
                  {c.usuario_nome && (
                    <span className="text-xs text-slate-400 hidden md:inline">{c.usuario_nome}</span>
                  )}
                  <Badge className={cfg.color}>{cfg.label}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}