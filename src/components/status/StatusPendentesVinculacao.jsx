import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Save } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';

const FUNCAO_LABEL = {
  em_digitacao: 'Em Digitação', em_analise: 'Em Análise', aprovado: 'Aprovado',
  reprovado: 'Reprovado', finalizado: 'Finalizado', cancelado: 'Cancelado', pendente: 'Pendente',
};

export default function StatusPendentesVinculacao({ pendentes, principais }) {
  const queryClient = useQueryClient();
  const [vinculos, setVinculos] = useState({});
  const [salvando, setSalvando] = useState({});

  if (!pendentes || pendentes.length === 0) return null;

  const handleSalvar = async (substatus) => {
    const paiId = vinculos[substatus.id];
    if (!paiId) {
      toast.error('Selecione um status principal');
      return;
    }
    const pai = principais.find(p => p.id === paiId);
    if (!pai) return;

    setSalvando(s => ({ ...s, [substatus.id]: true }));
    try {
      await base44.entities.StatusProposta.update(substatus.id, {
        status_pai_id: paiId,
        funcao_fluxo: pai.funcao_fluxo,
      });
      queryClient.invalidateQueries({ queryKey: ['status-propostas'] });
      toast.success(`"${substatus.nome}" vinculado a "${pai.nome}"`);
    } catch {
      toast.error('Erro ao salvar vínculo');
    } finally {
      setSalvando(s => ({ ...s, [substatus.id]: false }));
    }
  };

  return (
    <Card className="border-yellow-200 bg-yellow-50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-yellow-800 text-base">
          <AlertTriangle className="w-5 h-5" />
          Status pendentes de vinculação ({pendentes.length})
        </CardTitle>
        <p className="text-xs text-yellow-700">
          Estes status foram criados automaticamente durante importações. Vincule-os a um status principal para que funcionem corretamente nos relatórios e funil.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* Cabeçalho da tabela */}
          <div className="grid grid-cols-12 gap-2 text-xs font-medium text-slate-500 px-2 pb-1 border-b border-yellow-200">
            <div className="col-span-3">Texto original</div>
            <div className="col-span-4">Status principal</div>
            <div className="col-span-3">Função herdada</div>
            <div className="col-span-2">Ação</div>
          </div>
          {pendentes.map(sub => {
            const paiId = vinculos[sub.id];
            const pai = principais.find(p => p.id === paiId);
            return (
              <div key={sub.id} className="grid grid-cols-12 gap-2 items-center bg-white rounded-lg px-2 py-2 border border-yellow-100">
                <div className="col-span-3">
                  <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-300 text-xs">{sub.nome}</Badge>
                </div>
                <div className="col-span-4">
                  <Select value={paiId || ''} onValueChange={v => setVinculos(vl => ({ ...vl, [sub.id]: v }))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {principais.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3 text-xs text-slate-500">
                  {pai ? (
                    <span className="px-2 py-0.5 bg-slate-100 rounded-full">{FUNCAO_LABEL[pai.funcao_fluxo] || '—'}</span>
                  ) : <span className="text-slate-300">—</span>}
                </div>
                <div className="col-span-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!paiId || salvando[sub.id]} onClick={() => handleSalvar(sub)}>
                    <Save className="w-3 h-3 mr-1" />
                    {salvando[sub.id] ? '...' : 'Vincular'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}