import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, ListChecks, Link2, History } from 'lucide-react';
import { format } from 'date-fns';
import VincularTipoModal from './VincularTipoModal';
import RegistrosPendenciaModal from './RegistrosPendenciaModal';

const fmtDataHora = (v) => (v ? format(new Date(v), 'dd/MM/yyyy HH:mm') : '-');

export default function PendentesVinculacaoSection({ empresaId, tipos = [], onAtualizado }) {
  const [vinculando, setVinculando] = useState(null);
  const [verRegistros, setVerRegistros] = useState(null);
  const queryClient = useQueryClient();

  const { data: pendencias = [], isLoading } = useQuery({
    queryKey: ['pendencias-vinculacao', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const lista = await base44.entities.PendenciaVinculacaoTipo.filter(
        { empresa_id: empresaId, status: 'pendente' }, '-ultima_ocorrencia', 200
      );
      return lista || [];
    },
  });

  const { data: historico = [] } = useQuery({
    queryKey: ['pendencias-vinculacao-historico', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const lista = await base44.entities.PendenciaVinculacaoTipo.filter(
        { empresa_id: empresaId, status: 'resolvida' }, '-vinculado_em', 5
      );
      return lista || [];
    },
  });

  const totalRegistros = pendencias.reduce((s, p) => s + (p.quantidade || 0), 0);

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ['pendencias-vinculacao', empresaId] });
    queryClient.invalidateQueries({ queryKey: ['pendencias-vinculacao-historico', empresaId] });
    onAtualizado?.();
  };

  if (!empresaId) return null;

  return (
    <Card className={pendencias.length > 0 ? 'border-orange-200 shadow-sm' : 'shadow-sm'}>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className={`w-5 h-5 ${pendencias.length > 0 ? 'text-orange-500' : 'text-slate-400'}`} />
          Pendentes de vinculação
          {pendencias.length > 0 && (
            <Badge className="bg-orange-100 text-orange-800 border-0 ml-1">{pendencias.length}</Badge>
          )}
        </CardTitle>
        {totalRegistros > 0 && (
          <span className="text-xs text-slate-500">{totalRegistros} registro(s) aguardando classificação</span>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : pendencias.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <ListChecks className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-medium">Nenhuma descrição aguardando vinculação</p>
            <p className="text-xs mt-1">Descrições de tipo não reconhecidas nas importações de comissão aparecem aqui.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendencias.map((p) => (
              <div key={p.id} className="border border-orange-200 bg-orange-50/40 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">{p.descricao_original}</span>
                    {p.sem_descricao && <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700">sem tipo no arquivo</Badge>}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Origem: <span className="font-medium">{p.origem || 'não informada'}</span>
                    {' '}• {p.quantidade || 0} registro(s) afetado(s)
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Primeira ocorrência: {fmtDataHora(p.primeira_ocorrencia)} • Última: {fmtDataHora(p.ultima_ocorrencia)}
                  </p>
                  {(p.registros_falha_json) && (
                    <p className="text-xs text-red-600 mt-1">Falha parcial na última tentativa — os registros acima continuam pendentes.</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setVerRegistros(p)} className="bg-white">
                    <ListChecks className="w-4 h-4 mr-1.5" /> Ver registros
                  </Button>
                  <Button size="sm" onClick={() => setVinculando(p)} className="bg-orange-600 hover:bg-orange-700 text-white">
                    <Link2 className="w-4 h-4 mr-1.5" /> Vincular a um tipo
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {historico.length > 0 && (
          <div className="border-t border-slate-100 pt-3 mt-1">
            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mb-2">
              <History className="w-3.5 h-3.5" /> Últimas vinculações
            </p>
            <div className="space-y-1.5">
              {historico.map((h) => (
                <div key={h.id} className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2">
                  <span className="font-medium text-slate-700">{h.descricao_original}</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-medium text-slate-700">{h.tipo_nome || h.tipo_slug}</span>
                  <span className="text-slate-400">•</span>
                  <span>{fmtDataHora(h.vinculado_em)}</span>
                  {h.vinculado_por_nome && <><span className="text-slate-400">•</span><span>{h.vinculado_por_nome}</span></>}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <VincularTipoModal
        open={!!vinculando}
        onClose={() => setVinculando(null)}
        pendencia={vinculando}
        empresaId={empresaId}
        tipos={tipos}
        onConcluido={recarregar}
      />

      <RegistrosPendenciaModal
        open={!!verRegistros}
        onClose={() => setVerRegistros(null)}
        pendencia={verRegistros}
      />
    </Card>
  );
}