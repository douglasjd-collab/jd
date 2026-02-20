import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Users, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GestaoSubcontas from './GestaoSubcontas';
import Usuarios from './Usuarios';
import MigrarUsuariosModal from '@/components/subcontas/MigrarUsuariosModal';

export default function Empresas() {
  const [migrarOpen, setMigrarOpen] = useState(false);
  const [perfil, setPerfil] = useState(null);
  const queryClient = useQueryClient();

  const JD_EMPRESA_ID = '6956c66acff52e4405313375';

  useEffect(() => {
    const loadPerfil = async () => {
      try {
        const me = await base44.auth.me();
        if (!me) return;
        if (me.role === 'super_admin') { setPerfil('super_admin'); return; }
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' }, '-created_date', 1);
        setPerfil(colabs?.[0]?.perfil || 'vendedor');
      } catch (e) { console.error(e); }
    };
    loadPerfil();
  }, []);

  const isSuperAdmin = perfil === 'super_admin' || perfil === 'master';

  // Buscar colaboradores da JD Promotora (empresa principal) - apenas super_admin
  const { data: colaboradoresSemEmpresa = [] } = useQuery({
    queryKey: ['colaboradores-jd'],
    enabled: isSuperAdmin,
    queryFn: async () => {
      return await base44.entities.Colaborador.filter(
        { empresa_id: JD_EMPRESA_ID },
        '-created_date',
        200
      );
    },
  });

  if (perfil === null) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // Admin: só vê a aba de Usuários (da sua empresa)
  if (perfil === 'admin') {
    return (
      <div className="space-y-4">
        <Usuarios />
      </div>
    );
  }

  // Super admin / master: vê Empresas + Usuários
  return (
    <div className="space-y-4">
      <Tabs defaultValue="empresas">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="empresas" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Empresas
            </TabsTrigger>
            <TabsTrigger value="usuarios" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Usuários
            </TabsTrigger>
          </TabsList>

          <Button
            onClick={() => setMigrarOpen(true)}
            className="bg-[#23BE84] hover:bg-[#1da570] gap-2"
            size="sm"
          >
            <ArrowRight className="w-4 h-4" />
            Migrar Usuários JD → Subconta
            {colaboradoresSemEmpresa.length > 0 && (
              <span className="bg-white text-[#23BE84] rounded-full px-2 text-xs font-bold">
                {colaboradoresSemEmpresa.length}
              </span>
            )}
          </Button>
        </div>

        <TabsContent value="empresas" className="mt-6">
          <GestaoSubcontas />
        </TabsContent>

        <TabsContent value="usuarios" className="mt-6">
          <Usuarios />
        </TabsContent>
      </Tabs>

      <MigrarUsuariosModal
        open={migrarOpen}
        onOpenChange={setMigrarOpen}
        usuariosDaJD={colaboradoresSemEmpresa}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['colaboradores-jd'] });
          queryClient.invalidateQueries({ queryKey: ['usuarios'] });
        }}
      />
    </div>
  );
}