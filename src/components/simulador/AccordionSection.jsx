import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AccordionSection({
  icon: Icon,
  iconColor,
  title,
  subtitle,
  defaultOpen = false,
  badge,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        {Icon && <Icon className={cn('w-4 h-4 shrink-0', iconColor || 'text-slate-500')} />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
        </div>
        {badge}
        <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform shrink-0', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}