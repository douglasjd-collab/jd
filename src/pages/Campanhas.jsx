import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Megaphone,
  LayoutDashboard,
  List,
  FileText,
  Users,
  Filter,
  CalendarClock,
  BarChart3,
  Settings as SettingsIcon,
  Plus,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import CampanhasDashboard from '@/components/campanhas/CampanhasDashboard';
import CampanhasLista from '@/components/campanhas/CampanhasLista';
import CampanhasTemplates from '@/components/campanhas/CampanhasTemplates';
import NovaCampanhaModal from '@/components/campanhas/NovaCampanhaModal';

export default function Campanhas() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [novaCampanhaOpen, setNovaCampanhaOpen] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        setEmpresaId('699696c2c9f5bffc2e67402b');
      } else {
        const colabs = await base44.entities.Colaborador.filter(
          { user_id: me.id },
          '-created_date'
        );
        const ativo = colabs.find((c) => c.status === 'ativo') || colabs[0];
        if (ativo) setEmpresaId(ativo.empresa_id);
      }
      setUser(me);
    } catch (e) {
      toast.error('Erro ao carregar usuário');
    }
  };

  if (!user || !empresaId) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        Carregando módulo de Campanhas…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border border-slate-200 p-1 rounded-xl flex-wrap h-auto">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <LayoutDashboard className="w-4 h-4" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="campanhas" className="gap-1.5">
            <List className="w-4 h-4" /> Campanhas
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5">
            <FileText className="w-4 h-4" /> Templates
          </TabsTrigger>
          <TabsTrigger value="listas" className="gap-1.5">
            <Users className="w-4 h-4" /> Listas
          </TabsTrigger>
          <TabsTrigger value="segmentacoes" className="gap-1.5">
            <Filter className="w-4 h-4" /> Segmentações
          </TabsTrigger>
          <TabsTrigger value="agendamentos" className="gap-1.5">
            <CalendarClock className="w-4 h-4" /> Agendamentos
          </TabsTrigger>
          <TabsTrigger value="relatorios" className="gap-1.5">
            <BarChart3 className="w-4 h-4" /> Relatórios
          </TabsTrigger>
          <TabsTrigger value="configuracoes" className="gap-1.5">
            <SettingsIcon className="w-4 h-4" /> Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <CampanhasDashboard empresaId={empresaId} user={user} onNova={() => setNovaCampanhaOpen(true)} />
        </TabsContent>

        <TabsContent value="campanhas" className="mt-4">
          <CampanhasLista empresaId={empresaId} user={user} onNova={() => setNovaCampanhaOpen(true)} />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <CampanhasTemplates empresaId={empresaId} user={user} />
        </TabsContent>

        {['listas', 'segmentacoes', 'agendamentos', 'relatorios', 'configuracoes'].map(
          (t) => (
            <TabsContent key={t} value={t} className="mt-4">
              <Placeholder name={t} />
            </TabsContent>
          )
        )}
      </Tabs>

      <NovaCampanhaModal
        open={novaCampanhaOpen}
        onOpenChange={setNovaCampanhaOpen}
        empresaId={empresaId}
        user={user}
      />
    </div>
  );
}

function Placeholder({ name }) {
  const labels = {
    templates: 'Templates',
    listas: 'Listas de Contatos',
    segmentacoes: 'Segmentações',
    agendamentos: 'Agendamentos',
    relatorios: 'Relatórios',
    configuracoes: 'Configurações',
  };
  return (
    <div className="border border-dashed border-slate-300 bg-slate-50 rounded-2xl py-16 px-6 text-center">
      <Megaphone className="w-10 h-10 text-slate-400 mx-auto mb-3" />
      <h3 className="text-lg font-semibold text-slate-700">{labels[name] || name}</h3>
      <p className="text-sm text-slate-500 mt-1">
        Esta aba será implementada na próxima iteração do módulo de Campanhas.
      </p>
    </div>
  );
}