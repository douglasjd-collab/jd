import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, X, AlertTriangle, Check } from 'lucide-react';

// Seleção dos participantes da reunião (colaboradores da empresa).
// Todos os selecionados recebem o lembrete no WhatsApp, junto com o contato.
export default function ParticipantesReuniaoSelect({ colaboradores = [], value = [], onChange }) {
  const [busca, setBusca] = useState('');
  const chavesSelecionadas = new Set(value.map(p => p.user_id || p.id));

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return colaboradores.filter(c => !termo || (c.nome || '').toLowerCase().includes(termo));
  }, [colaboradores, busca]);

  const alternar = (colab) => {
    const chave = colab.user_id || colab.id;
    if (chavesSelecionadas.has(chave)) {
      onChange(value.filter(p => (p.user_id || p.id) !== chave));
      return;
    }
    onChange([
      ...value,
      {
        id: colab.id,
        user_id: colab.user_id || null,
        nome: colab.nome,
        telefone: colab.telefone || '',
      },
    ]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Participantes da reunião</Label>
        <span className="text-xs text-slate-400">Todos recebem o aviso no WhatsApp</span>
      </div>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((p) => {
            const chave = p.user_id || p.id;
            const semTelefone = !String(p.telefone || '').replace(/\D/g, '').length;
            return (
              <span
                key={chave}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  semTelefone
                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-blue-50 border-blue-200 text-blue-700'
                }`}
              >
                {p.nome}
                {semTelefone && <AlertTriangle className="w-3 h-3" title="Sem telefone cadastrado — não receberá o aviso" />}
                <button type="button" onClick={() => alternar(p)} className="hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          Sem participante, só o contato da reunião é avisado.
        </p>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar colaborador..."
          className="pl-9"
        />
      </div>

      {busca.trim().length > 0 && (
      <div className="max-h-44 overflow-y-auto rounded-lg border divide-y">
        {filtrados.length === 0 ? (
          <p className="px-3 py-4 text-xs text-slate-400 text-center">Nenhum colaborador encontrado</p>
        ) : (
          filtrados.map((colab) => {
            const chave = colab.user_id || colab.id;
            const selecionado = chavesSelecionadas.has(chave);
            const semTelefone = !String(colab.telefone || '').replace(/\D/g, '').length;
            return (
              <button
                type="button"
                key={colab.id}
                onClick={() => alternar(colab)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  selecionado ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    selecionado ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'
                  }`}
                >
                  {selecionado && <Check className="w-3 h-3" />}
                </span>
                <span className="flex-1 truncate text-slate-700">{colab.nome}</span>
                {semTelefone ? (
                  <span className="text-[10px] text-amber-600 flex items-center gap-1 flex-shrink-0">
                    <AlertTriangle className="w-3 h-3" /> sem telefone
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 flex-shrink-0">{colab.telefone}</span>
                )}
              </button>
            );
          })
        )}
      </div>
      )}
    </div>
  );
}