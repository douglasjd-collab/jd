import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Calendar, Clock, MapPin, Search, Edit2, Trash2, CheckCircle,
  XCircle, Plus, ChevronLeft, ChevronRight, CalendarDays, MoreVertical,
  AlertCircle, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  format, parseISO, addDays, subDays, startOfWeek, endOfWeek,
  isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, addMonths,
  subMonths, isToday, isBefore, startOfDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── helpers ─────────────────────────────────────────────────────────────────
function formatHour(iso) {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'HH:mm');
  } catch {
    return '';
  }
}

function formatDateBR(iso) {
  if (!iso) return '';
  try {
    return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return '';
  }
}

function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

const STATUS_CONFIG = {
  agendado:  { label: 'Agendado',   color: 'bg-blue-100 text-blue-700 border-blue-200',   dot: 'bg-blue-500',   left: 'border-l-blue-500' },
  confirmado:{ label: 'Confirmado', color: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500',  left: 'border-l-green-500' },
  concluido: { label: 'Concluído',  color: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400',  left: 'border-l-slate-400' },
  cancelado: { label: 'Cancelado',  color: 'bg-red-100 text-red-700 border-red-200',       dot: 'bg-red-500',    left: 'border-l-red-400' },
  remarcado: { label: 'Remarcado',  color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-400', left: 'border-l-orange-400' },
};

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-red-500', 'bg-teal-500', 'bg-pink-500', 'bg-indigo-500',
];

function avatarColor(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Mini-calendário ──────────────────────────────────────────────────────────
function MiniCalendar({ selectedDate, onSelectDate, compromissos }) {
  const [viewMonth, setViewMonth] = useState(startOfMonth(selectedDate));

  const days = eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) });
  const firstWeekday = (days[0].getDay() + 6) % 7; // segunda=0

  const dotsMap = useMemo(() => {
    const map = {};
    compromissos.forEach(c => {
      if (!c.inicio) return;
      try {
        const key = format(parseISO(c.inicio), 'yyyy-MM-dd');
        if (!map[key]) map[key] = { agendado: 0, confirmado: 0, concluido: 0, remarcado: 0, cancelado: 0 };
        map[key][c.status] = (map[key][c.status] || 0) + 1;
      } catch {}
    });
    return map;
  }, [compromissos]);

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      {/* header mês */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800">
          {format(viewMonth, 'MMMM yyyy', { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())}
        </h3>
        <div className="flex gap-1">
          <button onClick={() => setViewMonth(subMonths(viewMonth, 1))} className="p-1 hover:bg-slate-100 rounded">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMonth(addMonths(viewMonth, 1))} className="p-1 hover:bg-slate-100 rounded">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* dias da semana */}
      <div className="grid grid-cols-7 text-center text-xs text-slate-400 font-medium mb-1">
        {['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d => <div key={d}>{d}</div>)}
      </div>

      {/* células */}
      <div className="grid grid-cols-7 gap-0.5">
        {Array(firstWeekday).fill(null).map((_, i) => <div key={`e${i}`} />)}
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const dots = dotsMap[key];
          const isSelected = isSameDay(day, selectedDate);
          const isTod = isToday(day);
          return (
            <button
              key={key}
              onClick={() => onSelectDate(day)}
              className={`
                flex flex-col items-center justify-center rounded-lg py-1 text-xs font-medium transition-all
                ${isSelected ? 'bg-blue-600 text-white' : isTod ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-100 text-slate-700'}
              `}
            >
              {format(day, 'd')}
              {dots && (
                <div className="flex gap-0.5 mt-0.5">
                  {dots.agendado > 0 && <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />}
                  {dots.confirmado > 0 && <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-green-500'}`} />}
                  {dots.remarcado > 0 && <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-orange-400'}`} />}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* legenda */}
      <div className="mt-4 pt-3 border-t flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(STATUS_CONFIG).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1 text-xs text-slate-500">
            <span className={`w-2 h-2 rounded-full ${v.dot}`} />
            {v.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Timeline lateral (mini visualização semanal) ────────────────────────────
function WeekTimeline({ selectedDate, compromissos, onSelectDate }) {
  const weekDays = eachDayOfInterval({
    start: startOfWeek(selectedDate, { weekStartsOn: 1 }),
    end: endOfWeek(selectedDate, { weekStartsOn: 1 }),
  });

  const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8h–20h

  const dayMap = useMemo(() => {
    const m = {};
    weekDays.forEach(d => {
      const key = format(d, 'yyyy-MM-dd');
      m[key] = compromissos.filter(c => {
        try { return isSameDay(parseISO(c.inicio), d); } catch { return false; }
      });
    });
    return m;
  }, [compromissos, weekDays]);

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      {/* header dias */}
      <div className="grid text-center border-b" style={{ gridTemplateColumns: '40px repeat(7, 1fr)' }}>
        <div />
        {weekDays.map(d => {
          const isSel = isSameDay(d, selectedDate);
          const isTod = isToday(d);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelectDate(d)}
              className={`py-2 px-1 transition-all ${isSel ? 'bg-blue-600' : isTod ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
            >
              <div className={`text-xs font-medium ${isSel ? 'text-blue-100' : 'text-slate-500'}`}>
                {format(d, 'EEE', { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())}
              </div>
              <div className={`text-sm font-bold ${isSel ? 'text-white' : isTod ? 'text-blue-600' : 'text-slate-700'}`}>
                {format(d, 'd')}
              </div>
            </button>
          );
        })}
      </div>

      {/* linhas de hora */}
      <div className="overflow-y-auto max-h-[400px]">
        {hours.map(h => (
          <div key={h} className="grid border-b border-slate-50" style={{ gridTemplateColumns: '40px repeat(7, 1fr)', minHeight: '48px' }}>
            <div className="text-xs text-slate-400 text-right pr-2 pt-1">{String(h).padStart(2,'0')}h</div>
            {weekDays.map(d => {
              const key = format(d, 'yyyy-MM-dd');
              const evts = (dayMap[key] || []).filter(c => {
                try { return parseISO(c.inicio).getHours() === h; } catch { return false; }
              });
              return (
                <div key={d.toISOString()} className="relative border-l border-slate-50 px-0.5 pt-0.5">
                  {evts.map(evt => (
                    <div
                      key={evt.id}
                      className={`rounded text-xs px-1 py-0.5 mb-0.5 truncate cursor-pointer border-l-2 ${STATUS_CONFIG[evt.status]?.left || 'border-l-blue-500'} bg-blue-50 text-blue-800`}
                      title={evt.titulo}
                    >
                      {formatHour(evt.inicio)} {evt.titulo}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Card de compromisso na lista ─────────────────────────────────────────────
function CompromissoCard({ item, selected, onClick, onEdit, onConcluir, onCancelar, onDelete }) {
  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.agendado;
  const ini = formatHour(item.inicio);
  const isLate = item.status === 'agendado' && isBefore(parseISO(item.inicio), startOfDay(new Date()));

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
        ${selected ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-100 bg-white hover:border-slate-300 hover:shadow-sm'}
        border-l-4 ${cfg.left}
      `}
      onClick={onClick}
    >
      {/* horário */}
      <div className="text-center min-w-[42px]">
        <span className="text-sm font-bold text-slate-700">{ini}</span>
      </div>

      {/* avatar */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avatarColor(item.titulo)}`}>
        {getInitials(item.titulo)}
      </div>

      {/* info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-800 text-sm truncate">{item.titulo}</span>
          {isLate && <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {item.descricao && (
            <span className="text-xs text-slate-500 truncate max-w-[160px]">{item.descricao}</span>
          )}
          {item.local && (
            <span className="text-xs text-slate-400 flex items-center gap-0.5">
              <MapPin className="w-3 h-3" />{item.local}
            </span>
          )}
        </div>
      </div>

      {/* status badge */}
      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${cfg.color}`}>
        {cfg.label}
      </span>

      {/* ações */}
      <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
        {item.status !== 'concluido' && item.status !== 'cancelado' && (
          <>
            <button onClick={() => onConcluir(item)} className="p-1 hover:bg-green-100 rounded text-green-600" title="Concluir">
              <CheckCircle className="w-4 h-4" />
            </button>
            <button onClick={() => onEdit(item)} className="p-1 hover:bg-blue-100 rounded text-blue-600" title="Editar">
              <Edit2 className="w-4 h-4" />
            </button>
          </>
        )}
        <button onClick={() => onDelete(item.id)} className="p-1 hover:bg-red-100 rounded text-red-400" title="Excluir">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Painel de detalhes ────────────────────────────────────────────────────────
function DetalhesPanel({ item, onEdit, onConcluir, onCancelar, onClose }) {
  if (!item) return (
    <div className="bg-white rounded-xl shadow-sm flex flex-col items-center justify-center py-16 text-slate-400">
      <CalendarDays className="w-12 h-12 mb-3 opacity-30" />
      <p className="text-sm">Selecione um compromisso</p>
    </div>
  );

  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.agendado;
  const isLate = item.status === 'agendado' && isBefore(parseISO(item.inicio), startOfDay(new Date()));

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
      {/* header */}
      <div className="p-4 border-b">
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${avatarColor(item.titulo)}`}>
            {getInitials(item.titulo)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-slate-900 text-base">{item.titulo}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>{cfg.label}</span>
              {isLate && <span className="text-xs text-red-600 font-medium flex items-center gap-1"><AlertCircle className="w-3 h-3" />Atrasado</span>}
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDateBR(item.inicio)}
            </div>
          </div>
        </div>
      </div>

      {/* corpo */}
      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
        {/* tipo */}
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
          <span className="text-slate-600">{item.tipo === 'reuniao' ? 'Reunião' : 'Tarefa'}</span>
        </div>

        {item.local && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
            <span className="text-slate-600">{item.local}</span>
          </div>
        )}

        {item.fim && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span className="text-slate-600">Até {formatHour(item.fim)}</span>
          </div>
        )}

        {item.descricao && (
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-500 mb-1">Observações</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.descricao}</p>
          </div>
        )}

        <div className="bg-slate-50 rounded-lg p-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-slate-400 mb-0.5">Criado em</p>
            <p className="text-slate-700 font-medium">{item.created_date ? format(parseISO(item.created_date), 'dd/MM/yyyy HH:mm') : '—'}</p>
          </div>
          <div>
            <p className="text-slate-400 mb-0.5">Status</p>
            <p className="text-slate-700 font-medium">{cfg.label}</p>
          </div>
          {item.cancelado_em && (
            <div className="col-span-2">
              <p className="text-slate-400 mb-0.5">Cancelado em</p>
              <p className="text-slate-700 font-medium">{format(parseISO(item.cancelado_em), 'dd/MM/yyyy HH:mm')}</p>
            </div>
          )}
        </div>
      </div>

      {/* ações */}
      {item.status !== 'concluido' && item.status !== 'cancelado' && (
        <div className="p-4 border-t flex gap-2">
          <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 gap-1" onClick={() => onConcluir(item)}>
            <CheckCircle className="w-3.5 h-3.5" /> Concluir
          </Button>
          <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => onEdit(item)}>
            <RefreshCw className="w-3.5 h-3.5" /> Reagendar
          </Button>
          <Button size="sm" variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50 gap-1" onClick={() => onCancelar(item)}>
            <XCircle className="w-3.5 h-3.5" /> Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Resumo do dia ─────────────────────────────────────────────────────────────
function ResumoDia({ compromissos }) {
  const hoje = new Date();
  const todayItems = compromissos.filter(c => {
    try { return isSameDay(parseISO(c.inicio), hoje); } catch { return false; }
  });

  const counts = todayItems.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});

  const atrasados = compromissos.filter(c => {
    try {
      return c.status === 'agendado' && isBefore(parseISO(c.inicio), startOfDay(hoje));
    } catch { return false; }
  });

  const proximos = compromissos
    .filter(c => {
      try {
        return ['agendado', 'confirmado'].includes(c.status) && !isBefore(parseISO(c.inicio), hoje);
      } catch { return false; }
    })
    .sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
    .slice(0, 3);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* total hoje */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <p className="text-xs text-slate-500 font-medium mb-2">Resumo de hoje</p>
        <div className="flex items-center gap-3">
          <div className="relative w-14 h-14 flex-shrink-0">
            <svg viewBox="0 0 40 40" className="w-14 h-14 -rotate-90">
              <circle cx="20" cy="20" r="16" fill="none" stroke="#e2e8f0" strokeWidth="5" />
              <circle cx="20" cy="20" r="16" fill="none" stroke="#3b82f6" strokeWidth="5"
                strokeDasharray={`${(counts.agendado || 0) / Math.max(todayItems.length, 1) * 100.5} 100.5`} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-slate-800">{todayItems.length}</span>
            </div>
          </div>
          <div className="space-y-0.5 text-xs">
            {Object.entries(STATUS_CONFIG).map(([k, v]) => counts[k] > 0 && (
              <div key={k} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                <span className="text-slate-600">{counts[k]} {v.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* próximos */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <p className="text-xs text-slate-500 font-medium mb-2">Próximos compromissos</p>
        {proximos.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhum compromisso</p>
        ) : (
          <div className="space-y-1.5">
            {proximos.map(c => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-600 min-w-[35px]">{formatHour(c.inicio)}</span>
                <span className="text-xs text-slate-700 truncate">{c.titulo}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* atrasados */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <p className="text-xs text-slate-500 font-medium mb-2">Compromissos atrasados</p>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold text-red-600">{atrasados.length}</span>
          <div className="space-y-0.5">
            {atrasados.slice(0, 2).map(c => (
              <div key={c.id} className="flex items-center gap-1">
                <span className="text-xs text-slate-600 truncate max-w-[100px]">{c.titulo}</span>
                <span className="text-xs px-1 py-0.5 rounded bg-red-100 text-red-600 font-medium flex-shrink-0">Atrasado</span>
              </div>
            ))}
            {atrasados.length === 0 && <p className="text-xs text-green-600">Tudo em dia! ✓</p>}
          </div>
        </div>
      </div>

      {/* taxa conclusão */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <p className="text-xs text-slate-500 font-medium mb-2">Taxa de conclusão</p>
        {(() => {
          const total = compromissos.filter(c => c.status !== 'cancelado').length;
          const concluidos = compromissos.filter(c => c.status === 'concluido').length;
          const pct = total > 0 ? Math.round((concluidos / total) * 100) : 0;
          const circ = 100.5;
          return (
            <div className="flex items-center gap-3">
              <div className="relative w-14 h-14 flex-shrink-0">
                <svg viewBox="0 0 40 40" className="w-14 h-14 -rotate-90">
                  <circle cx="20" cy="20" r="16" fill="none" stroke="#e2e8f0" strokeWidth="5" />
                  <circle cx="20" cy="20" r="16" fill="none" stroke="#22c55e" strokeWidth="5"
                    strokeDasharray={`${pct / 100 * circ} ${circ}`} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-slate-800">{pct}%</span>
                </div>
              </div>
              <div className="text-xs text-slate-500">
                <p><b className="text-slate-700">{concluidos}</b> concluídos</p>
                <p><b className="text-slate-700">{total}</b> total</p>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function AgendaPage() {
  const [user, setUser] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('semana'); // semana | calendario

  const [formData, setFormData] = useState({
    titulo: '', tipo: 'reuniao', inicio: '', fim: '', status: 'agendado', descricao: '', local: '',
  });

  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (!me) return;
      if (me.role === 'super_admin') {
        setUser({ ...me, auth_id: me.id, empresa_id: null, perfil: 'super_admin' });
        return;
      }
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' }, '-created_date');
      const colab = colabs?.[0];
      setUser({ ...me, auth_id: me.id, empresa_id: colab?.empresa_id || null, perfil: colab?.perfil || 'vendedor' });
    } catch (e) { console.error(e); }
  };

  const { data: compromissos = [], isLoading } = useQuery({
    queryKey: ['agenda', user?.empresa_id, user?.auth_id],
    queryFn: async () => {
      if (!user) return [];
      if (user.empresa_id) return base44.entities.Agenda.filter({ empresa_id: user.empresa_id }, 'inicio');
      if (user.auth_id) return base44.entities.Agenda.filter({ usuario_id: user.auth_id }, 'inicio');
      return [];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Agenda.create({ ...data, empresa_id: user?.empresa_id, usuario_id: user?.auth_id }),
    onSuccess: () => { queryClient.invalidateQueries(['agenda']); toast.success('Compromisso criado!'); handleCloseModal(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Agenda.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries(['agenda']); toast.success('Atualizado!'); handleCloseModal(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Agenda.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['agenda']); toast.success('Excluído!'); setSelectedItem(null); },
  });

  const handleOpenModal = (item = null) => {
    setEditingItem(item);
    setFormData(item ? {
      titulo: item.titulo || '', tipo: item.tipo || 'reuniao',
      inicio: item.inicio ? format(parseISO(item.inicio), "yyyy-MM-dd'T'HH:mm") : '',
      fim: item.fim ? format(parseISO(item.fim), "yyyy-MM-dd'T'HH:mm") : '',
      status: item.status || 'agendado', descricao: item.descricao || '', local: item.local || '',
    } : { titulo: '', tipo: 'reuniao', inicio: format(selectedDate, "yyyy-MM-dd'T'HH:mm"), fim: '', status: 'agendado', descricao: '', local: '' });
    setModalOpen(true);
  };

  const handleCloseModal = () => { setModalOpen(false); setEditingItem(null); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.titulo || !formData.inicio) { toast.error('Preencha título e data/hora!'); return; }
    const payload = { ...formData, inicio: new Date(formData.inicio).toISOString(), fim: formData.fim ? new Date(formData.fim).toISOString() : null };
    if (editingItem) updateMutation.mutate({ id: editingItem.id, data: payload });
    else createMutation.mutate(payload);
  };

  const handleConcluir = (item) => { updateMutation.mutate({ id: item.id, data: { status: 'concluido' } }); setSelectedItem(p => p?.id === item.id ? { ...p, status: 'concluido' } : p); };
  const handleCancelar = (item) => {
    updateMutation.mutate({ id: item.id, data: { status: 'cancelado', cancelado_em: new Date().toISOString() } });
    setSelectedItem(p => p?.id === item.id ? { ...p, status: 'cancelado' } : p);
  };
  const handleDelete = (id) => { if (window.confirm('Excluir compromisso?')) deleteMutation.mutate(id); };

  // Agrupar por dia
  const filteredBySearch = useMemo(() => compromissos.filter(c =>
    !searchTerm || c.titulo?.toLowerCase().includes(searchTerm.toLowerCase())
  ), [compromissos, searchTerm]);

  // Dias da semana atual
  const weekDays = eachDayOfInterval({
    start: startOfWeek(selectedDate, { weekStartsOn: 1 }),
    end: endOfWeek(selectedDate, { weekStartsOn: 1 }),
  });

  // Compromissos do dia selecionado
  const dayItems = useMemo(() => filteredBySearch
    .filter(c => { try { return isSameDay(parseISO(c.inicio), selectedDate); } catch { return false; } })
    .sort((a, b) => new Date(a.inicio) - new Date(b.inicio)),
    [filteredBySearch, selectedDate]
  );

  if (!user) return <div className="flex items-center justify-center h-64"><div className="text-slate-500">Carregando...</div></div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-blue-600" />
            Agenda
          </h1>
          <p className="text-slate-500 text-sm">Gerencie seus compromissos e atividades</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="bg-blue-600 hover:bg-blue-700 gap-2">
          <Plus className="w-4 h-4" />
          Novo compromisso
        </Button>
      </div>

      {/* Barra de navegação de semana + busca */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white rounded-xl shadow-sm px-3 py-2">
          <button onClick={() => setSelectedDate(d => subDays(d, 7))} className="p-1 hover:bg-slate-100 rounded">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-slate-700 min-w-[140px] text-center">
            {format(weekDays[0], 'd MMM', { locale: ptBR })} a {format(weekDays[6], 'd MMM yyyy', { locale: ptBR })}
          </span>
          <button onClick={() => setSelectedDate(d => addDays(d, 7))} className="p-1 hover:bg-slate-100 rounded">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Pills dos dias da semana */}
        <div className="flex gap-1 bg-white rounded-xl shadow-sm p-1.5">
          {weekDays.map(d => {
            const isSel = isSameDay(d, selectedDate);
            const isTod = isToday(d);
            return (
              <button
                key={d.toISOString()}
                onClick={() => setSelectedDate(d)}
                className={`flex flex-col items-center px-3 py-1.5 rounded-lg text-xs transition-all
                  ${isSel ? 'bg-blue-600 text-white' : isTod ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-100 text-slate-600'}`}
              >
                <span className="font-medium">{format(d, 'EEE', { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())}</span>
                <span className="font-bold text-sm">{format(d, 'd')}</span>
              </button>
            );
          })}
        </div>

        {/* Busca */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Buscar compromisso..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 bg-white shadow-sm" />
        </div>
      </div>

      {/* Layout principal: lista | detalhes | calendário */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* ── Lista do dia ── */}
        <div className="lg:col-span-5 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-sm">
              {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())}
              <span className="ml-2 bg-slate-200 text-slate-600 text-xs font-bold px-1.5 py-0.5 rounded-full">{dayItems.length}</span>
            </h2>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-slate-400">Carregando...</div>
          ) : dayItems.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm flex flex-col items-center justify-center py-16 text-slate-400">
              <Calendar className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Nenhum compromisso neste dia</p>
              <button onClick={() => handleOpenModal()} className="mt-3 text-xs text-blue-600 hover:underline">+ Adicionar compromisso</button>
            </div>
          ) : (
            <div className="space-y-2">
              {dayItems.map(item => (
                <CompromissoCard
                  key={item.id}
                  item={item}
                  selected={selectedItem?.id === item.id}
                  onClick={() => setSelectedItem(item)}
                  onEdit={handleOpenModal}
                  onConcluir={handleConcluir}
                  onCancelar={handleCancelar}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Detalhes ── */}
        <div className="lg:col-span-4">
          <DetalhesPanel
            item={selectedItem}
            onEdit={handleOpenModal}
            onConcluir={handleConcluir}
            onCancelar={handleCancelar}
            onClose={() => setSelectedItem(null)}
          />
        </div>

        {/* ── Mini-calendário + Timeline ── */}
        <div className="lg:col-span-3 space-y-4">
          <MiniCalendar selectedDate={selectedDate} onSelectDate={setSelectedDate} compromissos={compromissos} />
        </div>
      </div>

      {/* Timeline semanal */}
      <div>
        <h3 className="font-semibold text-slate-700 text-sm mb-2">Visão da semana</h3>
        <WeekTimeline selectedDate={selectedDate} compromissos={filteredBySearch} onSelectDate={setSelectedDate} />
      </div>

      {/* Resumo */}
      <ResumoDia compromissos={compromissos} />

      {/* Modal criar/editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Editar Compromisso' : 'Novo Compromisso'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input value={formData.titulo} onChange={e => setFormData({ ...formData, titulo: e.target.value })} placeholder="Ex: Reunião com cliente" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <Select value={formData.tipo} onValueChange={v => setFormData({ ...formData, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reuniao">Reunião</SelectItem>
                    <SelectItem value="tarefa">Tarefa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agendado">Agendado</SelectItem>
                    <SelectItem value="confirmado">Confirmado</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                    <SelectItem value="remarcado">Remarcado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Início *</Label>
                <Input type="datetime-local" value={formData.inicio} onChange={e => setFormData({ ...formData, inicio: e.target.value })} required />
              </div>
              <div>
                <Label>Término</Label>
                <Input type="datetime-local" value={formData.fim} onChange={e => setFormData({ ...formData, fim: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Local</Label>
              <Input value={formData.local} onChange={e => setFormData({ ...formData, local: e.target.value })} placeholder="Ex: Escritório, Online" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={formData.descricao} onChange={e => setFormData({ ...formData, descricao: e.target.value })} rows={3} placeholder="Detalhes do compromisso..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseModal}>Cancelar</Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">{editingItem ? 'Atualizar' : 'Criar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}