import React from 'react';
import { MessageCircle, Clock, Headphones, CheckCircle, Users, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MobileBottomNav({ filtroStatus, setFiltroStatus, contadores }) {
  const tabs = [
    { id: 'todas', label: 'Todos', icon: MessageCircle, count: contadores.todas, color: 'slate' },
    { id: 'espera', label: 'Espera', icon: Clock, count: contadores.espera, color: 'red' },
    { id: 'ativa', label: 'Atend.', icon: Headphones, count: contadores.ativa, color: 'emerald' },
    { id: 'encerrada', label: 'Final.', icon: CheckCircle, count: contadores.encerrada, color: 'slate' },
  ];

  const getColorClasses = (color, isActive) => {
    const colors = {
      slate: isActive ? 'bg-slate-600 text-white' : 'text-slate-600',
      red: isActive ? 'bg-red-500 text-white' : 'text-red-500',
      emerald: isActive ? 'bg-emerald-600 text-white' : 'text-emerald-600',
      purple: isActive ? 'bg-purple-600 text-white' : 'text-purple-500',
    };
    return colors[color] || colors.slate;
  };

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 safe-area-bottom z-40">
      <div className="flex items-center justify-around py-2 pb-safe">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = filtroStatus === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setFiltroStatus(tab.id)}
              className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all active:scale-95"
            >
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                isActive ? getColorClasses(tab.color, true) : "bg-slate-100"
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex flex-col items-center">
                <span className={cn(
                  "text-[10px] font-medium leading-tight",
                  isActive ? "text-slate-700" : "text-slate-500"
                )}>
                  {tab.label}
                </span>
                {tab.count > 0 && (
                  <span className={cn(
                    "text-[10px] font-bold",
                    isActive ? "text-slate-900" : "text-slate-400"
                  )}>
                    {tab.count}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}