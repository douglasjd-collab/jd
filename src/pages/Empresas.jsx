import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GestaoSubcontas from './GestaoSubcontas';
import Usuarios from './Usuarios';
import MigrarUsuariosModal from '@/components/subcontas/MigrarUsuariosModal';

export default function Empresas() {
  const [migrarOpen, setMigrarOpen] = useState(false);
  const queryClient = useQueryClient();

  // Buscar colaboradores sem empresa_id (JD Promotora / sem subconta)
  const { data: colaboradoresSemEmpresa = [] } = useQuery({
    queryKey: ['colaboradores-sem-empresa'],
    queryFn: async () => {
      const todos = await base44.asServiceRole.entities.Colaborador.list('-created_date', 500);
      // Pega os que não têm empresa_id ou têm empresa_id null
      return todos.filter(c => !c.empresa_id);
    },
  });

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
          queryClient.invalidateQueries({ queryKey: ['colaboradores-sem-empresa'] });
          queryClient.invalidateQueries({ queryKey: ['usuarios'] });
        }}
      />
    </div>
  );
}