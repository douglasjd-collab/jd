import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function EstornarTransferenciaModal({ open, onOpenChange, venda, onConcluido }) {
  const [justificativa, setJustificativa] = useState('');
  const [salvando, setSalvando] = useState(false);

  const { data: transferencia } = useQuery({
    queryKey: ['transferencia-venda', venda?.transferencia_id],
    enabled: open && !!venda?.transferencia_id,
    queryFn: async () => {
      const res = await base44.entities.TransferenciaCota.filter({ id: venda.transferencia_id });
      return res[0];
    },
  });

  const handleEstornar = async () => {
    if (!venda?.transferencia_id) return;
    if (!justificativa.trim()) {
      toast.error('Justificativa é obrigatória.');
      return;
    }
    setSalvando(true);
    try {
      const res = await base44.functions.invoke('transferirCota', {
        transferencia_id: venda.transferencia_id,
        acao: 'estornar',
        justificativa: justificativa.trim(),
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success(res.data?.mensagem || 'Estorno realizado.');
      onConcluido?.();
      onOpenChange(false);
      setJustificativa('');
    } catch (err) {
      toast.error('Erro ao estornar: ' + (err.message || 'erro'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !salvando && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="w-5 h-5" />
            Estornar transferência
          </DialogTitle>
          <DialogDescription>
            Esta ação reverte a transferência concluída. A proposta do novo titular será cancelada e a proposta de origem
            voltará a ficar ativa. Restrição exclusiva para administrador/superadministrador.
          </DialogDescription>
        </DialogHeader>

        {transferencia && (
          <div className="text-sm space-y-1 bg-slate-50 rounded-lg p-3">
            <p><strong>Cota:</strong> {transferencia.grupo}/{transferencia.cota}</p>
            <p><strong>Origem:</strong> {transferencia.cliente_origem_nome} (CPF {transferencia.cliente_origem_cpf})</p>
            <p><strong>Novo titular:</strong> {transferencia.cliente_destino_nome} (CPF {transferencia.cliente_destino_cpf})</p>
            <p><strong>Data da aprovação:</strong> {transferencia.data_aprovacao ? new Date(transferencia.data_aprovacao).toLocaleDateString('pt-BR') : '-'}</p>
          </div>
        )}

        <div>
          <label className="text-sm font-medium mb-1 block">Justificativa *</label>
          <Textarea
            rows={4}
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Explique o motivo do estorno. Esta informação será registrada na auditoria."
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleEstornar} disabled={salvando}>
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar estorno'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}