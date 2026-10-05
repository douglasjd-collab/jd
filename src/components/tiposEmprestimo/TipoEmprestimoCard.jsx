import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Pencil, MoreVertical, Trash2, ChevronDown, ChevronUp, Tags, Building2 } from 'lucide-react';

const LIMITE_VISIVEL = 3;

export default function TipoEmprestimoCard({ tipo, onEditar, onExcluir }) {
  const [expandido, setExpandido] = useState(false);

  const aliases = tipo.aliases_importacao || [];
  const vinculosBanco = tipo.aliases_por_origem || [];
  const visiveis = expandido ? aliases : aliases.slice(0, LIMITE_VISIVEL);
  const ocultos = Math.max(aliases.length - LIMITE_VISIVEL, 0);
  const temMais = ocultos > 0 || vinculosBanco.length > 0;

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-3 hover:border-slate-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 break-words leading-snug">{tipo.nome}</p>
          <p className="text-xs font-mono text-slate-500 mt-0.5 break-all">{tipo.slug}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!tipo.ativo && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Ações">
                <MoreVertical className="w-4 h-4 text-slate-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onExcluir(tipo)} className="text-red-600 focus:text-red-700">
                <Trash2 className="w-4 h-4 mr-2" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 flex items-center gap-1.5">
            <Tags className="w-3.5 h-3.5" /> Variações de importação
          </span>
          <Badge variant="outline" className="text-[10px] flex-shrink-0">{aliases.length}</Badge>
        </div>
        {visiveis.length === 0 ? (
          <p className="text-xs text-slate-400 mt-1.5">Nenhuma variação cadastrada</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {visiveis.map((alias, i) => (
              <Badge
                key={`${alias}-${i}`}
                variant="secondary"
                className="text-xs font-normal max-w-full whitespace-normal break-all text-left leading-snug"
              >
                {alias}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {expandido && vinculosBanco.length > 0 && (
        <div className="min-w-0 border-t border-slate-100 pt-2">
          <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" /> Vínculos por banco ({vinculosBanco.length})
          </span>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {vinculosBanco.map((vinculo, i) => {
              const [origem, descricao] = String(vinculo).split('|');
              return (
                <Badge
                  key={i}
                  variant="outline"
                  className="text-xs font-normal max-w-full whitespace-normal break-all text-left border-blue-200 text-blue-800 bg-blue-50 leading-snug"
                >
                  {origem} · {descricao}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-auto pt-1">
        <Button variant="outline" size="sm" onClick={() => onEditar(tipo)} className="gap-1.5 flex-shrink-0">
          <Pencil className="w-3.5 h-3.5" /> Editar
        </Button>
        {temMais && (
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            className="text-xs font-medium text-blue-700 hover:text-blue-900 flex items-center gap-1"
          >
            {expandido ? (
              <>Recolher <ChevronUp className="w-3.5 h-3.5" /></>
            ) : ocultos > 0 ? (
              <>+ {ocultos} variações <ChevronDown className="w-3.5 h-3.5" /></>
            ) : (
              <>Ver vínculos por banco <ChevronDown className="w-3.5 h-3.5" /></>
            )}
          </button>
        )}
      </div>
    </div>
  );
}