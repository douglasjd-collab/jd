import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Info } from 'lucide-react';

const BANCOS = [
  { nome: 'Bradesco Financiamentos', tipos: ['carro', 'moto', 'caminhao'], taxa_min: 1.29, taxa_max: 2.49, prazo_max: 60 },
  { nome: 'Santander', tipos: ['carro', 'moto'], taxa_min: 1.19, taxa_max: 2.29, prazo_max: 60 },
  { nome: 'Itaú Unibanco', tipos: ['carro', 'caminhao'], taxa_min: 1.09, taxa_max: 2.09, prazo_max: 60 },
  { nome: 'Banco do Brasil', tipos: ['carro', 'moto', 'caminhao'], taxa_min: 0.99, taxa_max: 1.89, prazo_max: 60 },
  { nome: 'Caixa Econômica Federal', tipos: ['carro', 'caminhao'], taxa_min: 0.89, taxa_max: 1.79, prazo_max: 60 },
  { nome: 'BV Financeira', tipos: ['carro', 'moto'], taxa_min: 1.39, taxa_max: 2.59, prazo_max: 48 },
  { nome: 'Creditas', tipos: ['carro'], taxa_min: 0.79, taxa_max: 1.49, prazo_max: 60 },
  { nome: 'DCFI (Daycoval)', tipos: ['carro', 'moto', 'caminhao'], taxa_min: 1.49, taxa_max: 2.79, prazo_max: 48 },
];

const TIPO_LABELS = { carro: 'Carro', moto: 'Moto', caminhao: 'Caminhão' };
const TIPO_COLORS = { carro: 'bg-blue-100 text-blue-700', moto: 'bg-orange-100 text-orange-700', caminhao: 'bg-green-100 text-green-700' };

export default function BancosFinanciamento() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Bancos / Tabelas — Financiamento de Veículos</h2>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 items-start">
        <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-700">
          As taxas abaixo são referências de mercado. As taxas reais variam conforme o perfil do cliente, valor do veículo e política do banco. Consulte sempre a tabela atualizada do banco.
        </p>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {BANCOS.map(b => (
          <Card key={b.nome} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-slate-600" />
                </div>
                <CardTitle className="text-sm font-bold">{b.nome}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Taxa (a.m.)</span>
                <span className="font-semibold text-slate-800">{b.taxa_min}% – {b.taxa_max}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Prazo máx.</span>
                <span className="font-semibold text-slate-800">{b.prazo_max} meses</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {b.tipos.map(t => (
                  <span key={t} className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLORS[t]}`}>
                    {TIPO_LABELS[t]}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}