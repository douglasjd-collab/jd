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
import { TrendingUp, Search, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import moment from 'moment';

export default function LancamentoReceitas() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    descricao: '',
    categoria: 'Bônus',
    valor: '',
    data: moment().format('YYYY-MM-DD'),
    origem: '',
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

  const { data: receitas = [], isLoading } = useQuery({
    queryKey: ['receitas'],
    queryFn: async () => {
      return await base44.entities.Receita.filter({});
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.Receita.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['receitas']);
      toast.success('Receita lançada com sucesso!');
      setModalOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.Receita.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['receitas']);
      toast.success('Receita excluída!');
    },
  });

  const resetForm = () => {
    setFormData({
      descricao: '',
      categoria: 'Bônus',
      valor: '',
      data: moment().format('YYYY-MM-DD'),
      origem: '',
      observacao: '',
    });
  };

  const handleSubmit = () => {
    if (!formData.descricao || !formData.valor) {
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
      origem: formData.origem,
      observacao: formData.observacao,
      usuario_id: user.id,
      usuario_nome: user.nome || user.full_name,
    });
  };

  const handleExcluir = (id) => {
    if (confirm('Excluir esta receita?')) {
      deleteMutation.mutate(id);
    }
  };

  const filtered = receitas.filter((r) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return r.descricao?.toLowerCase().includes(term) || r.origem?.toLowerCase().includes(term);
    }
    return true;
  });

  const totalReceitas = filtered.reduce((acc, r) => acc + (r.valor || 0), 0);

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
        title="Lançamento de Receitas"
        subtitle="Receitas que não são comissões (bônus, repasses, ajustes)"
        actionLabel="Nova Receita"
        onAction={() => setModalOpen(true)}
      />

      {/* Stats */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Total de Receitas</p>
            <p className="text-3xl font-bold text-green-600">
              {totalReceitas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
          <TrendingUp className="w-12 h-12 text-green-600" />
        </div>
      </Card>

      {/* Search */}
      <Card className="p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar receita..."
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
                <th className="text-left p-4 font-semibold text-slate-700">Origem</th>
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
                    Nenhuma receita encontrada
                  </td>
                </tr>
              ) : (
                filtered.map((receita) => (
                  <tr key={receita.id} className="border-b hover:bg-slate-50">
                    <td className="p-4">{moment(receita.data).format('DD/MM/YYYY')}</td>
                    <td className="p-4">{receita.descricao}</td>
                    <td className="p-4 text-sm text-slate-600">{receita.categoria}</td>
                    <td className="p-4 text-sm text-slate-600">{receita.origem || '-'}</td>
                    <td className="p-4 font-semibold text-green-600">
                      {(receita.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="p-4 text-sm">{receita.usuario_nome}</td>
                    <td className="p-4">
                      {['master', 'super_admin', 'admin'].includes(user?.perfil) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleExcluir(receita.id)}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Receita</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Descrição *</Label>
              <Input
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                placeholder="Ex: Bônus de produtividade"
              />
            </div>
            <div>
              <Label>Categoria *</Label>
              <Select
                value={formData.categoria}
                onValueChange={(v) => setFormData({ ...formData, categoria: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bônus">Bônus</SelectItem>
                  <SelectItem value="Repasse">Repasse</SelectItem>
                  <SelectItem value="Ajuste">Ajuste</SelectItem>
                  <SelectItem value="Outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor *</Label>
              <Input
                value={formData.valor}
                onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                placeholder="Ex: 500,00"
              />
            </div>
            <div>
              <Label>Data *</Label>
              <Input
                type="date"
                value={formData.data}
                onChange={(e) => setFormData({ ...formData, data: e.target.value })}
              />
            </div>
            <div>
              <Label>Origem</Label>
              <Input
                value={formData.origem}
                onChange={(e) => setFormData({ ...formData, origem: e.target.value })}
                placeholder="Ex: Canopus"
              />
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea
                value={formData.observacao}
                onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>Lançar Receita</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}