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
import { Search, DollarSign, CheckCircle2, Eye } from 'lucide-react';
import { toast } from 'react-hot-toast';
import moment from 'moment';

export default function ComissoesPagar() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('a_pagar');
  const [mesFilter, setMesFilter] = useState('todos');
  const [pagarModal, setPagarModal] = useState(false);
  const [verRecebimentoModal, setVerRecebimentoModal] = useState(false);
  const [selectedComissao, setSelectedComissao] = useState(null);
  const [recebimentoDetalhes, setRecebimentoDetalhes] = useState(null);
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const [observacao, setObservacao] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingError, setEditingError] = useState('');
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
        setUser({ ...me, perfil: colab.perfil, empresa_id: colab.empresa_id, id: me.id });
      }
    }
  };

  // Sincronizar RecebimentoComissao -> ComissaoAPagar automaticamente
  const sincronizarComissoes = async () => {
    try {
      // Buscar todos os recebimentos
      const recebimentos = await base44.entities.RecebimentoComissao.filter({});
      
      // Buscar comissões a pagar existentes
      const comissoesExistentes = await base44.entities.ComissaoAPagar.filter({});
      const recebimentosJaProcessados = new Set(comissoesExistentes.map(c => c.recebimento_id));
      
      // Criar ComissaoAPagar para recebimentos que não têm
      const novosRegistros = recebimentos.filter(r => !recebimentosJaProcessados.has(r.id));
      
      // Atualizar registros existentes que não têm data_recebimento
      const registrosParaAtualizar = comissoesExistentes.filter(c => !c.data_recebimento);
      
      for (const comissao of registrosParaAtualizar) {
        const recebimento = recebimentos.find(r => r.id === comissao.recebimento_id);
        if (recebimento && recebimento.data_recebimento) {
          await base44.entities.ComissaoAPagar.update(comissao.id, {
            data_recebimento: recebimento.data_recebimento
          });
        }
      }
      
      for (const rec of novosRegistros) {
        const valorAPagar = rec.valor_recebido * (rec.percentual_comissao || 100) / 100;
        
        await base44.entities.ComissaoAPagar.create({
          empresa_id: rec.empresa_id,
          recebimento_id: rec.id,
          venda_id: rec.venda_id,
          cliente_id: rec.cliente_id,
          cliente_nome: rec.cliente_nome,
          vendedor_id: rec.vendedor_id,
          vendedor_nome: rec.vendedor_nome,
          administradora_id: rec.administradora_id,
          administradora_nome: rec.administradora_nome,
          grupo: rec.grupo,
          cota: rec.cota,
          contrato: rec.contrato,
          parcela_numero: rec.parcela_informada,
          data_recebimento: rec.data_recebimento,
          valor_recebido: rec.valor_recebido,
          percentual_comissao: rec.percentual_comissao || 100,
          valor_a_pagar: valorAPagar,
          status_pagamento: rec.status_pagamento || 'a_pagar'
        });
      }
      
      if (novosRegistros.length > 0 || registrosParaAtualizar.length > 0) {
        console.log(`${novosRegistros.length} novas comissões, ${registrosParaAtualizar.length} atualizadas`);
      }
    } catch (error) {
      console.error('Erro ao sincronizar comissões:', error);
    }
  };

  const { data: comissoes = [], isLoading } = useQuery({
    queryKey: ['comissoes-a-pagar'],
    queryFn: async () => {
      // Sincronizar antes de buscar
      await sincronizarComissoes();
      return await base44.entities.ComissaoAPagar.filter({});
    },
    enabled: !!user,
  });

  const updatePercentualMutation = useMutation({
    mutationFn: async ({ id, percentual }) => {
      const comissao = comissoes.find(c => c.id === id);
      const novoValor = (comissao.valor_recebido * percentual) / 100;
      return await base44.entities.ComissaoAPagar.update(id, {
        percentual_comissao: percentual,
        valor_a_pagar: novoValor
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['comissoes-a-pagar']);
      toast.success('Percentual atualizado!');
    },
  });

  const pagarMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.ComissaoAPagar.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['comissoes-a-pagar']);
      toast.success('Comissão paga com sucesso!');
      setPagarModal(false);
      setSelectedComissao(null);
      setFormaPagamento('PIX');
      setObservacao('');
    },
  });

  const handleVerRecebimento = async (comissao) => {
    if (comissao.recebimento_id) {
      try {
        const recebimentos = await base44.entities.RecebimentoComissao.filter({ id: comissao.recebimento_id });
        if (recebimentos.length > 0) {
          setRecebimentoDetalhes(recebimentos[0]);
          setVerRecebimentoModal(true);
        }
      } catch (e) {
        toast.error('Erro ao carregar recebimento');
      }
    }
  };

  const startEditing = (comissao) => {
    setEditingId(comissao.id);
    setEditingValue(String(comissao.percentual_comissao || 0));
    setEditingError('');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingValue('');
    setEditingError('');
  };

  const saveEditing = (comissaoId) => {
    const percentual = parseFloat(editingValue);
    if (isNaN(percentual) || percentual < 0 || percentual > 100) {
      setEditingError('Percentual inválido (0–100)');
      return;
    }
    updatePercentualMutation.mutate({ id: comissaoId, percentual });
    cancelEditing();
  };

  const handleKeyDown = (e, comissaoId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEditing(comissaoId);
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  const handlePagar = () => {
    if (!selectedComissao) return;
    pagarMutation.mutate({
      id: selectedComissao.id,
      data: {
        status_pagamento: 'paga',
        data_pagamento: moment().format('YYYY-MM-DD'),
        forma_pagamento: formaPagamento,
        observacao: observacao,
      },
    });
  };

  const filtered = comissoes.filter((c) => {
    // Filtro por vendedor (se vendedor, só vê suas comissões)
    if (user?.perfil === 'vendedor' && c.vendedor_id !== user?.id) {
      return false;
    }

    // Filtro por empresa
    if (user?.empresa_id && c.empresa_id !== user?.empresa_id) {
      return false;
    }

    // Filtro por status
    if (statusFilter !== 'todos' && c.status_pagamento !== statusFilter) {
      return false;
    }

    // Filtro por mês
    if (mesFilter !== 'todos' && c.data_recebimento) {
      const mes = moment(c.data_recebimento).format('YYYY-MM');
      if (mes !== mesFilter) return false;
    }

    // Filtro por busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        c.vendedor_nome?.toLowerCase().includes(term) ||
        c.cliente_nome?.toLowerCase().includes(term) ||
        c.grupo?.toLowerCase().includes(term) ||
        c.cota?.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const totalAPagar = filtered
    .filter((c) => c.status_pagamento === 'a_pagar')
    .reduce((acc, c) => acc + (c.valor_a_pagar || 0), 0);

  const totalPago = filtered
    .filter((c) => c.status_pagamento === 'paga')
    .reduce((acc, c) => acc + (c.valor_a_pagar || 0), 0);

  const mesesDisponiveis = [...new Set(comissoes.map((c) => 
    c.data_recebimento ? moment(c.data_recebimento).format('YYYY-MM') : null
  ).filter(Boolean))].sort().reverse();

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(user?.perfil);

  if (!user) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Comissões a Pagar"
        subtitle="Gerenciar pagamento de comissões aos vendedores"
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
              placeholder="Buscar por vendedor, cliente, grupo ou cota..."
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
              <SelectItem value="a_pagar">A Pagar</SelectItem>
              <SelectItem value="paga">Paga</SelectItem>
            </SelectContent>
          </Select>
          <Select value={mesFilter} onValueChange={setMesFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os meses</SelectItem>
              {mesesDisponiveis.map((mes) => (
                <SelectItem key={mes} value={mes}>
                  {moment(mes).format('MMMM/YYYY')}
                </SelectItem>
              ))}
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
                <th className="text-left p-4 font-semibold text-slate-700">Cliente</th>
                <th className="text-left p-4 font-semibold text-slate-700">Grupo/Cota</th>
                <th className="text-left p-4 font-semibold text-slate-700">Parcela</th>
                <th className="text-left p-4 font-semibold text-slate-700">Data Rec.</th>
                <th className="text-left p-4 font-semibold text-slate-700">Valor Recebido</th>
                <th className="text-left p-4 font-semibold text-slate-700">% Comissão</th>
                <th className="text-left p-4 font-semibold text-slate-700">Valor a Pagar</th>
                <th className="text-left p-4 font-semibold text-slate-700">Status</th>
                <th className="text-left p-4 font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500">
                    Nenhuma comissão encontrada
                  </td>
                </tr>
              ) : (
                filtered.map((comissao) => (
                  <tr key={comissao.id} className="border-b hover:bg-slate-50">
                    <td className="p-4">{comissao.vendedor_nome}</td>
                    <td className="p-4 text-sm">{comissao.cliente_nome || '-'}</td>
                    <td className="p-4 text-sm">
                      {comissao.grupo && comissao.cota ? `${comissao.grupo}/${comissao.cota}` : comissao.contrato || '-'}
                    </td>
                    <td className="p-4 text-sm">
                      {comissao.parcela_numero ? `${comissao.parcela_numero}º` : '-'}
                    </td>
                    <td className="p-4 text-sm">
                      {comissao.data_recebimento && moment(comissao.data_recebimento).isValid() 
                        ? moment(comissao.data_recebimento).format('DD/MM/YYYY') 
                        : '-'}
                    </td>
                    <td className="p-4 font-semibold text-blue-600">
                      {(comissao.valor_recebido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="p-4">
                      {editingId === comissao.id ? (
                        <div className="flex flex-col gap-1">
                          <div className={`inline-flex items-center bg-white rounded-md border ${editingError ? 'border-red-500' : 'border-slate-300'} px-2 py-1`}>
                            <Input
                              type="number"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onBlur={() => saveEditing(comissao.id)}
                              onKeyDown={(e) => handleKeyDown(e, comissao.id)}
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              className="w-12 h-6 text-sm border-0 p-0 focus-visible:ring-0"
                              min="0"
                              max="100"
                            />
                            <span className="text-sm font-medium text-slate-600 ml-1">%</span>
                          </div>
                          {editingError && (
                            <span className="text-xs text-red-600">{editingError}</span>
                          )}
                        </div>
                      ) : (
                        <div 
                          className={`inline-flex items-center rounded-md border px-2 py-1 min-w-[60px] ${
                            comissao.status_pagamento === 'a_pagar' && isAdmin
                              ? 'bg-white border-slate-200 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors'
                              : 'bg-slate-100 border-slate-200 cursor-default'
                          }`}
                          onClick={() => comissao.status_pagamento === 'a_pagar' && isAdmin && startEditing(comissao)}
                          title={comissao.status_pagamento === 'a_pagar' && isAdmin ? 'Clique para editar o percentual de comissão' : ''}
                        >
                          <span className="font-medium text-sm">{comissao.percentual_comissao || 0}%</span>
                        </div>
                      )}
                    </td>
                    <td className="p-4 font-bold text-green-600">
                      {(comissao.valor_a_pagar || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="p-4">
                      {comissao.status_pagamento === 'paga' ? (
                        <Badge className="bg-green-100 text-green-800">Paga</Badge>
                      ) : (
                        <Badge className="bg-orange-100 text-orange-800">A Pagar</Badge>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleVerRecebimento(comissao)}
                          title="Ver recebimento original"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {comissao.status_pagamento === 'a_pagar' && isAdmin && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedComissao(comissao);
                              setPagarModal(true);
                            }}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Pagar
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

      {/* Modal Ver Recebimento */}
      <Dialog open={verRecebimentoModal} onOpenChange={setVerRecebimentoModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Recebimento Original</DialogTitle>
          </DialogHeader>
          {recebimentoDetalhes && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-500">Cliente</Label>
                  <p className="font-medium">{recebimentoDetalhes.cliente_nome}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Vendedor</Label>
                  <p className="font-medium">{recebimentoDetalhes.vendedor_nome}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Administradora</Label>
                  <p className="font-medium">{recebimentoDetalhes.administradora_nome}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Grupo/Cota</Label>
                  <p className="font-medium">
                    {recebimentoDetalhes.grupo}/{recebimentoDetalhes.cota}
                  </p>
                </div>
                <div>
                  <Label className="text-slate-500">Data Recebimento</Label>
                  <p className="font-medium">
                    {recebimentoDetalhes.data_recebimento && moment(recebimentoDetalhes.data_recebimento).isValid()
                      ? moment(recebimentoDetalhes.data_recebimento).format('DD/MM/YYYY')
                      : '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-slate-500">Valor Recebido</Label>
                  <p className="font-bold text-blue-600">
                    {(recebimentoDetalhes.valor_recebido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
                <div>
                  <Label className="text-slate-500">Parcela</Label>
                  <p className="font-medium">{recebimentoDetalhes.parcela_informada || '-'}º</p>
                </div>
                <div>
                  <Label className="text-slate-500">Status</Label>
                  <Badge className="bg-green-100 text-green-800">{recebimentoDetalhes.status_recebimento}</Badge>
                </div>
              </div>
              {recebimentoDetalhes.observacoes && (
                <div>
                  <Label className="text-slate-500">Observações</Label>
                  <p className="text-sm">{recebimentoDetalhes.observacoes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setVerRecebimentoModal(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Pagar */}
      <Dialog open={pagarModal} onOpenChange={setPagarModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento de Comissão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-600">Vendedor:</span>
                <span className="font-semibold">{selectedComissao?.vendedor_nome}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Cliente:</span>
                <span className="font-medium">{selectedComissao?.cliente_nome}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Grupo/Cota:</span>
                <span className="font-medium">
                  {selectedComissao?.grupo}/{selectedComissao?.cota}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Valor Recebido:</span>
                <span className="font-semibold text-blue-600">
                  {(selectedComissao?.valor_recebido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Percentual:</span>
                <span className="font-semibold">{selectedComissao?.percentual_comissao}%</span>
              </div>
              <div className="flex justify-between border-t pt-2 mt-2">
                <span className="text-slate-600 font-semibold">Valor a Pagar:</span>
                <span className="font-bold text-green-600 text-lg">
                  {(selectedComissao?.valor_a_pagar || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
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
                  <SelectItem value="Transferência Bancária">Transferência Bancária</SelectItem>
                  <SelectItem value="TED">TED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
                placeholder="Informações adicionais sobre o pagamento..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagarModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handlePagar} className="bg-green-600 hover:bg-green-700">
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}