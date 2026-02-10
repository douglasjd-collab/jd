import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ClienteSearchModal from '@/components/forms/ClienteSearchModal';

export default function NovaVendaFinanciamento() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [formData, setFormData] = useState({
    tipo_financiamento: 'VEICULO',
    banco: '',
    empresa_parceira: '',
    valor_bem: '',
    valor_financiado: '',
    entrada: '',
    prazo: '',
    parcela: '',
    data_liberacao: '',
    numero_contrato: '',
    status: 'em_andamento',
    observacoes: ''
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);

    if (me.role === 'super_admin' || me.perfil === 'super_admin') {
      const empresas = await base44.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) setEmpresaId(empresas[0].id);
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) setEmpresaId(colabs[0].empresa_id);
    }
  };

  const criarVendaMutation = useMutation({
    mutationFn: async (dados) => {
      // 1. Criar VendaBase
      const vendaBase = await base44.entities.VendaBase.create({
        empresa_id: empresaId,
        produto: 'FINANCIAMENTO',
        tipo: dados.tipo_financiamento,
        cliente_id: clienteSelecionado.id,
        cliente_nome: clienteSelecionado.nome_completo || clienteSelecionado.pj_razao_social,
        usuario_digitador_id: user.id,
        usuario_digitador_nome: user.full_name,
        vendedor_id: user.id,
        vendedor_nome: user.full_name,
        empresa_parceira: dados.empresa_parceira || dados.banco,
        status: dados.status,
        valor_total: parseFloat(dados.valor_financiado) || 0,
        data_venda: new Date().toISOString().split('T')[0],
        observacoes: dados.observacoes
      });

      // 2. Criar VendaFinanciamento
      await base44.entities.VendaFinanciamento.create({
        venda_base_id: vendaBase.id,
        tipo_financiamento: dados.tipo_financiamento,
        banco: dados.banco,
        valor_bem: parseFloat(dados.valor_bem) || 0,
        valor_financiado: parseFloat(dados.valor_financiado) || 0,
        entrada: parseFloat(dados.entrada) || 0,
        prazo: parseInt(dados.prazo) || 0,
        parcela: parseFloat(dados.parcela) || 0,
        data_liberacao: dados.data_liberacao || null,
        numero_contrato: dados.numero_contrato,
        status: dados.status
      });

      return vendaBase;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendas'] });
      toast.success('Financiamento cadastrado com sucesso!');
      navigate('/VendasFinanciamento');
    },
    onError: (error) => {
      toast.error('Erro ao criar financiamento: ' + error.message);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!clienteSelecionado) {
      toast.error('Selecione um cliente');
      return;
    }
    criarVendaMutation.mutate(formData);
  };

  if (!user || !empresaId) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nova Venda - Financiamento"
        subtitle="Cadastre um novo financiamento"
        backTo="NovaVenda"
      />

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="pt-6 space-y-6">
            {/* Cliente */}
            <div>
              <Label>Cliente *</Label>
              {clienteSelecionado ? (
                <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <span className="font-medium">{clienteSelecionado.nome_completo || clienteSelecionado.pj_razao_social}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowClienteModal(true)}>
                    Alterar
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full" onClick={() => setShowClienteModal(true)}>
                  Selecionar Cliente
                </Button>
              )}
            </div>

            {/* Tipo */}
            <div>
              <Label>Tipo de Financiamento *</Label>
              <select
                value={formData.tipo_financiamento}
                onChange={(e) => setFormData({ ...formData, tipo_financiamento: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                required
              >
                <option value="VEICULO">Veículo</option>
                <option value="MOTOCICLETA">Motocicleta</option>
                <option value="CAMINHAO">Caminhão</option>
                <option value="IMOVEL">Imóvel</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Banco *</Label>
                <Input
                  value={formData.banco}
                  onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Empresa Parceira</Label>
                <Input
                  value={formData.empresa_parceira}
                  onChange={(e) => setFormData({ ...formData, empresa_parceira: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Valor do Bem *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.valor_bem}
                  onChange={(e) => setFormData({ ...formData, valor_bem: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Valor Financiado *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.valor_financiado}
                  onChange={(e) => setFormData({ ...formData, valor_financiado: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Entrada</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.entrada}
                  onChange={(e) => setFormData({ ...formData, entrada: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Prazo (meses)</Label>
                <Input
                  type="number"
                  value={formData.prazo}
                  onChange={(e) => setFormData({ ...formData, prazo: e.target.value })}
                />
              </div>
              <div>
                <Label>Parcela</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.parcela}
                  onChange={(e) => setFormData({ ...formData, parcela: e.target.value })}
                />
              </div>
              <div>
                <Label>Data de Liberação</Label>
                <Input
                  type="date"
                  value={formData.data_liberacao}
                  onChange={(e) => setFormData({ ...formData, data_liberacao: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Número do Contrato</Label>
                <Input
                  value={formData.numero_contrato}
                  onChange={(e) => setFormData({ ...formData, numero_contrato: e.target.value })}
                />
              </div>
              <div>
                <Label>Status</Label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="em_andamento">Em andamento</option>
                  <option value="pendente">Pendente</option>
                  <option value="aguardando_formalizacao">Aguardando formalização</option>
                  <option value="aguardando_pagamento">Aguardando pagamento</option>
                  <option value="pago">Pago</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
            </div>

            <div>
              <Label>Observações</Label>
              <textarea
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => navigate('/NovaVenda')}>
                Cancelar
              </Button>
              <Button type="submit" disabled={criarVendaMutation.isPending}>
                {criarVendaMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Financiamento'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <ClienteSearchModal
        open={showClienteModal}
        onOpenChange={setShowClienteModal}
        onSelectCliente={(cliente) => {
          setClienteSelecionado(cliente);
          setShowClienteModal(false);
        }}
        currentUser={user}
        empresaIdSelecionada={empresaId}
      />
    </div>
  );
}