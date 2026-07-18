import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusConfig = {
  ativo: { label: 'Ativo', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
  ativa: { label: 'Ativa', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
  inativo: { label: 'Inativo', className: 'bg-slate-100 text-slate-700 hover:bg-slate-100' },
  inativa: { label: 'Inativa', className: 'bg-slate-100 text-slate-700 hover:bg-slate-100' },
  cancelada: { label: 'Cancelada', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
  em_atraso: { label: 'Em Atraso', className: 'bg-orange-100 text-orange-700 hover:bg-orange-100' },
  contemplada: { label: 'Contemplada', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  aguardando_aprovacao: { label: 'Aguardando Aprovação', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  prevista: { label: 'Prevista', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
  recebida: { label: 'Recebida', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
  atrasada: { label: 'Atrasada', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
  confirmada: { label: 'Confirmada', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  paga: { label: 'Paga', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
  pendente: { label: 'Pendente', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
  processando: { label: 'Processando', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  concluida: { label: 'Concluída', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
  erro: { label: 'Erro', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
  processado: { label: 'Processado', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
  divergencia: { label: 'Divergência', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
  receber: { label: 'A Receber', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  pagar: { label: 'A Pagar', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
  solicitado: { label: 'Solicitado', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  pago: { label: 'Pago', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
  rejeitado: { label: 'Rejeitado', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
  // Status de transferência de cota
  transferir: { label: 'Transferir cota', className: 'bg-slate-100 text-slate-700 hover:bg-slate-100' },
  transferencia_andamento: { label: 'Transferência em andamento', className: 'bg-orange-100 text-orange-700 hover:bg-orange-100' },
  transferida: { label: 'Transferida', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  transferencia_reprovada: { label: 'Transferência reprovada', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
};

export default function StatusBadge({ status, className }) {
  const config = statusConfig[status] || { label: status, className: 'bg-slate-100 text-slate-700' };
  
  return (
    <Badge variant="secondary" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}