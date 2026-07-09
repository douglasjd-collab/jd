import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trophy, Loader2, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { calcularMediaPercentual, formatPercent } from '@/components/utils/gruposConsorcioHelpers';

const initialForm = {
  data_assembleia: '',
  total_contemplados: '',
  observacoes: '',
  lance_livre_menor_percentual: '',
  lance_livre_qtd_contemplados: '',
  lance_limitado_menor_percentual: '',
  lance_limitado_qtd_contemplados: '',
  lance_fixo_30_qtd_contemplados: '',
  lance_fixo_50_qtd_contemplados: '',
  sorteio_qtd_contemplados: ''
};

export default function AssembleiasGrupoTab({ grupoId, empresaId }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const queryClient = useQueryClient();

  const { data: assembleias = [], isLoading } = useQuery({
    queryKey: ['assembleias-grupo', grupoId],
    enabled: !!grupoId,
    queryFn: () => base44.entities.AssembleiaGrupoConsorcio.filter({ grupo_consorcio_id: grupoId }, '-data_assembleia')
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.AssembleiaGrupoConsorcio.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assembleias-grupo', grupoId] });
      setForm(initialForm);
      setShowForm(false);
      toast.success('Assembleia cadastrada! Médias recalculadas automaticamente.');
    }
  });

  const handleSalvar = () => {
    if (!form.data_assembleia) {
      toast.error('Informe a data da assembleia');
      return;
    }
    const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
    createMutation.mutate({
      empresa_id: empresaId,
      grupo_consorcio_id: grupoId,
      data_assembleia: form.data_assembleia,
      total_contemplados: numOrNull(form.total_contemplados) ?? 0,
      observacoes: form.observacoes || null,
      lance_livre_menor_percentual: numOrNull(form.lance_livre_menor_percentual),
      lance_livre_qtd_contemplados: numOrNull(form.lance_livre_qtd_contemplados) ?? 0,
      lance_limitado_menor_percentual: numOrNull(form.lance_limitado_menor_percentual),
      lance_limitado_qtd_contemplados: numOrNull(form.lance_limitado_qtd_contemplados) ?? 0,
      lance_fixo_30_qtd_contemplados: numOrNull(form.lance_fixo_30_qtd_contemplados) ?? 0,
      lance_fixo_50_qtd_contemplados: numOrNull(form.lance_fixo_50_qtd_contemplados) ?? 0,
      sorteio_qtd_contemplados: numOrNull(form.sorteio_qtd_contemplados) ?? 0
    });
  };

  const medias = [3, 6, 12].map(meses => ({
    meses,
    livre: calcularMediaPercentual(assembleias, meses, 'lance_livre_menor_percentual'),
    limitado: calcularMediaPercentual(assembleias, meses, 'lance_limitado_menor_percentual')
  }));

  return (
    <div className="space-y-6">
      {/* Médias automáticas */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📊 Médias Automáticas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {medias.map(m => (
              <div key={m.meses} className="p-3 bg-slate-50 rounded-lg border">
                <p className="text-xs font-semibold text-slate-600 mb-2">Últimos {m.meses} meses</p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Lance Livre:</span>
                  <span className="font-bold text-blue-700">{formatPercent(m.livre)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Lance Limitado:</span>
                  <span className="font-bold text-orange-700">{formatPercent(m.limitado)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Histórico de Assembleias</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-2 bg-[#23BE84] hover:bg-[#1da570]">
          <Plus className="w-4 h-4" /> Nova Assembleia
        </Button>
      </div>

      {showForm && (
        <Card className="border-2 border-[#23BE84]/30">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Data da Assembleia *</Label>
                <Input type="date" value={form.data_assembleia} onChange={(e) => setForm({ ...form, data_assembleia: e.target.value })} />
              </div>
              <div>
                <Label>Total de Contemplados</Label>
                <Input type="number" value={form.total_contemplados} onChange={(e) => setForm({ ...form, total_contemplados: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 space-y-2">
                <p className="text-xs font-semibold text-blue-700">Lance Livre</p>
                <div>
                  <Label className="text-xs">Menor percentual contemplado</Label>
                  <Input type="number" step="0.01" value={form.lance_livre_menor_percentual} onChange={(e) => setForm({ ...form, lance_livre_menor_percentual: e.target.value })} placeholder="Ex: 76" />
                </div>
                <div>
                  <Label className="text-xs">Quantidade de contemplados</Label>
                  <Input type="number" value={form.lance_livre_qtd_contemplados} onChange={(e) => setForm({ ...form, lance_livre_qtd_contemplados: e.target.value })} />
                </div>
              </div>

              <div className="p-3 bg-orange-50 rounded-lg border border-orange-200 space-y-2">
                <p className="text-xs font-semibold text-orange-700">Lance Limitado</p>
                <div>
                  <Label className="text-xs">Menor percentual contemplado</Label>
                  <Input type="number" step="0.01" value={form.lance_limitado_menor_percentual} onChange={(e) => setForm({ ...form, lance_limitado_menor_percentual: e.target.value })} placeholder="Ex: 50" />
                </div>
                <div>
                  <Label className="text-xs">Quantidade de contemplados</Label>
                  <Input type="number" value={form.lance_limitado_qtd_contemplados} onChange={(e) => setForm({ ...form, lance_limitado_qtd_contemplados: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Lance Fixo 30% — Qtd. contemplada</Label>
                <Input type="number" value={form.lance_fixo_30_qtd_contemplados} onChange={(e) => setForm({ ...form, lance_fixo_30_qtd_contemplados: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Lance Fixo 50% — Qtd. contemplada</Label>
                <Input type="number" value={form.lance_fixo_50_qtd_contemplados} onChange={(e) => setForm({ ...form, lance_fixo_50_qtd_contemplados: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Sorteio — Qtd. contemplada</Label>
                <Input type="number" value={form.sorteio_qtd_contemplados} onChange={(e) => setForm({ ...form, sorteio_qtd_contemplados: e.target.value })} />
              </div>
            </div>

            <div>
              <Label className="text-xs">Observações</Label>
              <Input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder="Anotações internas" />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={handleSalvar} disabled={createMutation.isPending} className="bg-[#23BE84] hover:bg-[#1da570]">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Assembleia'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : assembleias.length === 0 ? (
        <p className="text-center text-slate-500 py-8 text-sm">Nenhuma assembleia cadastrada ainda.</p>
      ) : (
        <div className="space-y-3">
          {assembleias.map(a => (
            <Card key={a.id} className="border-0 shadow-sm">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    {new Date(a.data_assembleia + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </div>
                  <div className="flex items-center gap-1 text-sm font-bold text-amber-700">
                    <Trophy className="w-4 h-4" /> {a.total_contemplados || 0} contemplados
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                  {a.lance_livre_menor_percentual !== null && a.lance_livre_menor_percentual !== undefined && (
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <p className="font-semibold text-blue-700">Lance Livre</p>
                      <p className="text-blue-900">{formatPercent(a.lance_livre_menor_percentual)}</p>
                      <p className="text-blue-600">{a.lance_livre_qtd_contemplados || 0} contemplados</p>
                    </div>
                  )}
                  {a.lance_limitado_menor_percentual !== null && a.lance_limitado_menor_percentual !== undefined && (
                    <div className="p-2 bg-orange-50 rounded-lg">
                      <p className="font-semibold text-orange-700">Lance Limitado</p>
                      <p className="text-orange-900">{formatPercent(a.lance_limitado_menor_percentual)}</p>
                      <p className="text-orange-600">{a.lance_limitado_qtd_contemplados || 0} contemplados</p>
                    </div>
                  )}
                  {a.lance_fixo_50_qtd_contemplados > 0 && (
                    <div className="p-2 bg-purple-50 rounded-lg">
                      <p className="font-semibold text-purple-700">Lance Fixo 50%</p>
                      <p className="text-purple-600">{a.lance_fixo_50_qtd_contemplados} contemplados</p>
                    </div>
                  )}
                  {a.lance_fixo_30_qtd_contemplados > 0 && (
                    <div className="p-2 bg-purple-50 rounded-lg">
                      <p className="font-semibold text-purple-700">Lance Fixo 30%</p>
                      <p className="text-purple-600">{a.lance_fixo_30_qtd_contemplados} contemplados</p>
                    </div>
                  )}
                  {a.sorteio_qtd_contemplados > 0 && (
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <p className="font-semibold text-slate-700">Sorteio</p>
                      <p className="text-slate-600">{a.sorteio_qtd_contemplados} contemplados</p>
                    </div>
                  )}
                </div>
                {a.observacoes && <p className="text-xs text-slate-500 mt-2 italic">{a.observacoes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}