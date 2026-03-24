import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Banknote, ShoppingCart } from 'lucide-react';

export default function DashboardSelector({ selectedDashboard, onSelect, user, menus_permitidos }) {
  const temPermissoesCustomizadas = menus_permitidos?.length > 0;
  
  // Verificar acesso aos dashboards
  const podeAcessarEmprestimos = !temPermissoesCustomizadas || menus_permitidos?.includes('emprestimos') || ['master', 'super_admin', 'admin', 'gerente', 'vendedor'].includes(user?.perfil);
  const podeAcessarConsorcio = !temPermissoesCustomizadas || menus_permitidos?.includes('consorcio') || ['master', 'super_admin', 'admin', 'gerente', 'vendedor'].includes(user?.perfil);

  // Se não tiver acesso a nenhum, não mostrar seletor
  if (!podeAcessarEmprestimos && !podeAcessarConsorcio) {
    return null;
  }

  // Se só tiver acesso a um, não mostrar seletor
  if ((podeAcessarEmprestimos && !podeAcessarConsorcio) || (!podeAcessarEmprestimos && podeAcessarConsorcio)) {
    return null;
  }

  return (
    <div className="flex gap-3 mb-6">
      {podeAcessarEmprestimos && (
        <Button
          onClick={() => onSelect('emprestimo')}
          variant={selectedDashboard === 'emprestimo' ? 'default' : 'outline'}
          className={`gap-2 px-6 py-2 transition-all ${
            selectedDashboard === 'emprestimo'
              ? 'bg-[#23BE84] hover:bg-[#1da570] text-white'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <Banknote className="w-4 h-4" />
          Dashboard Empréstimo
        </Button>
      )}
      
      {podeAcessarConsorcio && (
        <Button
          onClick={() => onSelect('consorcio')}
          variant={selectedDashboard === 'consorcio' ? 'default' : 'outline'}
          className={`gap-2 px-6 py-2 transition-all ${
            selectedDashboard === 'consorcio'
              ? 'bg-[#1e3a5f] hover:bg-[#152a47] text-white'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          Dashboard Consórcio
        </Button>
      )}
    </div>
  );
}