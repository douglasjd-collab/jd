import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Loader2, Search, Tag } from 'lucide-react';
import { toast } from 'sonner';
import PendentesVinculacaoSection from '@/components/importacao/PendentesVinculacaoSection';
import TipoEmprestimoCard from '@/components/tiposEmprestimo/TipoEmprestimoCard';
import TipoEmprestimoFormModal from '@/components/tiposEmprestimo/TipoEmprestimoFormModal';
import usePendenciasVinculacao from '@/hooks/usePendenciasVinculacao';
import { normalizarDescricaoTipo } from '@/components/importacao/tiposEmprestimoMatch';

const TIPOS_PADRAO = [
  { nome: 'Novo', slug: 'NOVO', aliases_importacao: ['NOVO', 'Novo', 'novo'] },
  { nome: 'Refinanciamento', slug: 'REFINANCIAMENTO', aliases_importacao: ['REFINANCIAMENTO', 'Refinanciamento', 'REFIN'] },
  { nome: 'Portabilidade Pura', slug: 'PORTABILIDADE_PURA', aliases_importacao: ['PORTABILIDADE_PURA', 'Portabilidade', 'PORT'] },
  { nome: 'Refin + Portabilidade', slug: 'REFIN_PORTABILIDADE', aliases_importacao: ['REFIN_PORTABILIDADE', 'Refin+Port'] },
  { nome: 'Cartão Consignado', slug: 'CARTAO_CONSIGNADO', aliases_importacao: ['CARTAO_CONSIGNADO', 'Cartão Consignado', 'Cartao Consignado'] },
  { nome: 'Cartão Benefício', slug: 'CARTAO_BENEFICIO', aliases_importacao: ['CARTAO_BENEFICIO', 'Cartão Benefício', 'Cartao Beneficio'] },
  { nome: 'Saque', slug: 'SAQUE', aliases_importacao: ['SAQUE', 'Saque'] },
  { nome: 'Cartão', slug: 'CARTAO', aliases_importacao: ['CARTAO', 'Cartão', 'Cartao'] },
];

function ContadorAba({ total, destaque = false }) {
  return (
    <Badge
      variant="outline"
      className={destaque && total > 0
        ? 'border-orange-300 bg-orange-100 text-orange-800 font-semibold'
        : 'text-slate-500'}
    >
      {total}
    </Badge>
  );
}

export default function TiposEmprestimo() {
  const [empresaId, setEmpresaId] = useState(null);
  const [aba, setAba] = useState('tipos');
  const [busca, setBusca] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [deletando, setDeletando] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(async (me) => {
      if (me.perfil === 'super_admin' || me.role === 'super_admin') {
        const empresas = await base44.entities.Empresa.filter({ status: 'ativa' });
        if (empresas.length > 0) setEmpresaId(empresas[0].id);
      } else {
        const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
        if (colabs.length > 0) setEmpresaId(colabs[0].empresa_id);
      }
    });
  }, []);

  const { data: tipos = [], isLoading } = useQuery({
    queryKey: ['tipos-emprestimo', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.TipoEmprestimo.filter({ empresa_id: empresaId }, 'nome'),
  });

  const { pendencias, isLoading: carregandoPendencias, historico, recarregar } = usePendenciasVinculacao(empresaId);

  const recarregarTudo = () => {
    recarregar();
    queryClient.invalidateQueries({ queryKey: ['tipos-emprestimo', empresaId] });
  };

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TipoEmprestimo.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tipos-emprestimo', empresaId] });
      toast.success('Tipo removido!');
      setDeletando(null);
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  const seedPadrao = async () => {
    let criados = 0;
    for (const t of TIPOS_PADRAO) {
      const existe = tipos.find((x) => x.slug === t.slug);
      if (!existe) {
        await base44.entities.TipoEmprestimo.create({ ...t, empresa_id: empresaId, ativo: true });
        criados++;
      }
    }
    queryClient.invalidateQueries({ queryKey: ['tipos-emprestimo', empresaId] });
    toast.success(`${criados} tipo(s) padrão criado(s)!`);
  };

  const tiposOrdenados = useMemo(() => {
    const termo = normalizarDescricaoTipo(busca);
    const lista = [...tipos].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
    if (!termo) return lista;
    return lista.filter((t) => {
      const alvos = [
        t.nome,
        t.slug,
        ...(t.aliases_importacao || []),
        ...(t.aliases_por_origem || []).map((a) => String(a).replace('|', ' ')),
      ];
      return alvos.some((v) => normalizarDescricaoTipo(v).includes(termo));
    });
  }, [tipos, busca]);

  if (!empresaId) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        title="Tipos de Empréstimo"
        subtitle="Gerencie os tipos e suas vinculações de importação"
        backTo="Cadastros"
        actionLabel="Novo Tipo"
        actionIcon={Plus}
        onAction={() => { setEditando(null); setModalOpen(true); }}
      >
        {tipos.length === 0 && !isLoading && (
          <Button variant="outline" onClick={seedPadrao} className="text-blue-600 border-blue-300 hover:bg-blue-50">
            Criar Padrões
          </Button>
        )}
      </PageHeader>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="bg-slate-100 p-1 h-auto rounded-xl flex-wrap justify-start">
          <TabsTrigger value="tipos" className="gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 py-2">
            Tipos cadastrados <ContadorAba total={tipos.length} />
          </TabsTrigger>
          <TabsTrigger value="pendencias" className="gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 py-2">
            Pendentes de vinculação <ContadorAba total={pendencias.length} destaque />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tipos" className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, código ou alias..."
                className="pl-9"
              />
            </div>
            {!isLoading && tipos.length > 0 && (
              <span className="text-xs text-slate-500">
                {tiposOrdenados.length} de {tipos.length} tipo(s)
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
          ) : tipos.length === 0 ? (
            <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200">
              <Tag className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">Nenhum tipo cadastrado</p>
              <p className="text-sm mt-1">Clique em "Criar Padrões" para criar os tipos padrão do sistema.</p>
            </div>
          ) : tiposOrdenados.length === 0 ? (
            <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200">
              <Search className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-medium">Nenhum tipo encontrado para a busca</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {tiposOrdenados.map((tipo) => (
                <TipoEmprestimoCard
                  key={tipo.id}
                  tipo={tipo}
                  onEditar={(t) => { setEditando(t); setModalOpen(true); }}
                  onExcluir={(t) => setDeletando(t)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pendencias" className="mt-4">
          <PendentesVinculacaoSection
            empresaId={empresaId}
            tipos={tipos}
            pendencias={pendencias}
            isLoading={carregandoPendencias}
            historico={historico}
            onConcluido={recarregarTudo}
          />
        </TabsContent>
      </Tabs>

      <TipoEmprestimoFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditando(null); }}
        tipo={editando}
        empresaId={empresaId}
      />

      <AlertDialog open={!!deletando} onOpenChange={() => setDeletando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover tipo?</AlertDialogTitle>
            <AlertDialogDescription>
              O tipo "{deletando?.nome}" será removido. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deletando.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}