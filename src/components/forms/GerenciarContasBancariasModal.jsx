import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, Edit2, Building2, Upload, Image } from 'lucide-react';
import { toast } from 'sonner';

export default function GerenciarContasBancariasModal({ open, onOpenChange, empresaId }) {
  const [newConta, setNewConta] = useState({
    codigo_banco: '',
    nome_banco: '',
    natureza: 'juridica',
    cpf_cnpj_titular: '',
    nome_titular: '',
  });
  const [editingConta, setEditingConta] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(null);

  const queryClient = useQueryClient();

  const { data: contas = [] } = useQuery({
    queryKey: ['contas-bancarias', empresaId],
    queryFn: async () => {
      if (!empresaId) {
        return await base44.entities.ContaBancaria.filter({ ativo: true }, 'ordem');
      }
      return await base44.entities.ContaBancaria.filter({ empresa_id: empresaId, ativo: true }, 'ordem');
    },
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.ContaBancaria.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['contas-bancarias']);
      toast.success('Conta bancária criada!');
      setNewConta({
        codigo_banco: '',
        nome_banco: '',
        natureza: 'juridica',
        cpf_cnpj_titular: '',
        nome_titular: '',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.ContaBancaria.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['contas-bancarias']);
      toast.success('Conta atualizada!');
      setEditingConta(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.ContaBancaria.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['contas-bancarias']);
      toast.success('Conta excluída!');
    },
  });

  const toggleAtivoMutation = useMutation({
    mutationFn: async ({ id, ativo }) => {
      return await base44.entities.ContaBancaria.update(id, { ativo });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['contas-bancarias']);
    },
  });

  const handleAddConta = () => {
    if (!newConta.codigo_banco || !newConta.nome_banco || !newConta.cpf_cnpj_titular || !newConta.nome_titular) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    createMutation.mutate({
      ...newConta,
      empresa_id: empresaId,
    });
  };

  const handleUploadLogo = async (contaId, file) => {
    try {
      setUploadingLogo(contaId);
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await updateMutation.mutateAsync({
        id: contaId,
        data: { logo_url: file_url },
      });
      toast.success('Logo atualizada!');
    } catch (error) {
      toast.error('Erro ao fazer upload da logo');
    } finally {
      setUploadingLogo(null);
    }
  };

  const handleDelete = (id) => {
    if (confirm('Excluir esta conta bancária?')) {
      deleteMutation.mutate(id);
    }
  };

  const formatCpfCnpj = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else {
      return numbers.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Contas Bancárias</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="lista" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="lista">Contas Cadastradas</TabsTrigger>
            <TabsTrigger value="nova">Nova Conta</TabsTrigger>
          </TabsList>

          <TabsContent value="nova" className="space-y-4">
            {/* Form: Nova Conta */}
            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Adicionar Nova Conta
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Código do Banco *</Label>
                  <Input
                    placeholder="Ex: 237"
                    value={newConta.codigo_banco}
                    onChange={(e) => setNewConta({ ...newConta, codigo_banco: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Nome do Banco *</Label>
                  <Input
                    placeholder="Ex: Bradesco"
                    value={newConta.nome_banco}
                    onChange={(e) => setNewConta({ ...newConta, nome_banco: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Natureza da Conta *</Label>
                  <Select
                    value={newConta.natureza}
                    onValueChange={(v) => setNewConta({ ...newConta, natureza: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="juridica">Jurídica</SelectItem>
                      <SelectItem value="fisica">Física</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>CPF/CNPJ do Titular *</Label>
                  <Input
                    placeholder="000.000.000-00"
                    value={newConta.cpf_cnpj_titular}
                    onChange={(e) => setNewConta({ 
                      ...newConta, 
                      cpf_cnpj_titular: formatCpfCnpj(e.target.value) 
                    })}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Nome do Titular *</Label>
                  <Input
                    placeholder="Nome completo do titular"
                    value={newConta.nome_titular}
                    onChange={(e) => setNewConta({ ...newConta, nome_titular: e.target.value })}
                  />
                </div>
              </div>
              <Button onClick={handleAddConta} className="mt-3 w-full" disabled={createMutation.isPending}>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Conta
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="lista" className="space-y-4">
            {/* Lista de Contas */}
            <div className="space-y-3">
              {contas.length === 0 ? (
                <Card className="p-8 text-center text-slate-500">
                  <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhuma conta bancária cadastrada</p>
                </Card>
              ) : (
                contas.map((conta) => (
                  <Card key={conta.id} className="p-4">
                    {editingConta?.id === conta.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Código do Banco</Label>
                            <Input
                              value={editingConta.codigo_banco}
                              onChange={(e) => setEditingConta({ ...editingConta, codigo_banco: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Nome do Banco</Label>
                            <Input
                              value={editingConta.nome_banco}
                              onChange={(e) => setEditingConta({ ...editingConta, nome_banco: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Natureza</Label>
                            <Select
                              value={editingConta.natureza}
                              onValueChange={(v) => setEditingConta({ ...editingConta, natureza: v })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="juridica">Jurídica</SelectItem>
                                <SelectItem value="fisica">Física</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>CPF/CNPJ do Titular</Label>
                            <Input
                              value={editingConta.cpf_cnpj_titular}
                              onChange={(e) => setEditingConta({ 
                                ...editingConta, 
                                cpf_cnpj_titular: formatCpfCnpj(e.target.value) 
                              })}
                            />
                          </div>
                          <div className="col-span-2">
                            <Label>Nome do Titular</Label>
                            <Input
                              value={editingConta.nome_titular}
                              onChange={(e) => setEditingConta({ ...editingConta, nome_titular: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => updateMutation.mutate({ id: editingConta.id, data: editingConta })}
                          >
                            Salvar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingConta(null)}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-4">
                        {/* Logo */}
                        <div className="relative">
                          {conta.logo_url ? (
                            <img
                              src={conta.logo_url}
                              alt={conta.nome_banco}
                              className="w-16 h-16 rounded-full object-cover border-2 border-slate-200"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-slate-100 border-2 border-slate-200 rounded-full flex items-center justify-center">
                              <Building2 className="w-8 h-8 text-slate-400" />
                            </div>
                          )}
                          <label className="absolute -bottom-1 -right-1 cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadLogo(conta.id, file);
                                e.target.value = '';
                              }}
                              disabled={uploadingLogo === conta.id}
                            />
                            <div className="bg-blue-600 text-white p-1.5 rounded-full hover:bg-blue-700 transition-colors shadow-lg">
                              {uploadingLogo === conta.id ? (
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Image className="w-3 h-3" />
                              )}
                            </div>
                          </label>
                        </div>

                        {/* Info */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{conta.codigo_banco} - {conta.nome_banco}</h4>
                            <span className="text-xs px-2 py-1 bg-slate-100 rounded capitalize">
                              {conta.natureza}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 mt-1">
                            Titular: {conta.nome_titular}
                          </p>
                          <p className="text-sm text-slate-500">
                            {conta.cpf_cnpj_titular}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => setEditingConta(conta)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="destructive"
                            onClick={() => handleDelete(conta.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}