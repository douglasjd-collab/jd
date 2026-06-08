import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function VincularFilialModal({ open, onOpenChange, usuario, onSuccess }) {
  const [filialId, setFilialId] = useState('');
  const queryClient = useQueryClient();

  const { data: filiais = [], isLoading } = useQuery({
    queryKey: ['filiais-vinculo', usuario?.empresa_id, usuario?.id],
    enabled: open && !!usuario,
    queryFn: async () => {
      if (usuario?.empresa_id) {
        return base44.entities.Filial.filter({ empresa_id: usuario.empresa_id, situacao: 'ativa' }, 'nome');
      }
      // Fallback: buscar todas as filiais ativas
      return base44.entities.Filial.filter({ situacao: 'ativa' }, 'nome', 200);
    },
  });

  useEffect(() => {
    if (open && usuario) {
      setFilialId(usuario.filial_id || '');
    }
  }, [open, usuario]);

  const mutation = useMutation({
    mutationFn: async () => {
      const filialSelecionada = filiais.find(f => f.id === filialId);
      await base44.entities.Colaborador.update(usuario.id, {
        filial_id: filialId || null,
        filial_nome: filialSelecionada?.nome || null,
      });
    },
    onSuccess: () => {
      toast.success(`Filial vinculada com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ['usuarios'], exact: false });
      queryClient.refetchQueries({ queryKey: ['usuarios'], exact: false });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => {
      console.error('Erro ao vincular filial:', err);
      toast.error('Erro ao vincular filial: ' + (err?.message || 'desconhecido'));
    },
  });

  const filialAtual = filiais.find(f => f.id === usuario?.filial_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#23BE84]" />
            Vincular Filial
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-sm font-medium text-slate-900">{usuario?.nome}</p>
            <p className="text-xs text-slate-500">{usuario?.email}</p>
            {filialAtual && (
              <p className="text-xs text-[#23BE84] mt-1">Filial atual: {filialAtual.nome}</p>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : filiais.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">
              Nenhuma filial ativa cadastrada para esta empresa.
            </p>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Selecionar Filial</label>
              <Select value={filialId} onValueChange={setFilialId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma filial..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>— Sem filial —</SelectItem>
                  {filiais.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome} {f.codigo ? `(${f.codigo})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || filiais.length === 0}
            className="bg-[#23BE84] hover:bg-[#1da570] text-white"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}