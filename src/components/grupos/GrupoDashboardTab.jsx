import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Users, Calendar, TrendingUp, Trophy } from 'lucide-react';
import { calcularMediaPercentual, formatPercent, formatCurrency, CATEGORIA_LABELS } from '@/components/utils/gruposConsorcioHelpers';

export default function GrupoDashboardTab({ grupo }) {
  const { data: assembleias = [], isLoading } = useQuery({
    queryKey: ['assembleias-grupo', grupo?.id],
    enabled: !!grupo?.id,
    queryFn: () => base44.entities.AssembleiaGrupoConsorcio.filter({ grupo_consorcio_id: grupo.id }, '-data_assembleia')
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  }

  const ultimaAssembleia = assembleias[0] || null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500">Número do Grupo</p>
            <p className="text-xl font-bold text-slate-900">{grupo.numero_grupo}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500">Categoria</p>
            <p className="text-xl font-bold text-slate-900">{CATEGORIA_LABELS[grupo.categoria_bem] || grupo.categoria_bem}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500 flex items-center gap-1"><Users className="w-3 h-3" /> Participantes</p>
            <p className="text-xl font-bold text-slate-900">{grupo.qtd_participantes || '-'}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500">Prazo Máximo</p>
            <p className="text-xl font-bold text-slate-900">{grupo.prazo_maximo ? `${grupo.prazo_maximo} meses` : '-'}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4">
          <p className="text-xs text-slate-500 mb-1">Faixa de Crédito</p>
          <p className="text-lg font-bold text-slate-900">
            {formatCurrency(grupo.credito_minimo)} até {formatCurrency(grupo.credito_maximo)}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <p className="text-sm font-semibold text-blue-700 mb-2 flex items-center gap-1"><TrendingUp className="w-4 h-4" /> Média Lance Livre</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">3 meses</span><span className="font-bold">{formatPercent(calcularMediaPercentual(assembleias, 3, 'lance_livre_menor_percentual'))}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">6 meses</span><span className="font-bold">{formatPercent(calcularMediaPercentual(assembleias, 6, 'lance_livre_menor_percentual'))}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">12 meses</span><span className="font-bold">{formatPercent(calcularMediaPercentual(assembleias, 12, 'lance_livre_menor_percentual'))}</span></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <p className="text-sm font-semibold text-orange-700 mb-2 flex items-center gap-1"><TrendingUp className="w-4 h-4" /> Média Lance Limitado</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">3 meses</span><span className="font-bold">{formatPercent(calcularMediaPercentual(assembleias, 3, 'lance_limitado_menor_percentual'))}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">6 meses</span><span className="font-bold">{formatPercent(calcularMediaPercentual(assembleias, 6, 'lance_limitado_menor_percentual'))}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">12 meses</span><span className="font-bold">{formatPercent(calcularMediaPercentual(assembleias, 12, 'lance_limitado_menor_percentual'))}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4">
          <p className="text-xs text-slate-500 mb-2">Quantidade de Assembleias</p>
          <p className="text-xl font-bold text-slate-900">{assembleias.length}</p>
        </CardContent>
      </Card>

      {ultimaAssembleia && (
        <Card className="border-0 shadow-sm border-l-4 border-l-amber-400">
          <CardContent className="pt-4">
            <p className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-1"><Calendar className="w-4 h-4" /> Última Assembleia</p>
            <p className="text-sm text-slate-700">{new Date(ultimaAssembleia.data_assembleia + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
            <p className="text-lg font-bold text-amber-900 flex items-center gap-1 mt-1"><Trophy className="w-4 h-4" /> {ultimaAssembleia.total_contemplados || 0} contemplados</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}