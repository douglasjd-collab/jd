import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { LayoutDashboard, FileText, Building2, BarChart2, Settings, Car, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import DashboardFinanciamento from './financiamento/DashboardFinanciamento';
import PropostasFinanciamento from './financiamento/PropostasFinanciamento';
import BancosFinanciamento from './financiamento/BancosFinanciamento';
import RelatoriosFinanciamento from './financiamento/RelatoriosFinanciamento';
import ConfiguracoesFinanciamento from './financiamento/ConfiguracoesFinanciamento';
import ComissoesFinanciamento from './financiamento/ComissoesFinanciamento';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'propostas', label: 'Propostas', icon: FileText },
  { id: 'financeiro', label: 'Financeiro do Financiamento', icon: DollarSign },
  { id: 'bancos', label: 'Bancos / Tabelas', icon: Building2 },
  { id: 'relatorios', label: 'Relatórios', icon: BarChart2 },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
];

export default function FinanciamentoVeiculos() {
  const [aba, setAba] = useState('dashboard');
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

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setAba(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              aba === t.id
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className={aba === 'dashboard' ? '' : 'hidden'}><DashboardFinanciamento user={user} /></div>
      {user && <div className={aba === 'propostas' ? '' : 'hidden'}><PropostasFinanciamento user={user} /></div>}
      {user && <div className={aba === 'financeiro' ? '' : 'hidden'}><ComissoesFinanciamento user={user} /></div>}
      <div className={aba === 'bancos' ? '' : 'hidden'}><BancosFinanciamento user={user} /></div>
      <div className={aba === 'relatorios' ? '' : 'hidden'}><RelatoriosFinanciamento user={user} /></div>
      <div className={aba === 'configuracoes' ? '' : 'hidden'}><ConfiguracoesFinanciamento user={user} /></div>
    </div>
  );
}