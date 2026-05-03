import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, Plus, Pencil, Trash2, Building2, Search, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

export default function BancosFinanciamento({ user }) {
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({ codigo: '', nome: '', logo_url: '' });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);

  const queryClient = useQueryClient();
  const empresaId = user?.empresa_id;

  const { data: bancos = [], isLoading } = useQuery({
    queryKey: ['bancos', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Banco.filter({ empresa_id: empresaId }, 'nome')
  });

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData(prev => ({ ...prev, logo_url: file_url }));
    } catch {
      toast.error('Erro ao fazer upload da logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const criarMutation = useMutation({
    mutationFn: (dados) => base44.entities.Banco.create({ empresa_id: empresaId, codigo: dados.codigo, nome: dados.nome, logo_url: dados.logo_url || '', ativo: true }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['bancos', empresaId] }); toast.success('Banco cadastrado!'); setShowModal(false); resetForm(); },
    onError: (e) => toast.error('Erro: ' + e.message)
  });

  const editarMutation = useMutation({
    mutationFn: ({ id, dados }) => base44.entities.Banco.update(id, { codigo: dados.codigo, nome: dados.nome, logo_url: dados.logo_url || '' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['bancos', empresaId] }); toast.success('Banco atualizado!'); setShowModal(false); resetForm(); },
    onError: (e) => toast.error('Erro: ' + e.message)
  });

  const deletarMutation = useMutation({
    mutationFn: (id) => base44.entities.Banco.update(id, { ativo: false }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['bancos', empresaId] }); toast.success('Banco removido!'); setDeleteId(null); },
    onError: (e) => { toast.error('Erro: ' + e.message); setDeleteId(null); }
  });

  const resetForm = () => { setFormData({ codigo: '', nome: '', logo_url: '' }); setEditando(null); };

  const handleNovo = () => { resetForm(); setShowModal(true); };

  const handleEditar = (banco) => {
    setEditando(banco);
    setFormData({ codigo: banco.codigo || '', nome: banco.nome, logo_url: banco.logo_url || '' });
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editando) editarMutation.mutate({ id: editando.id, dados: formData });
    else criarMutation.mutate(formData);
  };

  const bancosAtivos = bancos.filter(b => b.ativo);
  const bancosFiltrados = bancosAtivos.filter(b =>
    b.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.codigo && b.codigo.includes(searchTerm))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Bancos</h2>
          <p className="text-sm text-slate-500">Gerencie os bancos disponíveis para financiamento</p>
        </div>
        <Button onClick={handleNovo} className="gap-2 bg-[#10353C] hover:bg-[#10353C]/90">
          <Plus className="w-4 h-4" /> Novo Banco
        </Button>
      </div>

      {bancosAtivos.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Buscar banco..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : bancosAtivos.length === 0 ? (
        <Card className="p-12 text-center">
          <Building2 className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Nenhum banco cadastrado</h3>
          <p className="text-slate-600 mb-6">Cadastre o primeiro banco para usar nas propostas</p>
          <Button onClick={handleNovo}><Plus className="w-4 h-4 mr-2" />Cadastrar Banco</Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {bancosFiltrados.map(banco => (
            <Card key={banco.id} className="hover:shadow-md transition-shadow">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-200">
                    {banco.logo_url ? (
                      <img src={banco.logo_url} alt={banco.nome} className="w-full h-full object-contain p-1" />
                    ) : (
                      <Building2 className="w-5 h-5 text-green-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900">{banco.nome}</h3>
                    {banco.codigo && <p className="text-sm text-slate-500 mt-0.5">Código: {banco.codigo}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleEditar(banco)}>
                    <Pencil className="w-4 h-4 mr-1" /> Editar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDeleteId(banco.id)} className="text-red-600 hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Cadastro/Edição */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Banco' : 'Novo Banco'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Logo do Banco</Label>
              <div className="flex items-center gap-3 mt-1">
                <div className="w-14 h-14 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0 bg-slate-50">
                  {formData.logo_url ? (
                    <img src={formData.logo_url} alt="logo" className="w-full h-full object-contain p-1" />
                  ) : (
                    <Building2 className="w-6 h-6 text-slate-300" />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  <Button type="button" variant="outline" size="sm" className="gap-2 w-full" disabled={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
                    {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploadingLogo ? 'Enviando...' : 'Enviar Logo'}
                  </Button>
                  {formData.logo_url && (
                    <button type="button" onClick={() => setFormData(p => ({ ...p, logo_url: '' }))} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                      <X className="w-3 h-3" /> Remover logo
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <Label>Código do Banco</Label>
              <Input value={formData.codigo} onChange={e => setFormData({ ...formData, codigo: e.target.value })} placeholder="Ex: 001, 033, 237..." />
            </div>
            <div>
              <Label>Nome do Banco *</Label>
              <Input value={formData.nome} onChange={e => setFormData({ ...formData, nome: e.target.value })} placeholder="Ex: Banco do Brasil, Santander..." required />
            </div>
            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button type="submit" disabled={criarMutation.isPending || editarMutation.isPending}>
                {(criarMutation.isPending || editarMutation.isPending) ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmação exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja remover este banco?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletarMutation.mutate(deleteId)} className="bg-red-600 hover:bg-red-700">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}