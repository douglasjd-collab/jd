import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/ui/PageHeader';
import { Search, DollarSign, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import moment from 'moment';

export default function ComissoesPagar() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [pagarModal, setPagarModal] = useState(false);
  const [selectedComissao, setSelectedComissao] = useState(null);
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const [observacao, setObservacao] = useState('');
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
        setUser({ ...me, perfil: colab.perfil, empresa_id: colab.empresa_id });
      }
    }
  };

  const { data: comissoes = [], isLoading } = useQuery({
    queryKey: ['comissoes-pagar'],
    queryFn: async () => {
      const filter = { tipo_comissao: 'parcela', tipo: 'pagar' };
      const all = await base44.entities.Comissao.filter(filter);
      return all;
    },
    enabled: !!user,
  });

  const pagarMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.Comissao.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['comissoes-pagar']);
      toast.success('Comissão paga com sucesso!');
      setPagarModal(false);
      setSelectedComissao(null);
      setFormaPagamento('PIX');
      setObservacao('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.Comissao.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['comissoes-pagar']);
      toast.success('Comissão excluída com sucesso!');
    },
  });

  const handlePagar = () => {
    if (!selectedComissao) return;
    pagarMutation.mutate({
      id: selectedComissao.id,
      data: {
        status: 'paga',
        data_pagamento: moment().format('YYYY-MM-DD'),
        forma_pagamento: formaPagamento,
        observacoes: observacao,
      },
    });
  };

  const handleExcluir = (comissao) => {
    if (!['master', 'super_admin', 'admin'].includes(user?.perfil)) {
      toast.error('Apenas administradores podem excluir comissões');
      return;
    }
    if (confirm(`Excluir comissão de ${comissao.usuario_nome}?`)) {
      deleteMutation.mutate(comissao.id);
    }
  };

  const filtered = comissoes.filter((c) => {
    // Filtro por vendedor (se não for admin/gerente)
    if (user?.perfil === 'vendedor' && c.usuario_id !== user?.id) {
      return false;
    }

    // Filtro por status
    if (statusFilter !== 'todos' && c.status !== statusFilter) {
      return false;
    }

    // Filtro por busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        c.usuario_nome?.toLowerCase().includes(term) ||
        c.venda_id?.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const totalAPagar = filtered
    .filter((c) => c.status === 'prevista' || c.status === 'confirmada')
    .reduce((acc, c) => acc + (c.valor || 0), 0);

  const totalPago = filtered
    .filter((c) => c.status === 'paga')
    .reduce((acc, c) => acc + (c.valor || 0), 0);

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(user?.perfil);

  if (!user) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Comissões a Pagar"
        subtitle="Gerenciar comissões de vendedores"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total a Pagar</p>
              <p className="text-2xl font-bold text-orange-600">
                {totalAPagar.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <DollarSign className="w-10 h-10 text-orange-600" />
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Pago</p>
              <p className="text-2xl font-bold text-green-600">
                {totalPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por vendedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="prevista">A Pagar</SelectItem>
              <SelectItem value="confirmada">Confirmada</SelectItem>
              <SelectItem value="paga">Paga</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-4 font-semibold text-slate-700">Vendedor</th>
                <th className="text-left p-4 font-semibold text-slate-700">Grupo/Cota/Parcela</th>
                <th className="text-left p-4 font-semibold text-slate-700">Valor</th>
                <th className="text-left p-4 font-semibold text-slate-700">Data Recebimento</th>
                <th className="text-left p-4 font-semibold text-slate-700">Status</th>
                <th className="text-left p-4 font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Nenhuma comissão encontrada
                  </td>
                </tr>
              ) : (
                filtered.map((comissao) => (
                  <tr key={comissao.id} className="border-b hover:bg-slate-50">
                    <td className="p-4">{comissao.usuario_nome}</td>
                    <td className="p-4 text-sm text-slate-600">
                      {/* Buscar grupo/cota/parcela da venda */}
                      Venda: {comissao.venda_id?.slice(0, 8)}...
                    </td>
                    <td className="p-4 font-semibold">
                      {(comissao.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="p-4 text-sm">
                      {comissao.data_recebimento ? moment(comissao.data_recebimento).format('DD/MM/YYYY') : '-'}
                    </td>
                    <td className="p-4">
                      {comissao.status === 'paga' ? (
                        <Badge className="bg-green-100 text-green-800">Paga</Badge>
                      ) : (
                        <Badge className="bg-orange-100 text-orange-800">A Pagar</Badge>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        {comissao.status !== 'paga' && isAdmin && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedComissao(comissao);
                              setPagarModal(true);
                            }}
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Pagar
                          </Button>
                        )}
                        {['master', 'super_admin', 'admin'].includes(user?.perfil) && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleExcluir(comissao)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Pagar */}
      <Dialog open={pagarModal} onOpenChange={setPagarModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagar Comissão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Vendedor</Label>
              <Input value={selectedComissao?.usuario_nome || ''} disabled />
            </div>
            <div>
              <Label>Valor</Label>
              <Input
                value={(selectedComissao?.valor || 0).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
                disabled
              />
            </div>
            <div>
              <Label>Forma de Pagamento *</Label>
              <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="Transferência">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagarModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handlePagar}>Confirmar Pagamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}