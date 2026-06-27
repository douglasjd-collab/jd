import React, { useState } from 'react';
import { X, UserPlus, UserMinus, Search, Clock, FileText } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function getInitials(name = '') {
  const parts = (name || '').trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

// Bottom Sheet genérico para mobile
export function BottomSheet({ open, onClose, title, children, showCloseButton = true }) {
  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/50 z-50 md:hidden"
        onClick={onClose}
      />
      
      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 bg-white dark:bg-slate-900 rounded-t-2xl z-50 md:hidden max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Handle */}
        <div className="flex items-center justify-center py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          {showCloseButton && (
            <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          )}
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </>
  );
}

// Bottom Sheet de Participantes
export function ParticipantesBottomSheet({ open, onClose, colaboradores = [], responsaveisIds = [], onToggleResponsavel, onSave }) {
  const [filtro, setFiltro] = React.useState('');
  
  const colabsFiltrados = colaboradores.filter(c =>
    c.nome?.toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <BottomSheet open={open} onClose={onClose} title="Participantes">
      {/* Busca */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar colaborador..."
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          className="w-full pl-10 pr-3 py-2.5 text-base border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-400 dark:bg-slate-800 dark:text-slate-100"
          autoFocus
        />
      </div>

      {/* Lista de responsáveis atuais */}
      {responsaveisIds.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Responsáveis ({responsaveisIds.length})</p>
          <div className="space-y-2">
            {colaboradores
              .filter(c => responsaveisIds.includes(c.id))
              .map(c => (
                <div key={c.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      {c.foto_perfil && <AvatarImage src={c.foto_perfil} />}
                      <AvatarFallback className="bg-blue-500 text-white text-sm font-bold">
                        {getInitials(c.nome)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{c.nome}</p>
                      {c.email && <p className="text-xs text-slate-400">{c.email}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => onToggleResponsavel(c.id)}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Lista de colaboradores disponíveis */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
          {responsaveisIds.length > 0 ? 'Adicionar participante' : 'Todos os colaboradores'}
        </p>
        <div className="space-y-1">
          {colabsFiltrados
            .filter(c => !responsaveisIds.includes(c.id))
            .map(c => (
              <button
                key={c.id}
                onClick={() => onToggleResponsavel(c.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors"
              >
                <Avatar className="h-9 w-9">
                  {c.foto_perfil && <AvatarImage src={c.foto_perfil} />}
                  <AvatarFallback className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold">
                    {getInitials(c.nome)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{c.nome}</p>
                  {c.email && <p className="text-xs text-slate-400 truncate">{c.email}</p>}
                </div>
                <UserPlus className="w-5 h-5 text-blue-500 flex-shrink-0" />
              </button>
            ))}
          {colabsFiltrados.filter(c => !responsaveisIds.includes(c.id)).length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">Nenhum colaborador encontrado</p>
          )}
        </div>
      </div>

      {/* Botão Salvar */}
      <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
        <Button onClick={onClose} className="w-full h-11 text-base font-semibold">
          Concluir
        </Button>
      </div>
    </BottomSheet>
  );
}

// Bottom Sheet de Atividade Recente
export function AtividadeRecenteBottomSheet({ open, onClose, historico = [] }) {
  const formatarDataRelativa = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const hoje = new Date();
    const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
    
    if (date.toDateString() === hoje.toDateString()) return 'Hoje';
    if (date.toDateString() === ontem.toDateString()) return 'Ontem';
    return format(date, "dd 'de' MMMM", { locale: ptBR });
  };

  const formatarHora = (dateStr) => {
    if (!dateStr) return '';
    return format(new Date(dateStr), 'HH:mm');
  };

  // Agrupar por data
  const agrupado = {};
  historico.forEach(h => {
    const dataKey = h.created_date?.split('T')[0] || 'sem-data';
    if (!agrupado[dataKey]) agrupado[dataKey] = [];
    agrupado[dataKey].push(h);
  });

  return (
    <BottomSheet open={open} onClose={onClose} title="Atividade Recente">
      {historico.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <Clock className="w-12 h-12 opacity-20 mb-3" />
          <p className="text-sm font-medium">Nenhuma atividade registrada</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(agrupado).sort((a, b) => b[0].localeCompare(a[0])).map(([data, items]) => (
            <div key={data}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 sticky top-0 bg-white dark:bg-slate-900 py-2">
                {formatarDataRelativa(items[0]?.created_date)}
              </p>
              <div className="space-y-3">
                {items.map((h, idx) => (
                  <div key={h.id || idx} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Clock className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 dark:text-slate-200">{h.descricao}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-400">{h.usuario_nome}</span>
                        <span className="text-xs text-slate-300">•</span>
                        <span className="text-xs text-slate-400">{formatarHora(h.created_date)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

// Menu Dropdown para mobile (⋮)
export function MenuMobileDropdown({ open, onClose, onOptionSelect }) {
  if (!open) return null;

  const options = [
    { id: 'participantes', label: 'Participantes', icon: UserPlus },
    { id: 'atividade', label: 'Atividade recente', icon: Clock },
    { id: 'anexos', label: 'Adicionar anexo', icon: FileText },
    { id: 'historico', label: 'Histórico completo', icon: Clock },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 md:hidden" onClick={onClose} />
      <div className="fixed top-16 right-4 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 md:hidden min-w-[200px] animate-in fade-in zoom-in duration-200">
        <div className="py-2">
          {options.map(opt => (
            <button
              key={opt.id}
              onClick={() => { onOptionSelect(opt.id); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
            >
              <opt.icon className="w-4 h-4 text-slate-400" />
              <span className="font-medium">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}