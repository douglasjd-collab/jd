import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import StatusPrincipalCard from '@/components/status/StatusPrincipalCard';
import ModalStatusPrincipal from '@/components/status/ModalStatusPrincipal';
import ModalSubstatus from '@/components/status/ModalSubstatus';
import StatusPendentesVinculacao from '@/components/status/StatusPendentesVinculacao';

export default function StatusPropostas() {
  const queryClient = useQueryClient();
  const [empresaId, setEmpresaId] = useState(null);

  // Modais
  const [modalPrincipal, setModalPrincipal] = useState(false);
  const [editandoPrincipal, setEditandoPrincipal] = useState(null);
  const [modalSubstatus, setModalSubstatus] = useState(false);
  const [statusPaiSelecionado, setStatusPaiSelecionado] = useState(null);
  const [editandoSubstatus, setEditandoSubstatus] = useState(null);
  const [excluindoStatus, setExcluindoStatus] = useState(null);

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    if (me.role === 'super_admin' || me.perfil === 'super_admin' || me.perfil === 'master') {
      const empresas = await base44.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) setEmpresaId(empresas[0].id);
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) setEmpresaId(colabs[0].empresa_id);
    }
  };

  const { data: allStatus = [], isLoading } = useQuery({
    queryKey: ['status-propostas', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.StatusProposta.filter({ empresa_id: empresaId }, 'ordem'),
  });

  // Separar por tipo
  const principais = allStatus.filter(s => s.tipo === 'principal' && s.ativo !== false);
  const substatusList = allStatus.filter(s => s.tipo === 'substatus');
  // Pendentes: substatus sem pai, criados por importação
  const pendentes = substatusList.filter(s => !s.status_pai_id && s.origem === 'importacao' && s.ativo !== false);
  // Substatus vinculados
  const vinculados = substatusList.filter(s => s.status_pai_id);

  const criarMutation = useMutation({
    mutationFn: (dados) => base44.entities.StatusProposta.create({ empresa_id: empresaId, ativo: true, ...dados }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['status-propostas'] }); toast.success('Criado com sucesso!'); fecharModais(); },
    onError: () => toast.error('Erro ao salvar'),
  });

  const atualizarMutation = useMutation({
    mutationFn: ({ id, dados }) => base44.entities.StatusProposta.update(id, dados),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['status-propostas'] }); toast.success('Atualizado!'); fecharModais(); },
    onError: () => toast.error('Erro ao atualizar'),
  });

  const excluirMutation = useMutation({
    mutationFn: (id) => base44.entities.StatusProposta.update(id, { ativo: false }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['status-propostas'] }); toast.success('Removido!'); setExcluindoStatus(null); },
    onError: () => toast.error('Erro ao remover'),
  });

  const fecharModais = () => {
    setModalPrincipal(false); setEditandoPrincipal(null);
    setModalSubstatus(false); setStatusPaiSelecionado(null); setEditandoSubstatus(null);
  };

  // Handlers status principal
  const handleSalvarPrincipal = (form) => {
    if (editandoPrincipal) {
      atualizarMutation.mutate({ id: editandoPrincipal.id, dados: { ...form, tipo: 'principal' } });
    } else {
      criarMutation.mutate({ ...form, tipo: 'principal', origem: 'manual' });
    }
  };

  // Handlers substatus
  const handleSalvarSubstatus = (form) => {
    const pai = statusPaiSelecionado || (editandoSubstatus ? principais.find(p => p.id === editandoSubstatus.status_pai_id) : null);
    const dados = {
      ...form,
      tipo: 'substatus',
      status_pai_id: pai?.id,
      funcao_fluxo: pai?.funcao_fluxo,
      origem: 'manual',
    };
    if (!form.cor) delete dados.cor;
    if (editandoSubstatus) {
      atualizarMutation.mutate({ id: editandoSubstatus.id, dados });
    } else {
      criarMutation.mutate(dados);
    }
  };

  if (!empresaId) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Status de Propostas"
        subtitle="Configure os status e substatus disponíveis para as propostas"
      >
        <Button className="bg-[#23BE84] hover:bg-[#1da570]" onClick={() => { setEditandoPrincipal(null); setModalPrincipal(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Status Principal
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Status pendentes de vinculação */}
          <StatusPendentesVinculacao pendentes={pendentes} principais={principais} />

          {/* Árvore de status */}
          {principais.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <p className="text-lg font-medium">Nenhum status principal cadastrado</p>
              <p className="text-sm mt-1">Clique em "Novo Status Principal" para começar</p>
            </div>
          ) : (
            principais.map(principal => (
              <StatusPrincipalCard
                key={principal.id}
                principal={principal}
                substatus={vinculados.filter(s => s.status_pai_id === principal.id && s.ativo !== false)}
                onEditPrincipal={(s) => { setEditandoPrincipal(s); setModalPrincipal(true); }}
                onDeletePrincipal={(s) => setExcluindoStatus(s)}
                onAddSubstatus={(pai) => { setStatusPaiSelecionado(pai); setEditandoSubstatus(null); setModalSubstatus(true); }}
                onEditSubstatus={(sub) => {
                  setEditandoSubstatus(sub);
                  setStatusPaiSelecionado(principais.find(p => p.id === sub.status_pai_id) || null);
                  setModalSubstatus(true);
                }}
                onDeleteSubstatus={(s) => setExcluindoStatus(s)}
              />
            ))
          )}
        </div>
      )}

      <ModalStatusPrincipal
        open={modalPrincipal}
        onClose={fecharModais}
        onSave={handleSalvarPrincipal}
        statusEditando={editandoPrincipal}
        loading={criarMutation.isPending || atualizarMutation.isPending}
      />

      <ModalSubstatus
        open={modalSubstatus}
        onClose={fecharModais}
        onSave={handleSalvarSubstatus}
        statusPai={statusPaiSelecionado}
        substatusEditando={editandoSubstatus}
        loading={criarMutation.isPending || atualizarMutation.isPending}
      />

      <AlertDialog open={!!excluindoStatus} onOpenChange={() => setExcluindoStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover status?</AlertDialogTitle>
            <AlertDialogDescription>
              O status "{excluindoStatus?.nome}" será desativado. Propostas já vinculadas não serão afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => excluirMutation.mutate(excluindoStatus.id)} className="bg-red-600 hover:bg-red-700">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}