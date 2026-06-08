import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export default function VincularFilialModal({ open, onOpenChange, usuario, onSuccess }) {
  const [filialId, setFilialId] = useState('__none__');
  const queryClient = useQueryClient();

  const { data: filiais = [], isLoading } = useQuery({
    queryKey: ['filiais-vinculo', usuario?.empresa_id],
    enabled: open && !!usuario?.empresa_id,
    queryFn: () => base44.entities.Filial.filter({ empresa_id: usuario.empresa_id, situacao: 'ativa' }, 'nome'),
  });

  useEffect(() => {
    if (open && usuario) {
      setFilialId(usuario.filial_id || '__none__');
    }
  }, [open, usuario?.id]);

  const mutation = useMutation({
    mutationFn: async () => {
      const idReal = filialId === '__none__' ? null : filialId;
      const filialSelecionada = idReal ? filiais.find(f => f.id === idReal) : null;

      await base44.entities.Colaborador.update(usuario.id, {
        filial_id: idReal,
        filial_nome: filialSelecionada?.nome || null,
      });

      return { filial_id: idReal, filial_nome: filialSelecionada?.nome || null };
    },
    onSuccess: (result) => {
      // Atualizar cache de todos os queries de usuarios otimisticamente
      queryClient.setQueriesData({ queryKey: ['usuarios'] }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map(u =>
          u.id === usuario.id
            ? { ...u, filial_id: result.filial_id, filial_nome: result.filial_nome }
            : u
        );
      });

      toast.success(result.filial_nome
        ? `Filial "${result.filial_nome}" vinculada com sucesso!`
        : 'Filial removida com sucesso!'
      );

      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => {
      console.error('Erro ao vincular filial:', err);
      toast.error('Erro ao vincular filial: ' + (err?.message || 'desconhecido'));
    },
  });

  const filialAtual = filiais.find(f => f.id === usuario?.filial_id);

  if (!usuario) return null;

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
            <p className="text-sm font-medium text-slate-900">{usuario.nome}</p>
            <p className="text-xs text-slate-500">{usuario.email}</p>
            {(filialAtual || usuario.filial_nome) && (
              <p className="text-xs text-[#23BE84] mt-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Filial atual: {filialAtual?.nome || usuario.filial_nome}
              </p>
            )}
          </div>

          {!usuario.empresa_id ? (
            <p className="text-sm text-amber-600 text-center py-4 bg-amber-50 rounded-lg px-3">
              Este usuário não está vinculado a uma empresa. Vincule a uma empresa primeiro.
            </p>
          ) : isLoading ? (
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
                  <SelectItem value="__none__">— Sem filial —</SelectItem>
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
            disabled={mutation.isPending || !usuario.empresa_id || (filiais.length === 0 && filialId === '__none__')}
            className="bg-[#23BE84] hover:bg-[#1da570] text-white"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}