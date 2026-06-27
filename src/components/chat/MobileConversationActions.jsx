import React from 'react';
import { 
  User, Tag, Calendar, ClipboardList, Phone, 
  MessageSquare, MoreVertical, CheckCircle, 
  Archive, Trash2, Lock, Unlock, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function MobileConversationActions({ 
  open, 
  onOpenChange, 
  conversa, 
  contatosWhatsapp,
  actions 
}) {
  if (!conversa) return null;

  const cache = contatosWhatsapp[conversa.id] || {};
  const nome = cache.nome || conversa.cliente_nome || conversa.cliente_telefone;
  const ultimaMsg = conversa.ultima_mensagem || '';
  const dataUltima = conversa.data_ultima_mensagem
    ? format(new Date(conversa.data_ultima_mensagem), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })
    : '';

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      
      {/* Bottom Sheet */}
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl max-h-[85vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Handle */}
        <div className="w-full h-8 flex items-center justify-center shrink-0">
          <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-6 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
              {nome?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-slate-800 truncate text-base">{nome}</h2>
              <p className="text-xs text-slate-500 truncate">{conversa.cliente_telefone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Calendar className="w-3 h-3" />
            <span>Última msg: {dataUltima}</span>
          </div>
          {ultimaMsg && (
            <p className="text-xs text-slate-400 mt-2 line-clamp-2 italic">"{ultimaMsg}"</p>
          )}
        </div>

        {/* Actions Grid */}
        <div className="flex-1 overflow-y-auto p-4 pb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 px-1">Ações</h3>
          <div className="grid grid-cols-3 gap-3">
            {actions.filter(a => a.show !== false).map(action => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => {
                    action.action?.(conversa);
                    onOpenChange(false);
                  }}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all active:scale-95 ${
                    action.danger 
                      ? 'border-red-200 bg-red-50 hover:bg-red-100' 
                      : action.color === 'emerald'
                      ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                      : action.color === 'blue'
                      ? 'border-blue-200 bg-blue-50 hover:bg-blue-100'
                      : action.color === 'purple'
                      ? 'border-purple-200 bg-purple-50 hover:bg-purple-100'
                      : 'border-slate-100 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    action.danger 
                      ? 'bg-red-500' 
                      : action.color === 'emerald'
                      ? 'bg-emerald-500'
                      : action.color === 'blue'
                      ? 'bg-blue-500'
                      : action.color === 'purple'
                      ? 'bg-purple-500'
                      : 'bg-slate-600'
                  }`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <span className={`text-[11px] font-medium text-center leading-tight ${
                    action.danger ? 'text-red-600' : 'text-slate-700'
                  }`}>
                    {action.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Close Button */}
        <div className="p-4 border-t border-slate-100 bg-white pb-6 safe-area-bottom">
          <Button 
            variant="outline" 
            className="w-full rounded-full h-11"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}