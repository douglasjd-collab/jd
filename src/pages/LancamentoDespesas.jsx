import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { TrendingDown, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'react-hot-toast';
import moment from 'moment';

export default function LancamentoDespesas() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    descricao: '',
    categoria: 'Almoço',
    valor: '',
    data: moment().format('YYYY-MM-DD'),
    responsavel_id: '',
    responsavel_nome: '',
    comprovante_url: '',
    observacao: '',
  });

  const queryClient = useQueryClient();

  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    if (me.role === 'super_admin') {
      setUser({ ...me, perfil: 'super_admin', empresa_id: null });
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) {
        const colab = colabs[0];
        setUser({ ...me, perfil: colab.perfil, empresa_id: colab.empresa_id, nome: colab.nome });
      }
    }
  };

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-despesas'],
    queryFn: async () => {
      return await base44.entities.Colaborador.filter({ status: 'ativo' });
    },
    enabled: !!user,
  });

  const { data: despesas = [], isLoading } = useQuery({
    queryKey: ['despesas'],
    queryFn: async () => {
      return await base44.entities.Despesa.filter({});
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.Despesa.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['despesas']);
      toast.success('Despesa lançada com sucesso!');
      setModalOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.Despesa.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['despesas']);
      toast.success('Despesa excluída!');
    },
  });

  const resetForm = () => {
    setFormData({
      descricao: '',
      categoria: 'Almoço',
      valor: '',
      data: moment().format('YYYY-MM-DD'),
      responsavel_id: '',
      responsavel_nome: '',
      comprovante_url: '',
      observacao: '',
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, comprovante_url: file_url });
      toast.success('Comprovante enviado!');
    } catch (error) {
      toast.error('Erro ao enviar comprovante');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!formData.descricao || !formData.valor || !formData.responsavel_id) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    const valor = parseFloat(formData.valor.replace(/[^\d,.-]/g, '').replace(',', '.'));
    if (isNaN(valor) || valor <= 0) {
      toast.error('Valor inválido');
      return;
    }

    createMutation.mutate({
      empresa_id: user.empresa_id,
      descricao: formData.descricao,
      categoria: formData.categoria,
      valor,
      data: formData.data,
      responsavel_id: formData.responsavel_id,
      responsavel_nome: formData.responsavel_nome,
      comprovante_url: formData.comprovante_url,
      observacao: formData.observacao,
      usuario_id: user.id,
      usuario_nome: user.nome || user.full_name,
    });
  };

  const handleExcluir = (id) => {
    if (confirm('Excluir esta despesa?')) {
      deleteMutation.mutate(id);
    }
  };

  const filtered = despesas.filter((d) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        d.descricao?.toLowerCase().includes(term) ||
        d.categoria?.toLowerCase().includes(term) ||
        d.responsavel_nome?.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const totalDespesas = filtered.reduce((acc, d) => acc + (d.valor || 0), 0);

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(user?.perfil);

  if (!user || !isAdmin) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <p className="text-slate-600">Acesso restrito a administradores e gerentes</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Lançamento de Despesas"
        subtitle="Registrar despesas operacionais"
        actionLabel="Nova Despesa"
        onAction={() => setModalOpen(true)}
      />

      {/* Stats */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Total de Despesas</p>
            <p className="text-3xl font-bold text-red-600">
              {totalDespesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
          <TrendingDown className="w-12 h-12 text-red-600" />
        </div>
      </Card>

      {/* Search */}
      <Card className="p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar despesa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-4 font-semibold text-slate-700">Data</th>
                <th className="text-left p-4 font-semibold text-slate-700">Descrição</th>
                <th className="text-left p-4 font-semibold text-slate-700">Categoria</th>
                <th className="text-left p-4 font-semibold text-slate-700">Responsável</th>
                <th className="text-left p-4 font-semibold text-slate-700">Valor</th>
                <th className="text-left p-4 font-semibold text-slate-700">Lançado por</th>
                <th className="text-left p-4 font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Nenhuma despesa encontrada
                  </td>
                </tr>
              ) : (
                filtered.map((despesa) => (
                  <tr key={despesa.id} className="border-b hover:bg-slate-50">
                    <td className="p-4">{moment(despesa.data).format('DD/MM/YYYY')}</td>
                    <td className="p-4">{despesa.descricao}</td>
                    <td className="p-4 text-sm text-slate-600">{despesa.categoria}</td>
                    <td className="p-4 text-sm">{despesa.responsavel_nome}</td>
                    <td className="p-4 font-semibold text-red-600">
                      {(despesa.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="p-4 text-sm">{despesa.usuario_nome}</td>
                    <td className="p-4">
                      {['master', 'super_admin', 'admin'].includes(user?.perfil) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleExcluir(despesa.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl bg-white">
          <DialogHeader className="border-b pb-6">
            <DialogTitle className="text-2xl font-bold">Nova despesa</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Valor Principal */}
            <Card className="p-6 bg-white border-2">
              <div className="space-y-3">
                <Label className="text-sm text-slate-600">Valor da despesa</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-red-400">R$</span>
                  <Input
                    value={formData.valor}
                    onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                    placeholder="0,00"
                    className="text-2xl font-bold bg-transparent border-none text-red-400 h-auto p-0 focus-visible:ring-0"
                  />
                  <span className="text-sm text-slate-400">BRL</span>
                </div>
              </div>
            </Card>

            {/* Informações Básicas */}
            <Card className="p-6 bg-white">
              <div className="space-y-4">
                <div>
                  <Label>Descrição *</Label>
                  <Input
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    placeholder="Ex: Almoço com cliente"
                    className="mt-1.5"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Categoria *</Label>
                    <Select
                      value={formData.categoria}
                      onValueChange={(v) => setFormData({ ...formData, categoria: v })}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Almoço">Almoço</SelectItem>
                        <SelectItem value="Reunião">Reunião</SelectItem>
                        <SelectItem value="Visita externa">Visita externa</SelectItem>
                        <SelectItem value="Adiantamento">Adiantamento</SelectItem>
                        <SelectItem value="Pagamento de salários">Pagamento de salários</SelectItem>
                        <SelectItem value="Combustível">Combustível</SelectItem>
                        <SelectItem value="Escritório">Escritório</SelectItem>
                        <SelectItem value="Marketing">Marketing</SelectItem>
                        <SelectItem value="Outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Data *</Label>
                    <Input
                      type="date"
                      value={formData.data}
                      onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                </div>

                <div>
                  <Label>Responsável *</Label>
                  <Select
                    value={formData.responsavel_id}
                    onValueChange={(v) => {
                      const colab = colaboradores.find((c) => c.id === v);
                      setFormData({
                        ...formData,
                        responsavel_id: v,
                        responsavel_nome: colab?.nome || '',
                      });
                    }}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Selecione o responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      {colaboradores.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>

            {/* Comprovante e Observações */}
            <Card className="p-6 bg-white">
              <div className="space-y-4">
                <div>
                  <Label>Comprovante (opcional)</Label>
                  <div className="flex gap-2 mt-1.5">
                    <Input type="file" onChange={handleFileUpload} disabled={uploading} />
                    {uploading && <span className="text-sm text-slate-500">Enviando...</span>}
                  </div>
                  {formData.comprovante_url && (
                    <p className="text-xs text-green-600 mt-2">✓ Comprovante enviado</p>
                  )}
                </div>

                <div>
                  <Label>Observação</Label>
                  <Textarea
                    value={formData.observacao}
                    onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
                    rows={3}
                    placeholder="Adicione observações sobre esta despesa..."
                    className="mt-1.5"
                  />
                </div>
              </div>
            </Card>
          </div>

          <DialogFooter className="border-t pt-6">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} className="bg-[#23BE84] hover:bg-[#1da570]">
              Lançar Despesa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}