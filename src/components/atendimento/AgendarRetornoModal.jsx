import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * Agenda o retorno na Agenda existente e só então finaliza a conversa.
 * Datas/horas futuras são obrigatórias. Se a agenda falhar, a conversa fica
 * aberta; se a finalização falhar, o evento é preservado e a nova tentativa
 * reaproveita o mesmo compromisso (sem duplicar).
 */
export default function AgendarRetornoModal({ open, item, empresaId, onOpenChange, onConcluido }) {
  const [motivo, setMotivo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [eventoCriado, setEventoCriado] = useState(null);

  useEffect(() => {
    if (!open) return;
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000);
    setData(amanha.toLocaleDateString('fr-CA'));
    setHora('09:00');
    setMotivo('');
    setDescricao('');
    setErro('');
    setEventoCriado(null);
  }, [open, item?.conversa_id]);

  const salvar = async () => {
    if (!item?.conversa_id) return;
    if (motivo.trim().length < 3) {
      setErro('Informe o motivo / próxima ação.');
      return;
    }
    if (!data || !hora) {
      setErro('Informe data e horário do retorno.');
      return;
    }
    const instante = new Date(`${data}T${hora}:00`);
    if (Number.isNaN(instante.getTime()) || instante.getTime() <= Date.now()) {
      setErro('O retorno precisa ser em data e horário futuros.');
      return;
    }

    setSalvando(true);
    setErro('');
    try {
      const { data: resposta } = await base44.functions.invoke('alertasAtendimento', {
        empresa_id: empresaId,
        acao: 'agendar_finalizar',
        conversa_id: item.conversa_id,
        motivo: motivo.trim(),
        descricao: descricao.trim(),
        inicio: instante.toISOString(),
      });
      if (resposta?.error) {
        if (resposta.evento_id) setEventoCriado(resposta.evento_id);
        throw new Error(resposta.error);
      }
      toast.success('Retorno agendado e atendimento finalizado');
      onOpenChange(false);
      onConcluido?.();
    } catch (e) {
      const mensagem = e?.response?.data?.error || e?.message || 'Não foi possível agendar o retorno';
      if (e?.response?.data?.evento_id) setEventoCriado(e.response.data.evento_id);
      setErro(mensagem);
      toast.error(mensagem);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(valor) => !salvando && onOpenChange(valor)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agendar retorno e finalizar</DialogTitle>
          <DialogDescription>
            O compromisso fica visível na Agenda e vinculado a {item?.cliente_nome || 'este contato'}.
            Nenhuma mensagem é enviada ao cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="retorno-motivo">Motivo / próxima ação</Label>
            <Input
              id="retorno-motivo"
              value={motivo}
              maxLength={120}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Retornar com a simulação aprovada"
              disabled={salvando}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="retorno-descricao">Detalhes (opcional)</Label>
            <Textarea
              id="retorno-descricao"
              value={descricao}
              rows={3}
              onChange={(e) => setDescricao(e.target.value)}
              disabled={salvando}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="retorno-data">Data</Label>
              <Input
                id="retorno-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                disabled={salvando}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="retorno-hora">Horário</Label>
              <Input
                id="retorno-hora"
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                disabled={salvando}
              />
            </div>
          </div>

          {eventoCriado && (
            <p className="text-xs text-amber-700">
              O retorno já foi salvo na agenda. Tentar novamente não cria um segundo compromisso.
            </p>
          )}
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={salvando} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={salvando} className="bg-emerald-600 hover:bg-emerald-700" onClick={salvar}>
            {salvando ? 'Salvando…' : eventoCriado ? 'Tentar finalizar novamente' : 'Agendar e finalizar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}