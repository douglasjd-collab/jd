import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, ListChecks, Link2, History, Search, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import VincularTipoModal from './VincularTipoModal';
import RegistrosPendenciaModal from './RegistrosPendenciaModal';
import { normalizarDescricaoTipo } from './tiposEmprestimoMatch';

const fmtDataHora = (v) => (v ? format(new Date(v), 'dd/MM/yyyy HH:mm') : '-');

export default function PendentesVinculacaoSection({
  empresaId,
  tipos = [],
  pendencias = [],
  isLoading = false,
  historico = [],
  onConcluido,
}) {
  const [busca, setBusca] = useState('');
  const [vinculando, setVinculando] = useState(null);
  const [verRegistros, setVerRegistros] = useState(null);

  const filtradas = useMemo(() => {
    const termo = normalizarDescricaoTipo(busca);
    if (!termo) return pendencias;
    return pendencias.filter((p) =>
      normalizarDescricaoTipo(`${p.descricao_original} ${p.origem || ''}`).includes(termo)
    );
  }, [pendencias, busca]);

  const totalRegistros = pendencias.reduce((s, p) => s + (p.quantidade || 0), 0);

  if (!empresaId) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por descrição ou banco..."
            className="pl-9"
          />
        </div>
        {totalRegistros > 0 && (
          <span className="text-xs text-slate-500">{totalRegistros} registro(s) aguardando classificação</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10 bg-white rounded-xl border border-slate-200">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-10 text-slate-500 bg-white rounded-xl border border-slate-200">
          <ListChecks className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium">
            {pendencias.length === 0 ? 'Nenhuma pendência de vinculação' : 'Nenhuma pendência encontrada para a busca'}
          </p>
          <p className="text-xs mt-1">Descrições de tipo não reconhecidas nas importações de comissão aparecem aqui.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtradas.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-orange-200 bg-orange-50/40 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900 text-sm break-all leading-snug">{p.descricao_original}</span>
                  {p.sem_descricao && (
                    <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 flex-shrink-0">
                      sem tipo no arquivo
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="flex items-center gap-1 break-all">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    {p.origem || 'origem não informada'}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span>{p.quantidade || 0} registro(s)</span>
                  <span className="text-slate-300">•</span>
                  <span>Última ocorrência: {fmtDataHora(p.ultima_ocorrencia)}</span>
                </p>
                {p.registros_falha_json && (
                  <p className="text-xs text-red-600 mt-1">Falha parcial na última tentativa — os registros continuam pendentes.</p>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button variant="outline" size="sm" onClick={() => setVerRegistros(p)} className="gap-1.5 bg-white">
                  <ListChecks className="w-3.5 h-3.5" /> Ver registros
                </Button>
                <Button size="sm" onClick={() => setVinculando(p)} className="gap-1.5 bg-orange-600 hover:bg-orange-700 text-white">
                  <Link2 className="w-3.5 h-3.5" /> Vincular tipo
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {historico.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mb-2">
            <History className="w-3.5 h-3.5" /> Últimas vinculações
          </p>
          <div className="space-y-1">
            {historico.map((h) => (
              <div key={h.id} className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2">
                <span className="font-medium text-slate-700 break-all">{h.descricao_original}</span>
                <span className="text-slate-400">→</span>
                <span className="font-medium text-slate-700">{h.tipo_nome || h.tipo_slug}</span>
                <span className="text-slate-300">•</span>
                <span>{fmtDataHora(h.vinculado_em)}</span>
                {h.vinculado_por_nome && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span>{h.vinculado_por_nome}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <VincularTipoModal
        open={!!vinculando}
        onClose={() => setVinculando(null)}
        pendencia={vinculando}
        empresaId={empresaId}
        tipos={tipos}
        onConcluido={onConcluido}
      />

      <RegistrosPendenciaModal
        open={!!verRegistros}
        onClose={() => setVerRegistros(null)}
        pendencia={verRegistros}
      />
    </div>
  );
}