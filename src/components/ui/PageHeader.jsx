import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function PageHeader({ 
  title, 
  subtitle, 
  actionLabel, 
  onAction, 
  actionIcon: ActionIcon = Plus,
  backTo,
  children 
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div className="flex items-center gap-4">
        {backTo && (
          <Link to={createPageUrl(backTo)}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
        )}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {children}
        {actionLabel && (
          <Button 
            onClick={onAction}
            className="bg-[#23BE84] hover:bg-[#1da570] gap-2"
          >
            <ActionIcon className="w-4 h-4" />
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}