import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Car } from 'lucide-react';
import DashboardFinanciamento from './financiamento/DashboardFinanciamento';
import PropostasFinanciamento from './financiamento/PropostasFinanciamento';
import BancosFinanciamento from './financiamento/BancosFinanciamento';
import RelatoriosFinanciamento from './financiamento/RelatoriosFinanciamento';
import ConfiguracoesFinanciamento from './financiamento/ConfiguracoesFinanciamento';
import ComissoesFinanciamento from './financiamento/ComissoesFinanciamento';

export default function FinanciamentoVeiculos() {
  const getTabFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'dashboard';
  };
  const [aba, setAba] = useState(getTabFromUrl);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(me => {
      if (!me) return;
      if (['super_admin', 'master'].includes(me.perfil || me.role)) {
        setUser({ ...me, empresa_id: null, perfil: 'super_admin' });
        return;
      }
      base44.entities.Colaborador.filter({ user_id: me.id }, '-created_date', 1).then(colabs => {
        const colab = colabs?.[0];
        setUser({ ...me, empresa_id: colab?.empresa_id || null, perfil: colab?.perfil || 'vendedor', colaborador_id: colab?.id });
      });
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
          <Car className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Financiamento de Veículos</h1>
          <p className="text-sm text-slate-500">Gestão completa de propostas e financiamentos</p>
        </div>
      </div>

      {/* Conteúdo */}
      {aba === 'dashboard' && <DashboardFinanciamento user={user} />}
      {aba === 'propostas' && user && <PropostasFinanciamento user={user} />}
      {aba === 'financeiro' && user && <ComissoesFinanciamento user={user} />}
      {aba === 'bancos' && <BancosFinanciamento user={user} />}
      {aba === 'relatorios' && <RelatoriosFinanciamento user={user} />}
      {aba === 'configuracoes' && <ConfiguracoesFinanciamento user={user} />}
    </div>
  );
}