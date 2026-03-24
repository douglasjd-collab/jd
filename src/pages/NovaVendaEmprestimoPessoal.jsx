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
    data_cadastro: new Date().toISOString().split('T')[0],
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

      const vepData = {
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
      };

      // Adiciona campos de Portabilidade se aplicável
      if (dados.tipo_emprestimo === 'PORTABILIDADE_PURA' || dados.tipo_emprestimo === 'REFIN_PORTABILIDADE') {
        vepData.origem_banco = dados.origem_banco || null;
        vepData.origem_contrato = dados.origem_contrato || null;
        vepData.origem_parcela = parseFloat(dados.origem_parcela) || null;
        vepData.origem_prazo = parseInt(dados.origem_prazo) || null;
        vepData.origem_prazo_restante = parseInt(dados.origem_prazo_restante) || null;
        vepData.origem_saldo_devedor = parseFloat(dados.origem_saldo_devedor) || null;
        vepData.origem_tabela = dados.origem_tabela || null;
      }

      // Adiciona campos de Refinanciamento se Porto + Refin
      if (dados.tipo_emprestimo === 'REFIN_PORTABILIDADE') {
        vepData.refin_parcela = parseFloat(dados.refin_parcela) || null;
        vepData.refin_valor_bruto = parseFloat(dados.refin_valor_bruto) || null;
        vepData.refin_valor_liberado = parseFloat(dados.refin_valor_liberado) || null;
        vepData.refin_prazo = parseInt(dados.refin_prazo) || null;
        vepData.refin_tabela = dados.refin_tabela || null;
      }

      await base44.entities.VendaEmprestimoPessoal.create(vepData);

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
                <option value="NOVO">Novo</option>
                <option value="CARTAO_REFINANCIAMENTO">Cartão e Refinanciamento</option>
                <option value="SAQUE">Saque</option>
                <option value="CARTAO_CONSIGNADO">Cartão Consignado</option>
                <option value="CARTAO_BENEFICIO">Cartão Benefício</option>
                <option value="PORTABILIDADE_PURA">Portabilidade Pura</option>
                <option value="REFIN_PORTABILIDADE">Refinanciamento + Portabilidade</option>
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

            {/* Campos para tipos padrão (NOVO, CARTÃO, etc) */}
            {['NOVO', 'CARTAO_REFINANCIAMENTO', 'SAQUE', 'CARTAO_CONSIGNADO', 'CARTAO_BENEFICIO', 'REFIN_PORTABILIDADE'].includes(formData.tipo_emprestimo) && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Valor Bruto *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.valor_bruto}
                      onChange={(e) => setFormData({ ...formData, valor_bruto: e.target.value })}
                      required={formData.tipo_emprestimo !== 'REFIN_PORTABILIDADE' || !formData.tipo_emprestimo.includes('REFIN')}
                    />
                  </div>
                  <div>
                    <Label>Valor Liberado (Líquido) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.valor_liberado}
                      onChange={(e) => setFormData({ ...formData, valor_liberado: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Parcela *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.parcela}
                      onChange={(e) => setFormData({ ...formData, parcela: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Prazo (meses) *</Label>
                    <Input
                      type="number"
                      value={formData.prazo}
                      onChange={(e) => setFormData({ ...formData, prazo: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Tabela *</Label>
                    <Input
                      value={formData.empresa_parceira}
                      onChange={(e) => setFormData({ ...formData, empresa_parceira: e.target.value })}
                      placeholder="Identifique a tabela"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label>Data de Liberação</Label>
                  <Input
                    type="date"
                    value={formData.data_liberacao}
                    onChange={(e) => setFormData({ ...formData, data_liberacao: e.target.value })}
                  />
                </div>
              </>
            )}

            {/* Campos específicos de PORTABILIDADE PURA */}
            {formData.tipo_emprestimo === 'PORTABILIDADE_PURA' && (
              <div className="border-l-4 border-l-purple-500 pl-4 py-2 bg-purple-50 rounded">
                <h3 className="font-semibold text-purple-900 mb-4">Dados da Portabilidade</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Banco de Origem *</Label>
                    <Input
                      value={formData.origem_banco}
                      onChange={(e) => setFormData({ ...formData, origem_banco: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Contrato de Origem *</Label>
                    <Input
                      value={formData.origem_contrato}
                      onChange={(e) => setFormData({ ...formData, origem_contrato: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Parcela (Origem) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.origem_parcela}
                      onChange={(e) => setFormData({ ...formData, origem_parcela: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Prazo (Origem - meses) *</Label>
                    <Input
                      type="number"
                      value={formData.origem_prazo}
                      onChange={(e) => setFormData({ ...formData, origem_prazo: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Prazo Restante (meses) *</Label>
                    <Input
                      type="number"
                      value={formData.origem_prazo_restante}
                      onChange={(e) => setFormData({ ...formData, origem_prazo_restante: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Saldo Devedor *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.origem_saldo_devedor}
                      onChange={(e) => setFormData({ ...formData, origem_saldo_devedor: e.target.value })}
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Tabela (Origem) *</Label>
                    <Input
                      value={formData.origem_tabela}
                      onChange={(e) => setFormData({ ...formData, origem_tabela: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* Dados do novo empréstimo na portabilidade */}
                <div className="mt-6 pt-4 border-t">
                  <h4 className="font-semibold text-purple-900 mb-3">Dados do Novo Empréstimo</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Valor Bruto *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.valor_bruto}
                        onChange={(e) => setFormData({ ...formData, valor_bruto: e.target.value })}
                        required
                      />
                    </div>
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
                      <Label>Parcela *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.parcela}
                        onChange={(e) => setFormData({ ...formData, parcela: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label>Prazo (meses) *</Label>
                      <Input
                        type="number"
                        value={formData.prazo}
                        onChange={(e) => setFormData({ ...formData, prazo: e.target.value })}
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Tabela *</Label>
                      <Input
                        value={formData.empresa_parceira}
                        onChange={(e) => setFormData({ ...formData, empresa_parceira: e.target.value })}
                        placeholder="Identifique a tabela"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Campos específicos de REFINANCIAMENTO + PORTABILIDADE */}
            {formData.tipo_emprestimo === 'REFIN_PORTABILIDADE' && (
              <div className="border-l-4 border-l-pink-500 pl-4 py-2 bg-pink-50 rounded">
                <h3 className="font-semibold text-pink-900 mb-4">Dados da Portabilidade</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Banco de Origem *</Label>
                    <Input
                      value={formData.origem_banco}
                      onChange={(e) => setFormData({ ...formData, origem_banco: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Contrato de Origem *</Label>
                    <Input
                      value={formData.origem_contrato}
                      onChange={(e) => setFormData({ ...formData, origem_contrato: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Parcela (Origem) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.origem_parcela}
                      onChange={(e) => setFormData({ ...formData, origem_parcela: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Prazo (Origem - meses) *</Label>
                    <Input
                      type="number"
                      value={formData.origem_prazo}
                      onChange={(e) => setFormData({ ...formData, origem_prazo: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Prazo Restante (meses) *</Label>
                    <Input
                      type="number"
                      value={formData.origem_prazo_restante}
                      onChange={(e) => setFormData({ ...formData, origem_prazo_restante: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Saldo Devedor *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.origem_saldo_devedor}
                      onChange={(e) => setFormData({ ...formData, origem_saldo_devedor: e.target.value })}
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Tabela (Origem) *</Label>
                    <Input
                      value={formData.origem_tabela}
                      onChange={(e) => setFormData({ ...formData, origem_tabela: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* Dados do Refinanciamento */}
                <div className="mt-6 pt-4 border-t">
                  <h4 className="font-semibold text-pink-900 mb-3">Dados do Refinanciamento</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Parcela (Refin) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.refin_parcela}
                        onChange={(e) => setFormData({ ...formData, refin_parcela: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label>Valor Bruto (Refin) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.refin_valor_bruto}
                        onChange={(e) => setFormData({ ...formData, refin_valor_bruto: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label>Valor Liberado (Refin) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.refin_valor_liberado}
                        onChange={(e) => setFormData({ ...formData, refin_valor_liberado: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label>Prazo (Refin - meses) *</Label>
                      <Input
                        type="number"
                        value={formData.refin_prazo}
                        onChange={(e) => setFormData({ ...formData, refin_prazo: e.target.value })}
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Tabela (Refin) *</Label>
                      <Input
                        value={formData.refin_tabela}
                        onChange={(e) => setFormData({ ...formData, refin_tabela: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Data de Cadastro - aparece para todos os tipos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Data de Cadastro *</Label>
                <Input
                  type="date"
                  value={formData.data_cadastro}
                  onChange={(e) => setFormData({ ...formData, data_cadastro: e.target.value })}
                  required
                />
              </div>
              {/* Número do Contrato (apenas para NOVO, CARTÃO, etc) */}
              {formData.tipo_emprestimo !== 'PORTABILIDADE_PURA' && formData.tipo_emprestimo !== 'REFIN_PORTABILIDADE' && (
                <div>
                  <Label>Número do Contrato</Label>
                  <Input
                    value={formData.numero_contrato}
                    onChange={(e) => setFormData({ ...formData, numero_contrato: e.target.value })}
                  />
                </div>
              )}
            </div>

            {/* Status (apenas para NOVO, CARTÃO, etc) */}
            {formData.tipo_emprestimo !== 'PORTABILIDADE_PURA' && formData.tipo_emprestimo !== 'REFIN_PORTABILIDADE' && (
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
            )}

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