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
      mensagem_tipo: campanha.mensagem_tipo || 'texto',
      mensagem_texto: campanha.mensagem_texto || '',
      midia_url: campanha.midia_url || '',
      intervalo_min_segundos: campanha.intervalo_min_segundos ?? 5,
      intervalo_max_segundos: campanha.intervalo_max_segundos ?? 10,
      velocidade_envio: campanha.velocidade_envio ?? 60,
      pausa_apos: campanha.pausa_apos ?? '',
      duracao_pausa_min: campanha.duracao_pausa_min ?? '',
    });
  }, [open, campanha]);

  if (!form) return null;

  const podeEditarConteudo = ['rascunho', 'agendada', 'pausada'].includes(campanha?.status)
    && Number(campanha?.enviados || 0) === 0
    && Number(campanha?.falhas || 0) === 0;
  const podeEditarAgendamento = ['rascunho', 'agendada'].includes(campanha?.status);

  const submit = async () => {
    setSalvando(true);
    try {
      if (form.status === 'agendada' && (!form.agendada_para_data || !form.agendada_para_hora)) {
        toast.error('Informe a data e o horário da campanha agendada.');
        setSalvando(false);
        return;
      }
      if (podeEditarAgendamento && form.status === 'agendada') {
        const horario = new Date(`${form.agendada_para_data}T${form.agendada_para_hora}:00`);
        if (horario.getTime() <= Date.now()) {
          toast.error('Escolha um horário futuro para agendar a campanha.');
          setSalvando(false);
          return;
        }
      }
      if (podeEditarConteudo && campanha.canal === 'whatsapp_nao_oficial') {
        const minimo = Number(form.intervalo_min_segundos);
        const maximo = Number(form.intervalo_max_segundos);
        if (!Number.isFinite(minimo) || minimo < 1 || !Number.isFinite(maximo) || maximo < minimo) {
          toast.error('Confira o intervalo: o máximo deve ser igual ou maior que o mínimo.');
          setSalvando(false);
          return;
        }
        if (form.mensagem_tipo !== 'texto' && !String(form.midia_url || '').trim()) {
          toast.error('Informe a URL da imagem ou do vídeo.');
          setSalvando(false);
          return;
        }
      }
      const update = {
        nome: form.nome?.trim() || campanha.nome,
        descricao: form.descricao,
      };
      if (podeEditarAgendamento) {
        update.status = form.status;
        if (form.status === 'agendada' && form.agendada_para_data && form.agendada_para_hora) {
          update.agendada_para = new Date(`${form.agendada_para_data}T${form.agendada_para_hora}:00`).toISOString();
        } else {
          update.agendada_para = null;
        }
      }
      if (podeEditarConteudo) {
        update.velocidade_envio = Number(form.velocidade_envio) || 60;
        update.intervalo_min_segundos = Number(form.intervalo_min_segundos) || 5;
        update.intervalo_max_segundos = Number(form.intervalo_max_segundos) || 10;
        update.pausa_apos = form.pausa_apos === '' ? null : Number(form.pausa_apos);
        update.duracao_pausa_min = form.duracao_pausa_min === '' ? null : Number(form.duracao_pausa_min);
        if (campanha.canal === 'whatsapp_nao_oficial') {
          update.mensagem_tipo = form.mensagem_tipo;
          update.mensagem_texto = form.mensagem_texto;
          update.midia_url = form.mensagem_tipo === 'texto' ? null : form.midia_url;
        }
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

          {podeEditarAgendamento ? (
            <>
              <div>
                <Label>Status</Label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="rascunho">Rascunho</option>
                  <option value="agendada">Agendada</option>
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Data agendada</Label>
                  <Input type="date" value={form.agendada_para_data} onChange={(e) => setForm({ ...form, agendada_para_data: e.target.value })} />
                </div>
                <div>
                  <Label>Hora agendada</Label>
                  <Input type="time" value={form.agendada_para_hora} onChange={(e) => setForm({ ...form, agendada_para_hora: e.target.value })} />
                </div>
              </div>
            </>
          ) : (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              Status: {campanha.status}. Esta campanha já teve processamento; mensagem, público e agendamento estão bloqueados para preservar o histórico.
            </p>
          )}

          {podeEditarConteudo && campanha.canal === 'whatsapp_nao_oficial' && (
            <>
              <div>
                <Label>Tipo da mensagem</Label>
                <select value={form.mensagem_tipo} onChange={(e) => setForm({ ...form, mensagem_tipo: e.target.value })} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
                  <option value="texto">Texto</option>
                  <option value="imagem_texto">Imagem e texto</option>
                  <option value="video_texto">Vídeo e texto</option>
                </select>
              </div>
              <div>
                <Label>Mensagem</Label>
                <Textarea rows={5} value={form.mensagem_texto} onChange={(e) => setForm({ ...form, mensagem_texto: e.target.value })} placeholder="Texto enviado aos destinatários" />
              </div>
              {form.mensagem_tipo !== 'texto' && (
                <div>
                  <Label>URL da mídia</Label>
                  <Input value={form.midia_url} onChange={(e) => setForm({ ...form, midia_url: e.target.value })} placeholder="https://..." />
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Intervalo mínimo (segundos)</Label>
                  <Input type="number" min="1" value={form.intervalo_min_segundos} onChange={(e) => setForm({ ...form, intervalo_min_segundos: e.target.value })} />
                </div>
                <div>
                  <Label>Intervalo máximo (segundos)</Label>
                  <Input type="number" min={form.intervalo_min_segundos || 1} value={form.intervalo_max_segundos} onChange={(e) => setForm({ ...form, intervalo_max_segundos: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Pausar após N envios</Label>
                  <Input type="number" min="1" value={form.pausa_apos} onChange={(e) => setForm({ ...form, pausa_apos: e.target.value })} placeholder="50" />
                </div>
                <div>
                  <Label>Duração da pausa (min)</Label>
                  <Input type="number" min="0" value={form.duracao_pausa_min} onChange={(e) => setForm({ ...form, duracao_pausa_min: e.target.value })} />
                </div>
              </div>
            </>
          )}

          {podeEditarConteudo && campanha.canal !== 'whatsapp_nao_oficial' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Mensagens por minuto</Label>
                <Input type="number" min="1" value={form.velocidade_envio} onChange={(e) => setForm({ ...form, velocidade_envio: e.target.value })} />
              </div>
              <div>
                <Label>Pausar após N envios</Label>
                <Input type="number" min="1" value={form.pausa_apos} onChange={(e) => setForm({ ...form, pausa_apos: e.target.value })} />
              </div>
            </div>
          )}


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