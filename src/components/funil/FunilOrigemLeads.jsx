import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { MessageSquare, Users, Globe, Share2, Mail, Phone, Video, Building, TrendingUp } from 'lucide-react';

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
};

const ORIGEM_ICONS = {
  'WhatsApp': MessageSquare,
  'Instagram': Users,
  'Facebook': Globe,
  'Google': Globe,
  'Site': Globe,
  'Indicação': Share2,
  'E-mail': Mail,
  'Telefone': Phone,
  'Vídeo': Video,
  'Visita': Building,
  'Atendimento Presencial': Building,
  'Campanhas': TrendingUp,
  'Parceiros': Users,
  'Tráfego Pago': TrendingUp
};

export default function FunilOrigemLeads({ oportunidades }) {
  const origemData = useMemo(() => {
    const origens = {};
    
    oportunidades.forEach(o => {
      const origem = o.origem || 'Não informado';
      if (!origens[origem]) {
        origens[origem] = {
          nome: origem,
          quantidade: 0,
          ganhos: 0,
          perdidos: 0,
          abertos: 0,
          valorGanhos: 0,
          valorTotal: 0
        };
      }
      
      origens[origem].quantidade += 1;
      origens[origem].valorTotal += (o.valor_estimado || 0);
      
      if (o.status === 'ganha') {
        origens[origem].ganhos += 1;
        origens[origem].valorGanhos += (o.valor_estimado || 0);
      } else if (o.status === 'perdida') {
        origens[origem].perdidos += 1;
      } else {
        origens[origem].abertos += 1;
      }
    });

    return Object.values(origens)
      .map(o => ({
        ...o,
        taxaConversao: (o.ganhos + o.perdidos) > 0 
          ? ((o.ganhos / (o.ganhos + o.perdidos)) * 100).toFixed(1) 
          : 0
      }))
      .sort((a, b) => b.quantidade - a.quantidade);
  }, [oportunidades]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700">📊 Origem dos Leads</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {origemData.map((origem) => {
          const Icon = ORIGEM_ICONS[origem.nome] || Globe;
          return (
            <Card key={origem.nome} className="p-3 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{origem.nome}</p>
                    <p className="text-xs text-slate-500">{origem.quantidade} leads</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-green-600">{origem.taxaConversao}%</p>
                  <p className="text-[10px] text-slate-400">conversão</p>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Ganhos:</span>
                  <span className="font-semibold text-green-600">{origem.ganhos}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Abertos:</span>
                  <span className="font-semibold text-blue-600">{origem.abertos}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Perdidos:</span>
                  <span className="font-semibold text-red-600">{origem.perdidos}</span>
                </div>
                <div className="pt-1 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Produção:</span>
                    <span className="font-bold text-slate-700">{formatCurrency(origem.valorGanhos)}</span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}