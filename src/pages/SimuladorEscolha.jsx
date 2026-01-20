import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calculator, Sparkles } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function SimuladorEscolha() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-4xl space-y-6">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6950a9860c8af0e2ff10fc9e/1b5f2d0a1_JDPromotoraICON3.png" 
              alt="JD Promotora" 
              className="h-16 w-auto object-contain"
            />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Simulador de Consórcio</h1>
          <p className="text-lg text-slate-600">Escolha o tipo de simulação que deseja realizar</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Simulação Com Embutido */}
          <Card 
            className="border-2 border-[#23BE84] hover:shadow-xl transition-all cursor-pointer group"
            onClick={() => navigate(createPageUrl('SimuladorEmbutido'))}
          >
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-[#23BE84] to-[#1da570] rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
              </div>
              <CardTitle className="text-2xl text-slate-900">Com Embutido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-600 text-center">
                Simulação com lance embutido, parcela reduzida e opções de administradoras
              </p>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="text-[#23BE84] font-bold">✓</span>
                  <span>Lance embutido (Canopus, Itaú, etc)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#23BE84] font-bold">✓</span>
                  <span>Lance fixo (30% ou 50%)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#23BE84] font-bold">✓</span>
                  <span>Parcela reduzida</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#23BE84] font-bold">✓</span>
                  <span>Multi-cotas</span>
                </li>
              </ul>
              <Button className="w-full bg-[#23BE84] hover:bg-[#1da570] mt-4">
                Acessar Simulador
              </Button>
            </CardContent>
          </Card>

          {/* Simulação Normal */}
          <Card 
            className="border-2 border-blue-600 hover:shadow-xl transition-all cursor-pointer group"
            onClick={() => navigate(createPageUrl('SimuladorNormal'))}
          >
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Calculator className="w-8 h-8 text-white" />
                </div>
              </div>
              <CardTitle className="text-2xl text-slate-900">Simulação Normal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-600 text-center">
                Simulação tradicional sem lance embutido, ideal para cálculos básicos
              </p>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>Simulação simplificada</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>Lance próprio opcional</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>Cálculo direto</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>Multi-cotas</span>
                </li>
              </ul>
              <Button className="w-full bg-blue-600 hover:bg-blue-700 mt-4">
                Acessar Simulador
              </Button>
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-sm text-slate-500 mt-8">
          Escolha o simulador que melhor se adapta às necessidades do seu cliente
        </p>
      </div>
    </div>
  );
}