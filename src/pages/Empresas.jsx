import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Users } from 'lucide-react';

// Lazy-load the two existing pages
import GestaoSubcontas from './GestaoSubcontas';
import Usuarios from './Usuarios';

export default function Empresas() {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="empresas">
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

        <TabsContent value="empresas" className="mt-6">
          <GestaoSubcontas />
        </TabsContent>

        <TabsContent value="usuarios" className="mt-6">
          <Usuarios />
        </TabsContent>
      </Tabs>
    </div>
  );
}