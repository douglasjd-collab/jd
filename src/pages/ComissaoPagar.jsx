import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, DollarSign, Search, CheckCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';

export default function ComissaoPagar() {
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedComissao, setSelectedComissao] = useState(null);
  const [formData, setFormData] = useState({
    data_pagamento: format(new Date(), 'yyyy-MM-dd'),
    observacoes: ''
  });

  const queryClient = useQueryClient();

  // Buscar comissões confirmadas (recebidas) mas ainda não pagas aos vendedores
  const { data: comissoes = [], isLoading } = useQuery({
    queryKey: ['comissoes-a-pagar'],
    queryFn: () => base44.entities.Comissao.filter({ 
      status: 'confirmada',
      tipo: 'receber'
    }, '-created_date', 200),
  });

  const { data: vendas = [] } = useQuery({
    queryKey: ['vendas'],
    queryFn: () => base44.entities.Venda.list(),
  });

  const { data: administradoras = [] } = useQuery({
    queryKey: ['administradoras'],
    queryFn: () => base44.entities.Administradora.list(),
  });

  const pagarComissaoMutation = useMutation({
    mutationFn: async ({ comissaoId, data }) => {
      // Atualizar status da comissão para paga
      await base44.entities.Comissao.update(comissaoId, {
        status: 'paga',
        data_pagamento: data.data_pagamento,
        observacoes: data.observacoes
      });

      // Auditoria
      const user = await base44.auth.me();
      await base44.entities.LogAuditoria.create({
        usuario_id: user.id,
        usuario_nome: user.full_name,
        acao: 'Pagamento de comissão registrado',
        entidade: 'Comissao',
        entidade_id: comissaoId,
        dados_novos: JSON.stringify(data),
        tipo: 'edicao'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comissoes-a-pagar'] });
      queryClient.invalidateQueries({ queryKey: ['comissoes-pagas'] });
      setFormOpen(false);
      setSelectedComissao(null);
      resetForm();
      toast.success('Pagamento registrado com sucesso!');
    },
  });

  const resetForm = () => {
    setFormData({
      data_pagamento: format(new Date(), 'yyyy-MM-dd'),
      observacoes: ''
    });
  };

  const handlePagar = () => {
    if (!selectedComissao) {
      toast.error('Selecione uma comissão');
      return;
    }
    if (!formData.data_pagamento) {
      toast.error('Informe a data de pagamento');
      return;
    }

    pagarComissaoMutation.mutate({
      comissaoId: selectedComissao.id,
      data: formData
    });
  };

  const getVendaInfo = (vendaId) => {
    const venda = vendas.find(v => v.id === vendaId);
    if (!venda) return '-';
    return `${venda.grupo}/${venda.cota} - ${venda.cliente_nome}`;
  };

  const getAdminNome = (adminId) => {
    const admin = administradoras.find(a => a.id === adminId);
    return admin?.nome_fantasia || admin?.razao_social || '-';
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const filteredComissoes = comissoes.filter(c => {
    const matchSearch = 
      c.usuario_nome?.toLowerCase().includes(search.toLowerCase()) ||
      getVendaInfo(c.venda_id).toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const columns = [
    {
      header: 'Data Recebimento',
      cell: (row) => format(new Date(row.data_recebimento || row.created_date), 'dd/MM/yyyy')
    },
    {
      header: 'Vendedor',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.usuario_nome}</p>
          <p className="text-sm text-slate-500 capitalize">{row.usuario_perfil}</p>
        </div>
      )
    },
    {
      header: 'Venda',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{getVendaInfo(row.venda_id)}</p>
          <p className="text-sm text-slate-500">{getAdminNome(row.administradora_id)}</p>
        </div>
      )
    },
    {
      header: 'Valor',
      cell: (row) => (
        <span className="font-semibold text-emerald-600">
          {formatCurrency(row.valor)}
        </span>
      )
    },
    {
      header: '',
      className: 'w-40',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.open(createPageUrl(`VendaDetalhes?id=${row.venda_id}`), '_blank')}
            title="Ver venda"
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setSelectedComissao(row);
              resetForm();
              setFormOpen(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Pagar
          </Button>
        </div>
      )
    }
  ];

  // Totalizadores
  const totalAPagar = filteredComissoes.reduce((acc, c) => acc + parseFloat(c.valor), 0);
  const totalPorVendedor = filteredComissoes.reduce((acc, c) => {
    const nome = c.usuario_nome;
    if (!acc[nome]) acc[nome] = 0;
    acc[nome] += parseFloat(c.valor);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comissão a Pagar"
        subtitle="Gerencie os pagamentos de comissões aos vendedores"
      />

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <p className="text-emerald-100 text-sm mb-1">Total a Pagar</p>
          <p className="text-3xl font-bold">{formatCurrency(totalAPagar)}</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <p className="text-blue-100 text-sm mb-1">Comissões Pendentes</p>
          <p className="text-3xl font-bold">{filteredComissoes.length}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white">
          <p className="text-purple-100 text-sm mb-1">Vendedores</p>
          <p className="text-3xl font-bold">{Object.keys(totalPorVendedor).length}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por vendedor ou venda..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredComissoes}
        isLoading={isLoading}
        emptyMessage="Nenhuma comissão a pagar"
      />

      {/* Modal de Pagamento */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento de Comissão</DialogTitle>
          </DialogHeader>
          
          {selectedComissao && (
            <div className="space-y-4">
              {/* Info da comissão */}
              <div className="p-4 bg-slate-50 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Vendedor:</span>
                  <span className="font-medium">{selectedComissao.usuario_nome}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Venda:</span>
                  <span className="font-medium">{getVendaInfo(selectedComissao.venda_id)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Administradora:</span>
                  <span className="font-medium">{getAdminNome(selectedComissao.administradora_id)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Data Recebimento:</span>
                  <span className="font-medium">
                    {format(new Date(selectedComissao.data_recebimento || selectedComissao.created_date), 'dd/MM/yyyy')}
                  </span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-slate-600">Valor a Pagar:</span>
                  <span className="font-bold text-emerald-600 text-lg">{formatCurrency(selectedComissao.valor)}</span>
                </div>
              </div>

              {/* Formulário */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="data_pagamento">Data de Pagamento *</Label>
                  <Input
                    id="data_pagamento"
                    type="date"
                    value={formData.data_pagamento}
                    onChange={(e) => setFormData({ ...formData, data_pagamento: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea
                    id="observacoes"
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    placeholder="Informações sobre o pagamento..."
                    rows={3}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handlePagar}
                  disabled={pagarComissaoMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {pagarComissaoMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Confirmar Pagamento
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}