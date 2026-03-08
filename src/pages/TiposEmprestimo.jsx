import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Loader2, X, Tag } from 'lucide-react';
import { toast } from 'sonner';

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

function FormModal({ open, onClose, tipo, empresaId, onSaved }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ nome: '', slug: '', aliases_importacao: [], ativo: true });
  const [novoAlias, setNovoAlias] = useState('');

  useEffect(() => {
    if (tipo) {
      setForm({
        nome: tipo.nome || '',
        slug: tipo.slug || '',
        aliases_importacao: tipo.aliases_importacao || [],
        ativo: tipo.ativo !== false,
      });
    } else {
      setForm({ nome: '', slug: '', aliases_importacao: [], ativo: true });
    }
  }, [tipo, open]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (tipo?.id) return base44.entities.TipoEmprestimo.update(tipo.id, data);
      return base44.entities.TipoEmprestimo.create({ ...data, empresa_id: empresaId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tipos-emprestimo', empresaId] });
      toast.success(tipo?.id ? 'Tipo atualizado!' : 'Tipo criado!');
      onSaved?.();
      onClose();
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  const handleNomeChange = (nome) => {
    const slug = nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
    setForm(f => ({ ...f, nome, slug }));
  };

  const adicionarAlias = () => {
    if (!novoAlias.trim()) return;
    setForm(f => ({ ...f, aliases_importacao: [...(f.aliases_importacao || []), novoAlias.trim()] }));
    setNovoAlias('');
  };

  const removerAlias = (idx) => {
    setForm(f => ({ ...f, aliases_importacao: f.aliases_importacao.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nome.trim() || !form.slug.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    saveMutation.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tipo?.id ? 'Editar Tipo' : 'Novo Tipo de Empréstimo'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => handleNomeChange(e.target.value)} placeholder="Ex: Cartão Consignado" required />
          </div>
          <div>
            <Label>Código Interno (slug)</Label>
            <Input value={form.slug} onChange={(e) => setForm(f => ({ ...f, slug: e.target.value.toUpperCase().replace(/\s+/g, '_') }))} placeholder="Ex: CARTAO_CONSIGNADO" className="font-mono text-sm" />
            <p className="text-xs text-slate-500 mt-1">Gerado automaticamente a partir do nome. Não altere se houver dados vinculados.</p>
          </div>
          <div>
            <Label>Aliases de Importação</Label>
            <p className="text-xs text-slate-500 mb-2">Nomes que vêm nos arquivos de importação e devem ser vinculados a este tipo.</p>
            <div className="flex gap-2 mb-2">
              <Input value={novoAlias} onChange={(e) => setNovoAlias(e.target.value)} placeholder="Nome do arquivo..." onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), adicionarAlias())} />
              <Button type="button" variant="outline" onClick={adicionarAlias}><Plus className="w-4 h-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(form.aliases_importacao || []).map((alias, idx) => (
                <Badge key={idx} variant="secondary" className="gap-1 pr-1">
                  {alias}
                  <button type="button" onClick={() => removerAlias(idx)} className="hover:text-red-600 ml-1"><X className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saveMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TiposEmprestimo() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [deletandoId, setDeletandoId] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(async (me) => {
      setUser(me);
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

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TipoEmprestimo.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tipos-emprestimo', empresaId] });
      toast.success('Tipo removido!');
      setDeletandoId(null);
    },
    onError: (e) => toast.error('Erro: ' + e.message),
  });

  const seedPadrao = async () => {
    let criados = 0;
    for (const t of TIPOS_PADRAO) {
      const existe = tipos.find(x => x.slug === t.slug);
      if (!existe) {
        await base44.entities.TipoEmprestimo.create({ ...t, empresa_id: empresaId, ativo: true });
        criados++;
      }
    }
    queryClient.invalidateQueries({ queryKey: ['tipos-emprestimo', empresaId] });
    toast.success(`${criados} tipo(s) padrão criado(s)!`);
  };

  if (!empresaId) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tipos de Empréstimo"
        subtitle="Configure os tipos, nomes e aliases de importação"
        backTo="Cadastros"
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Tag className="w-5 h-5" /> Tipos Cadastrados</CardTitle>
          <div className="flex gap-2">
            {tipos.length === 0 && (
              <Button variant="outline" onClick={seedPadrao} className="text-blue-600 border-blue-300 hover:bg-blue-50">
                Criar Padrões
              </Button>
            )}
            <Button onClick={() => { setEditando(null); setModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 gap-2">
              <Plus className="w-4 h-4" /> Novo Tipo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
          ) : tipos.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Tag className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">Nenhum tipo cadastrado</p>
              <p className="text-sm mt-1">Clique em "Criar Padrões" para criar os tipos padrão do sistema.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tipos.map((tipo) => (
                <div key={tipo.id} className="flex items-start justify-between p-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-semibold text-slate-900">{tipo.nome}</span>
                      <Badge variant="outline" className="font-mono text-xs">{tipo.slug}</Badge>
                      {!tipo.ativo && <Badge variant="secondary" className="text-xs">Inativo</Badge>}
                    </div>
                    {tipo.aliases_importacao?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <span className="text-xs text-slate-500 mr-1">Aliases:</span>
                        {tipo.aliases_importacao.map((a, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{a}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button variant="ghost" size="icon" onClick={() => { setEditando(tipo); setModalOpen(true); }}>
                      <Pencil className="w-4 h-4 text-slate-500" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeletandoId(tipo.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <FormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditando(null); }}
        tipo={editando}
        empresaId={empresaId}
      />

      <AlertDialog open={!!deletandoId} onOpenChange={() => setDeletandoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover tipo?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deletandoId)} className="bg-red-600 hover:bg-red-700">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}