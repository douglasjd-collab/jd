import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings } from 'lucide-react';

export default function ConfiguracoesFinanciamento() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Configurações — Financiamento de Veículos</h1>
      <Card>
        <CardContent className="py-16 text-center text-slate-400">
          <Settings className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Configurações em desenvolvimento</p>
          <p className="text-sm mt-1">Em breve será possível configurar bancos padrão, tabelas de comissão e templates.</p>
        </CardContent>
      </Card>
    </div>
  );
}