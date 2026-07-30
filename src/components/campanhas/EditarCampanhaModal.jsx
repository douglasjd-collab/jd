import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const STATUS_OPCOES = ['rascunho', 'agendada', 'executando', 'pausada', 'concluida', 'cancelada', 'erro'];

function isoToCampos(isoStr) {
  if (!isoStr) return { data: '', hora: '' };
  try {
    const d = new Date(isoStr);
    return {
      data: format(d, 'yyyy-MM-dd'),
      hora: format(d, 'HH:mm'),
    };
  } catch {
    return { data: '', hora: '' };
  }
}

export default function EditarCampanhaModal({ open, onOpenChange, campanha, empresaId }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open || !campanha) return;
    const { data, hora } = isoToCampos(campanha.agendada_para);
    setForm({
      nome: campanha.nome || '',
      descricao: campanha.descricao || '',
      status: campanha.status || 'rascunho',
      agendada_para_data: data,
      agendada_para_hora: hora,
      velocidade_envio: campanha.velocidade_envio ?? 60,
      pausa_apos: campanha.pausa_apos ?? '',
      duracao_pausa_min: campanha.duracao_pausa_min ?? '',
    });
  }, [open, campanha]);

  if (!form) return null;

  const submit = async () => {
    setSalvando(true);
    try {
      const update = {
        nome: form.nome?.trim() || campanha.nome,
        descricao: form.descricao,
        status: form.status,
        velocidade_envio: Number(form.velocidade_envio) || 60,
        pausa_apos: form.pausa_apos === '' ? null : Number(form.pausa_apos),
        duracao_pausa_min: form.duracao_pausa_min === '' ? null : Number(form.duracao_pausa_min),
      };
      if (form.agendada_para_data && form.agendada_para_hora) {
        update.agendada_para = new Date(`${form.agendada_para_data}T${form.agendada_para_hora}:00`).toISOString();
      } else {
        update.agendada_para = null;
      }
      await base44.entities.Campanha.update(campanha.id, update);
      toast.success('Campanha atualizada');
      qc.invalidateQueries(['campanhas-lista', empresaId]);
      qc.invalidateQueries(['campanhas-dashboard', empresaId]);
      onOpenChange(false);
    } catch (e) {
      toast.error('Erro ao salvar: ' + (e.message || 'desconhecido'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Campanha</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <Label>Nome *</Label>
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Nome da campanha"
            />
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="Observação / descrição"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
              >
                {STATUS_OPCOES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Mensagens por minuto</Label>
              <Input
                type="number"
                value={form.velocidade_envio}
                onChange={(e) => setForm({ ...form, velocidade_envio: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Data agendada</Label>
              <Input
                type="date"
                value={form.agendada_para_data}
                onChange={(e) => setForm({ ...form, agendada_para_data: e.target.value })}
              />
            </div>
            <div>
              <Label>Hora agendada</Label>
              <Input
                type="time"
                value={form.agendada_para_hora}
                onChange={(e) => setForm({ ...form, agendada_para_hora: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Pausar após N envios</Label>
              <Input
                type="number"
                value={form.pausa_apos}
                onChange={(e) => setForm({ ...form, pausa_apos: e.target.value })}
                placeholder="0 = sem pausa"
              />
            </div>
            <div>
              <Label>Duração da pausa (min)</Label>
              <Input
                type="number"
                value={form.duracao_pausa_min}
                onChange={(e) => setForm({ ...form, duracao_pausa_min: e.target.value })}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={salvando || !form.nome?.trim()}>
            {salvando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}