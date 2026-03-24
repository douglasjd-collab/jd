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

export default function NovaVendaEmprestimoPessoal() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [formData, setFormData] = useState({
    tipo_emprestimo: 'CREFAZ',
    banco: '',
    empresa_parceira: '',
    valor_liberado: '',
    valor_bruto: '',
    prazo: '',
    parcela: '',
    data_liberacao: '',
    numero_contrato: '',
    status: 'em_andamento',
    observacoes: '',
    // Campos de Portabilidade
    origem_banco: '',
    origem_contrato: '',
    origem_parcela: '',
    origem_prazo: '',
    origem_prazo_restante: '',
    origem_saldo_devedor: '',
    origem_tabela: '',
    // Campos de Refinanciamento (quando Porto + Refin)
    refin_parcela: '',
    refin_valor_bruto: '',
    refin_valor_liberado: '',
    refin_prazo: '',
    refin_tabela: ''
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
      const vendaBase = await base44.entities.VendaBase.create({
        empresa_id: empresaId,
        produto: 'EMPRESTIMO_PESSOAL',
        tipo: dados.tipo_emprestimo,
        cliente_id: clienteSelecionado.id,
        cliente_nome: clienteSelecionado.nome_completo || clienteSelecionado.pj_razao_social,
        usuario_digitador_id: user.id,
        usuario_digitador_nome: user.full_name,
        vendedor_id: user.id,
        vendedor_nome: user.full_name,
        empresa_parceira: dados.empresa_parceira || dados.banco,
        status: dados.status,
        valor_total: parseFloat(dados.valor_liberado) || 0,
        data_venda: new Date().toISOString().split('T')[0],
        observacoes: dados.observacoes
      });

      await base44.entities.VendaEmprestimoPessoal.create({
        venda_base_id: vendaBase.id,
        tipo_emprestimo: dados.tipo_emprestimo,
        banco: dados.banco,
        valor_liberado: parseFloat(dados.valor_liberado) || 0,
        valor_bruto: parseFloat(dados.valor_bruto) || 0,
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
      toast.success('Empréstimo pessoal cadastrado com sucesso!');
      navigate('/VendasEmprestimos');
    },
    onError: (error) => {
      toast.error('Erro ao criar empréstimo: ' + error.message);
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
        title="Nova Proposta - Empréstimo Pessoal"
        subtitle="Cadastre um novo empréstimo pessoal"
        backTo="NovaVenda"
      />

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="pt-6 space-y-6">
            <div>
              <Label>Cliente *</Label>
              {clienteSelecionado ? (
                <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200">
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

            <div>
              <Label>Tipo de Empréstimo *</Label>
              <select
                value={formData.tipo_emprestimo}
                onChange={(e) => setFormData({ ...formData, tipo_emprestimo: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                required
              >
                <option value="CREFAZ">Crefaz</option>
                <option value="DEBITO_EM_CONTA">Débito em Conta</option>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Valor Liberado *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.valor_liberado}
                  onChange={(e) => setFormData({ ...formData, valor_liberado: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Valor Bruto</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.valor_bruto}
                  onChange={(e) => setFormData({ ...formData, valor_bruto: e.target.value })}
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
                  'Salvar Empréstimo'
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