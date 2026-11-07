import React, { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export function podeExcluirOportunidade(user, oportunidade) {
  if (!user || !oportunidade) return false;
  if (['super_admin', 'master'].includes(user.perfil)) return true;
  return user.perfil === 'admin' && !!user.empresa_id && user.empresa_id === oportunidade.empresa_id;
}

export default function ExcluirOportunidadeDialog({ oportunidade, currentUser, onClose }) {
  const queryClient = useQueryClient();
  const bloqueio = useRef(false);
  const excluir = useMutation({
    mutationFn: async () => {
      const usuario = await base44.auth.me();
      const atual = await base44.entities.Oportunidade.get(oportunidade.id);
      if (!usuario?.id || !podeExcluirOportunidade(currentUser, atual)) throw new Error('Você não tem permissão para excluir esta oportunidade.');
      // Excluir somente a oportunidade selecionada. Cliente e conversa são preservados.
      await base44.entities.Oportunidade.delete(atual.id);
      await base44.entities.LogAuditoria.create({
        usuario_id: usuario.id, usuario_nome: usuario.nome_perfil || usuario.full_name,
        acao: 'Excluiu oportunidade pelo bate-papo: ' + atual.titulo,
        entidade: 'Oportunidade', entidade_id: atual.id,
        dados_anteriores: JSON.stringify(atual), tipo: 'exclusao',
      }).catch(() => toast.warning('Oportunidade excluída, mas não foi possível registrar a auditoria.'));
      return atual.id;
    },
    onSuccess: async (id) => {
      queryClient.setQueriesData({ queryKey: ['oportunidades-conversa'] }, (lista) => Array.isArray(lista) ? lista.filter(o => o.id !== id) : lista);
      queryClient.removeQueries({ queryKey: ['oportunidade', id], exact: true });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['oportunidades-conversa'] }),
        queryClient.invalidateQueries({ queryKey: ['oportunidades'] }),
        queryClient.invalidateQueries({ queryKey: ['oportunidades-funil-chat'] }),
      ]);
      toast.success('Oportunidade excluída!');
      onClose();
    },
    onError: (erro) => toast.error(erro.message || 'Não foi possível excluir a oportunidade.'),
    onSettled: () => { bloqueio.current = false; },
  });
  return (
    <Dialog open={true} onOpenChange={(aberto) => { if (!aberto && !bloqueio.current) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir oportunidade?</DialogTitle>
          <DialogDescription>
            A oportunidade “{oportunidade.titulo || oportunidade.cliente_nome}” será removida permanentemente do funil. O cadastro do cliente e as mensagens da conversa serão mantidos.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={excluir.isPending} onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" disabled={excluir.isPending || !podeExcluirOportunidade(currentUser, oportunidade)} onClick={() => {
            if (bloqueio.current) return;
            bloqueio.current = true;
            excluir.mutate();
          }}>
            {excluir.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            {excluir.isPending ? 'Excluindo…' : 'Excluir oportunidade'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
