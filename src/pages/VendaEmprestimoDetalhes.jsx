import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, User, Building, Calendar, DollarSign, FileText, Percent, Edit, Save, X } from 'lucide-react';
import { toast } from 'sonner';

export default function VendaEmprestimoDetalhes() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [editando, setEditando] = useState(false);
  const [formData, setFormData] = useState({});
  const urlParams = new URLSearchParams(window.location.search);
  const vendaId = urlParams.get('id');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    
    if (me.perfil === 'super_admin' || me.perfil === 'master') {
      setUser({ ...me, perfil: me.perfil || 'super_admin' });
      setEmpresaId(null);
      return;
    }

    const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
    if (colabs.length > 0) {
      const colab = colabs[0];
      setUser({ ...me, perfil: colab.perfil });
      setEmpresaId(colab.empresa_id);
    }
  };

  const { data: statusPropostas = [] } = useQuery({
    queryKey: ['status-propostas', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.StatusProposta.filter({ empresa_id: empresaId, ativo: true }, 'ordem')
  });

  const { data: venda, isLoading } = useQuery({
    queryKey: ['venda-emprestimo-detalhes', vendaId],
    enabled: !!vendaId,
    queryFn: async () => {
      const vendaBase = await base44.entities.VendaBase.filter({ id: vendaId });
      if (!vendaBase || vendaBase.length === 0) return null;

      const vb = vendaBase[0];
      let detalhes = null;
      
      if (vb.produto === 'EMPRESTIMO_CONSIGNADO') {
        const det = await base44.entities.VendaConsignado.filter({ venda_base_id: vb.id });
        detalhes = det[0];
      } else if (vb.produto === 'EMPRESTIMO_PESSOAL') {
        const det = await base44.entities.VendaEmprestimoPessoal.filter({ venda_base_id: vb.id });
        detalhes = det[0];
      }

      return { ...vb, detalhes };
    }
  });

  useEffect(() => {
    if (venda) {
      setFormData({
        status: venda.status,
        observacoes: venda.observacoes || '',
        ...venda.detalhes
      });
    }
  }, [venda]);

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.VendaBase.update(vendaId, {
        status: data.status,
        observacoes: data.observacoes
      });

      if (venda.detalhes) {
        const detalhesUpdate = { ...data };
        delete detalhesUpdate.status;
        delete detalhesUpdate.observacoes;
        
        if (venda.produto === 'EMPRESTIMO_CONSIGNADO') {
          await base44.entities.VendaConsignado.update(venda.detalhes.id, detalhesUpdate);
        } else if (venda.produto === 'EMPRESTIMO_PESSOAL') {
          await base44.entities.VendaEmprestimoPessoal.update(venda.detalhes.id, detalhesUpdate);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['venda-emprestimo-detalhes', vendaId]);
      queryClient.invalidateQueries(['vendas-emprestimos']);
      toast.success('Proposta atualizada com sucesso!');
      setEditando(false);
    },
    onError: (error) => {
      toast.error('Erro ao atualizar proposta: ' + error.message);
    }
  });

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleCancel = () => {
    setFormData({
      status: venda.status,
      observacoes: venda.observacoes || '',
      ...venda.detalhes
    });
    setEditando(false);
  };

  const statusColors = {
    em_andamento: 'bg-blue-100 text-blue-800',
    pendente: 'bg-yellow-100 text-yellow-800',
    aguardando_formalizacao: 'bg-orange-100 text-orange-800',
    aguardando_cip: 'bg-indigo-100 text-indigo-800',
    saldo_retornado: 'bg-teal-100 text-teal-800',
    aguardando_pagamento: 'bg-purple-100 text-purple-800',
    pago: 'bg-emerald-100 text-emerald-800',
    cancelado: 'bg-red-100 text-red-800'
  };

  const statusLabels = {
    em_andamento: 'Em Andamento',
    pendente: 'Pendente',
    aguardando_formalizacao: 'Aguardando Formalização',
    aguardando_cip: 'Aguardando CIP',
    saldo_retornado: 'Saldo Retornado',
    aguardando_pagamento: 'Aguardando Pagamento',
    pago: 'Pago',
    cancelado: 'Cancelado'
  };

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!venda) {
    return (
      <div className="space-y-6">
        <PageHeader title="Empréstimo não encontrado" backTo="VendasEmprestimos" />
      </div>
    );
  }

  const isConsignado = venda.produto === 'EMPRESTIMO_CONSIGNADO';
  const det = venda.detalhes || {};

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <PageHeader
            title={`${isConsignado ? 'Empréstimo Consignado' : 'Empréstimo Pessoal'} - ${venda.cliente_nome}`}
            backTo="VendasEmprestimos"
          />
          <div className="flex items-center gap-3">
            {editando ? (
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="flex h-9 w-48 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                {statusPropostas.length > 0 ? (
                  statusPropostas.map(status => (
                    <option key={status.id} value={status.codigo}>{status.nome}</option>
                  ))
                ) : (
                  <>
                    <option value="em_andamento">Em andamento</option>
                    <option value="pendente">Pendente</option>
                    <option value="aguardando_formalizacao">Aguardando formalização</option>
                    <option value="aguardando_cip">Aguardando CIP</option>
                    <option value="saldo_retornado">Saldo retornado</option>
                    <option value="aguardando_pagamento">Aguardando pagamento</option>
                    <option value="pago">Pago</option>
                    <option value="cancelado">Cancelado</option>
                  </>
                )}
              </select>
            ) : (
              <Badge className={statusColors[venda.status]}>
                {statusLabels[venda.status]}
              </Badge>
            )}
            {!editando ? (
              <Button onClick={() => setEditando(true)} className="gap-2">
                <Edit className="w-4 h-4" />
                Editar
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  className="gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancelar
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Salvar
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Informações do Cliente */}
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="bg-purple-50/50">
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div>
              <span className="text-sm text-slate-500">Nome</span>
              <p className="font-medium">{venda.cliente_nome}</p>
            </div>
          </CardContent>
        </Card>

        {/* Dados da Proposta */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="bg-blue-50/50">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Dados da Proposta
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <span className="text-sm text-slate-500">Tipo</span>
                <p className="font-medium">{venda.tipo}</p>
              </div>
              {isConsignado && det.convenio_nome && (
                <div>
                  <span className="text-sm text-slate-500">Convênio</span>
                  <p className="font-medium">{det.convenio_nome}</p>
                </div>
              )}
              {det.numero_beneficio && (
                <div>
                  <span className="text-sm text-slate-500">Número do Benefício</span>
                  <p className="font-medium">{det.numero_beneficio}</p>
                </div>
              )}
              {det.banco && (
                <div>
                  <span className="text-sm text-slate-500">Banco</span>
                  <p className="font-medium">{det.banco}</p>
                </div>
              )}
              {det.banco_anterior && (
                <div>
                  <span className="text-sm text-slate-500">Banco Anterior</span>
                  <p className="font-medium">{det.banco_anterior}</p>
                </div>
              )}
              {det.numero_contrato && (
                <div>
                  <span className="text-sm text-slate-500">Número do Contrato</span>
                  <p className="font-medium">{det.numero_contrato}</p>
                </div>
              )}
              {det.numero_ade && (
                <div>
                  <span className="text-sm text-slate-500">Número ADE</span>
                  <p className="font-medium">{det.numero_ade}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Valores Financeiros */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="bg-green-50/50">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Valores
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(det.valor_liberado || editando) && (
                <div>
                  <Label>Valor Liberado</Label>
                  {editando ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.valor_liberado || ''}
                      onChange={(e) => setFormData({ ...formData, valor_liberado: parseFloat(e.target.value) })}
                      className="mt-1"
                    />
                  ) : (
                    <p className="font-medium text-lg text-green-600 mt-1">
                      R$ {det.valor_liberado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
              )}
              {det.valor_bruto && (
                <div>
                  <span className="text-sm text-slate-500">Valor Bruto</span>
                  <p className="font-medium">
                    R$ {det.valor_bruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}
              {det.saldo_devedor && (
                <div>
                  <span className="text-sm text-slate-500">Saldo Devedor</span>
                  <p className="font-medium">
                    R$ {det.saldo_devedor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}
              {(det.parcela || editando) && (
                <div>
                  <Label>Parcela</Label>
                  {editando ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.parcela || ''}
                      onChange={(e) => setFormData({ ...formData, parcela: parseFloat(e.target.value) })}
                      className="mt-1"
                    />
                  ) : (
                    <p className="font-medium mt-1">
                      R$ {det.parcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
              )}
              {det.prazo && (
                <div>
                  <span className="text-sm text-slate-500">Prazo</span>
                  <p className="font-medium">{det.prazo} meses</p>
                </div>
              )}
              {det.prazo_restante && (
                <div>
                  <span className="text-sm text-slate-500">Prazo Restante</span>
                  <p className="font-medium">{det.prazo_restante} meses</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Comissões */}
        {(user?.perfil === 'admin' || user?.perfil === 'gerente' || user?.perfil === 'super_admin' || user?.perfil === 'master') && (
          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="bg-amber-50/50">
              <CardTitle className="flex items-center gap-2">
                <Percent className="w-5 h-5" />
                Comissões
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm text-slate-700">Empresa</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {det.percentual_comissao_empresa && (
                      <div>
                        <span className="text-sm text-slate-500">Percentual</span>
                        <p className="font-medium">{det.percentual_comissao_empresa}%</p>
                      </div>
                    )}
                    {det.comissao_empresa_prevista && (
                      <div>
                        <span className="text-sm text-slate-500">Prevista</span>
                        <p className="font-medium text-amber-600">
                          R$ {det.comissao_empresa_prevista.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    )}
                    {det.comissao_empresa_recebida && (
                      <div>
                        <span className="text-sm text-slate-500">Recebida</span>
                        <p className="font-medium text-green-600">
                          R$ {det.comissao_empresa_recebida.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm text-slate-700">Vendedor</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {det.percentual_comissao_vendedor && (
                      <div>
                        <span className="text-sm text-slate-500">Percentual</span>
                        <p className="font-medium">{det.percentual_comissao_vendedor}%</p>
                      </div>
                    )}
                    {det.comissao_vendedor_prevista && (
                      <div>
                        <span className="text-sm text-slate-500">Prevista</span>
                        <p className="font-medium text-amber-600">
                          R$ {det.comissao_vendedor_prevista.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    )}
                    {det.comissao_vendedor_paga && (
                      <div>
                        <span className="text-sm text-slate-500">Paga</span>
                        <p className="font-medium text-green-600">
                          R$ {det.comissao_vendedor_paga.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Informações Adicionais */}
        <Card className="border-l-4 border-l-slate-500">
          <CardHeader className="bg-slate-50/50">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Informações Adicionais
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {venda.data_venda && (
                <div>
                  <span className="text-sm text-slate-500">Data da Venda</span>
                  <p className="font-medium">{new Date(venda.data_venda).toLocaleDateString('pt-BR')}</p>
                </div>
              )}
              {det.data_liberacao && (
                <div>
                  <span className="text-sm text-slate-500">Data de Liberação</span>
                  <p className="font-medium">{new Date(det.data_liberacao).toLocaleDateString('pt-BR')}</p>
                </div>
              )}
              {venda.vendedor_nome && (
                <div>
                  <span className="text-sm text-slate-500">Vendedor</span>
                  <p className="font-medium">{venda.vendedor_nome}</p>
                </div>
              )}
              {venda.usuario_digitador_nome && (
                <div>
                  <span className="text-sm text-slate-500">Digitador</span>
                  <p className="font-medium">{venda.usuario_digitador_nome}</p>
                </div>
              )}
              {venda.empresa_parceira && (
                <div>
                  <span className="text-sm text-slate-500">Empresa Parceira</span>
                  <p className="font-medium">{venda.empresa_parceira}</p>
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t">
              <Label>Observações</Label>
              {editando ? (
                <Textarea
                  value={formData.observacoes || ''}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  className="mt-1 min-h-[100px]"
                  placeholder="Adicione observações sobre esta proposta..."
                />
              ) : (
                <p className="font-medium mt-1 text-slate-700">
                  {venda.observacoes || 'Nenhuma observação'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}