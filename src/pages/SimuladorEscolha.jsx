import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calculator, Sparkles, Settings } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import ConfiguracaoSimuladorModal from '@/components/simulador/ConfiguracaoSimuladorModal';

export default function SimuladorEscolha() {
  const navigate = useNavigate();
  const [configOpen, setConfigOpen] = useState(false);
  const [empresaId, setEmpresaId] = useState(null);

  useEffect(() => {
    base44.auth.me().then(user => {
      if (!user) return;
      base44.entities.Colaborador.filter({ user_id: user.id, status: 'ativo' }, '-created_date', 1)
        .then(cols => { if (cols?.[0]?.empresa_id) setEmpresaId(cols[0].empresa_id); });
    });
  }, []);

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
            onClick={() => navigate(createPageUrl('SimuladorConsorcio'))}
          >
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-[#23BE84] to-[#1da570] rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
              </div>
              <CardTitle className="text-2xl text-slate-900">Simulação com Lance Embutido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-600 text-center">
                Simulação com lance embutido de administradoras
              </p>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="text-[#23BE84] font-bold">✓</span>
                  <span>Lance embutido (Canopus, Itaú, etc)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#23BE84] font-bold">✓</span>
                  <span>Percentual configurável</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#23BE84] font-bold">✓</span>
                  <span>Cálculo automático</span>
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
              <CardTitle className="text-2xl text-slate-900">Simulação com Recursos Próprios</CardTitle>
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

        <div className="flex justify-center mt-6">
          <Button
            variant="outline"
            onClick={() => setConfigOpen(true)}
            className="gap-2 text-slate-600 border-slate-300 hover:bg-slate-100"
          >
            <Settings className="w-4 h-4" />
            Configuração do Simulador
          </Button>
        </div>

        <p className="text-center text-sm text-slate-500 mt-4">
          Escolha o simulador que melhor se adapta às necessidades do seu cliente
        </p>
      </div>

      <ConfiguracaoSimuladorModal open={configOpen} onOpenChange={setConfigOpen} empresaId={empresaId} />
    </div>
  );
}