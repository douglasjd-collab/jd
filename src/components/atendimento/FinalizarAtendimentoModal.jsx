import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Finalização manual a partir do alerta. Reaproveita a regra já existente do
 * Bate-papo (nada é enviado ao cliente). O backend recusa finalizar enquanto o
 * cliente aguarda resposta.
 */
export default function FinalizarAtendimentoModal({ open, item, empresaId, onOpenChange, onConcluido }) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const finalizar = async () => {
    if (!item?.conversa_id) return;
    setSalvando(true);
    setErro('');
    try {
      const { data } = await base44.functions.invoke('alertasAtendimento', {
        empresa_id: empresaId,
        acao: 'finalizar',
        conversa_id: item.conversa_id,
      });
      if (data?.error) throw new Error(data.error);
      toast.success('Atendimento finalizado');
      onOpenChange(false);
      onConcluido?.();
    } catch (e) {
      const mensagem = e?.response?.data?.error || e?.message || 'Não foi possível finalizar';
      setErro(mensagem);
      toast.error(mensagem);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(valor) => !salvando && onOpenChange(valor)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Finalizar atendimento</DialogTitle>
          <DialogDescription>
            A conversa de {item?.cliente_nome || 'cliente'} será finalizada sem enviar mensagem.
            Uma nova mensagem do cliente reabre o atendimento.
          </DialogDescription>
        </DialogHeader>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={salvando} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={salvando}
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={finalizar}
          >
            {salvando ? 'Finalizando…' : 'Finalizar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}