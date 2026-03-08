import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, X, ArrowLeft, Search } from 'lucide-react';
import { toast } from 'sonner';
import ClienteSearchModal from '@/components/forms/ClienteSearchModal';
import ConvenioFormModal from '@/components/forms/ConvenioFormModal';
import BancoFormModal from '@/components/forms/BancoFormModal';

export default function NovaVendaConsignado() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [showConvenioModal, setShowConvenioModal] = useState(false);
  const [showBancoModal, setShowBancoModal] = useState(false);
  const [salvandoConvenio, setSalvandoConvenio] = useState(false);
  const [salvandoBanco, setSalvandoBanco] = useState(false);
  const [formData, setFormData] = useState({
    tipo_consignado: 'NOVO',
    numero_ade: '',
    numero_contrato: '',
    convenio_id: '',
    tabela_emprestimo_id: '',
    numero_beneficio: '',
    banco: '',
    valor_liberado: '',
    valor_bruto: '',
    prazo: '',
    parcela: '',
    data_liberacao: '',
    banco_anterior: '',
    saldo_devedor: '',
    prazo_restante: '',
    prazo_original: '',
    contrato_anterior: '',
    data_inicio: '',
    vendedor_parceiro_id: '',
    tabela_comissao_id: '',
    percentual_comissao_empresa: '',
    comissao_empresa_prevista: '',
    comissao_empresa_recebida: '',
    percentual_comissao_vendedor: '',
    comissao_vendedor_prevista: '',
    comissao_vendedor_paga: '',
    status: 'em_andamento',
    empresa_parceira: '',
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

  const { data: convenios = [] } = useQuery({
    queryKey: ['convenios', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Convenio.filter({ empresa_id: empresaId, ativo: true })
  });

  const { data: bancos = [] } = useQuery({
    queryKey: ['bancos', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Banco.filter({ empresa_id: empresaId, ativo: true })
  });

  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedores', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Colaborador.filter({ empresa_id: empresaId, status: 'ativo' }, 'nome')
  });

  const { data: tabelasComissao = [] } = useQuery({
    queryKey: ['tabelas-comissao-emprestimo', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.TabelaComissaoEmprestimo.filter({ empresa_id: empresaId, ativo: true })
  });

  const { data: tabelasEmprestimo = [] } = useQuery({
    queryKey: ['tabelas-emprestimo', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.TabelaEmprestimo.filter({ empresa_id: empresaId, ativo: true }, 'nome')
  });

  const { data: tiposEmprestimo = [] } = useQuery({
    queryKey: ['tipos-emprestimo', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.TipoEmprestimo.filter({ empresa_id: empresaId, ativo: true }, 'nome')
  });

  const { data: empresasParceiras = [] } = useQuery({
    queryKey: ['empresas-parceiras', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.EmpresaParceira.filter({ empresa_id: empresaId, ativo: true }, 'nome')
  });

  const { data: statusPropostas = [] } = useQuery({
    queryKey: ['status-propostas', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.StatusProposta.filter({ empresa_id: empresaId, ativo: true }, 'ordem')
  });

  const criarVendaMutation = useMutation({
    mutationFn: async (dados) => {
      const convenioSelecionado = convenios.find(c => c.id === dados.convenio_id);
      const vendedorSelecionado = vendedores.find(v => v.id === dados.vendedor_parceiro_id);

      const proposta = await base44.entities.Proposta.create({
        empresa_id: empresaId,
        produto: 'emprestimo',
        cliente_id: clienteSelecionado.id,
        cliente_nome: clienteSelecionado.nome_completo || clienteSelecionado.pj_razao_social,
        vendedor_id: vendedorSelecionado?.id || user.id,
        vendedor_nome: vendedorSelecionado?.nome || user.full_name,
        administradora_id: '',
        administradora_nome: dados.banco || '',
        contrato: dados.numero_contrato,
        status: dados.status,
        data_venda: new Date().toISOString().split('T')[0],
        valor_credito: parseFloat(dados.valor_liberado) || 0,
        valor_comissao: parseFloat(dados.comissao_empresa_prevista) || 0,
        comissao_recebida: parseFloat(dados.comissao_empresa_recebida) || 0,
        observacoes: dados.observacoes,
        emprestimo_tipo: dados.tipo_consignado,
        emprestimo_convenio_id: dados.convenio_id,
        emprestimo_convenio_nome: convenioSelecionado?.nome || '',
        emprestimo_numero_beneficio: dados.numero_beneficio,
        emprestimo_numero_ade: dados.numero_ade,
        emprestimo_prazo: parseInt(dados.prazo) || 0,
        emprestimo_saldo_devedor: parseFloat(dados.saldo_devedor) || 0,
        emprestimo_data_liberacao: dados.data_liberacao || null,
        emprestimo_banco_anterior: dados.banco_anterior,
      });

      return proposta;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendas-emprestimos'] });
      toast.success('Empréstimo consignado cadastrado com sucesso!');
      navigate(createPageUrl('VendasEmprestimos'));
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
    if (!formData.numero_contrato) {
      toast.error('Número do Contrato é obrigatório');
      return;
    }
    if (formData.status === 'pago' && !formData.numero_contrato) {
      toast.error('Para o status Pago é necessário informar o Número do Contrato');
      return;
    }
    criarVendaMutation.mutate(formData);
  };

  const formatarMoeda = (valor) => {
    if (!valor) return '';
    const numero = valor.replace(/\D/g, '');
    const valorFormatado = (parseFloat(numero) / 100).toFixed(2);
    return valorFormatado.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const handleMoedaChange = (campo, valor) => {
    const numero = valor.replace(/\D/g, '');
    const novoValor = (parseFloat(numero) / 100).toFixed(2);
    const novoForm = { ...formData, [campo]: novoValor };
    
    // Recalcular comissões se for valor_liberado ou prazo
    if (campo === 'valor_liberado') {
      calcularComissoes(novoForm);
    } else {
      setFormData(novoForm);
    }
  };

  const calcularComissoes = (dadosForm) => {
    const valorLiberado = parseFloat(dadosForm.valor_liberado) || 0;
    const prazo = parseInt(dadosForm.prazo) || 0;
    const tipo = dadosForm.tipo_consignado;
    const convenioId = dadosForm.convenio_id;
    const banco = dadosForm.banco;

    // Buscar tabela de comissão aplicável
    const tabelaAplicavel = tabelasComissao.find(t => {
      const tipoMatch = t.tipo_operacao === tipo;
      const convenioMatch = !t.convenio_id || t.convenio_id === convenioId;
      const bancoMatch = !t.banco || t.banco === banco;
      const prazoMatch = prazo >= t.prazo_min && prazo <= t.prazo_max;
      
      return tipoMatch && convenioMatch && bancoMatch && prazoMatch;
    });

    if (tabelaAplicavel && valorLiberado > 0) {
      const comissaoEmpresa = (valorLiberado * tabelaAplicavel.percentual_comissao_empresa) / 100;
      const comissaoVendedor = (valorLiberado * tabelaAplicavel.percentual_comissao_vendedor) / 100;

      setFormData({
        ...dadosForm,
        tabela_comissao_id: tabelaAplicavel.id,
        percentual_comissao_empresa: tabelaAplicavel.percentual_comissao_empresa,
        comissao_empresa_prevista: comissaoEmpresa.toFixed(2),
        percentual_comissao_vendedor: tabelaAplicavel.percentual_comissao_vendedor,
        comissao_vendedor_prevista: comissaoVendedor.toFixed(2)
      });
    } else {
      setFormData({
        ...dadosForm,
        tabela_comissao_id: '',
        percentual_comissao_empresa: '',
        comissao_empresa_prevista: '',
        percentual_comissao_vendedor: '',
        comissao_vendedor_prevista: ''
      });
    }
  };

  // Recalcular quando prazo, tipo, convênio ou banco mudar
  useEffect(() => {
    if (formData.valor_liberado && formData.prazo) {
      calcularComissoes(formData);
    }
  }, [formData.prazo, formData.tipo_consignado, formData.convenio_id, formData.banco]);

  // Aplicar comissões da tabela selecionada
  const handleTabelaChange = (tabelaId) => {
    const tabela = tabelasEmprestimo.find(t => t.id === tabelaId);
    if (tabela) {
      const valorLiberado = parseFloat(formData.valor_liberado) || 0;
      const comissaoEmpresa = valorLiberado > 0 ? (valorLiberado * tabela.comissao_empresa) / 100 : 0;
      const comissaoVendedor = valorLiberado > 0 ? (valorLiberado * tabela.comissao_corretor) / 100 : 0;

      setFormData({
        ...formData,
        tabela_emprestimo_id: tabelaId,
        percentual_comissao_empresa: tabela.comissao_empresa,
        comissao_empresa_prevista: comissaoEmpresa.toFixed(2),
        percentual_comissao_vendedor: tabela.comissao_corretor,
        comissao_vendedor_prevista: comissaoVendedor.toFixed(2)
      });
    } else {
      setFormData({
        ...formData,
        tabela_emprestimo_id: '',
        percentual_comissao_empresa: '',
        comissao_empresa_prevista: '',
        percentual_comissao_vendedor: '',
        comissao_vendedor_prevista: ''
      });
    }
  };

  // Recalcular comissões quando valor mudar e tabela estiver selecionada
  useEffect(() => {
    if (formData.tabela_emprestimo_id && formData.valor_liberado) {
      handleTabelaChange(formData.tabela_emprestimo_id);
    }
  }, [formData.valor_liberado]);

  const renderCamposPorTipo = () => {
    if (formData.tipo_consignado === 'NOVO' || formData.tipo_consignado === 'REFINANCIAMENTO') {
      return (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Valor Liberado *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                <Input 
                  className="pl-10"
                  value={formatarMoeda(formData.valor_liberado)} 
                  onChange={(e) => handleMoedaChange('valor_liberado', e.target.value)} 
                  placeholder="0,00"
                  required 
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Valor Bruto</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                <Input 
                  className="pl-10"
                  value={formatarMoeda(formData.valor_bruto)} 
                  onChange={(e) => handleMoedaChange('valor_bruto', e.target.value)} 
                  placeholder="0,00"
                />
              </div>
            </div>
            <div>
              <Label>Prazo (meses)</Label>
              <Input type="number" value={formData.prazo} onChange={(e) => setFormData({ ...formData, prazo: e.target.value.replace(/\D/g, '') })} placeholder="12" />
            </div>
            <div>
              <Label>Parcela</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                <Input 
                  className="pl-10"
                  value={formatarMoeda(formData.parcela)} 
                  onChange={(e) => handleMoedaChange('parcela', e.target.value)} 
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>
          <div>
            <Label>Data de Liberação</Label>
            <Input type="date" value={formData.data_liberacao} onChange={(e) => setFormData({ ...formData, data_liberacao: e.target.value })} />
          </div>
        </>
      );
    }

    if (formData.tipo_consignado === 'PORTABILIDADE_PURA') {
      return (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Saldo Devedor *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                <Input 
                  className="pl-10"
                  value={formatarMoeda(formData.saldo_devedor)} 
                  onChange={(e) => handleMoedaChange('saldo_devedor', e.target.value)} 
                  placeholder="0,00"
                  required 
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Prazo Restante</Label>
              <Input type="number" value={formData.prazo_restante} onChange={(e) => setFormData({ ...formData, prazo_restante: e.target.value.replace(/\D/g, '') })} placeholder="12" />
            </div>
            <div>
              <Label>Prazo Original</Label>
              <Input type="number" value={formData.prazo_original} onChange={(e) => setFormData({ ...formData, prazo_original: e.target.value.replace(/\D/g, '') })} placeholder="12" />
            </div>
            <div>
              <Label>Data de Início</Label>
              <Input type="date" value={formData.data_inicio} onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Contrato Anterior</Label>
            <Input value={formData.contrato_anterior} onChange={(e) => setFormData({ ...formData, contrato_anterior: e.target.value })} />
          </div>
        </>
      );
    }

    if (formData.tipo_consignado === 'REFIN_PORTABILIDADE') {
      return (
        <>
          <CardTitle className="text-lg mt-4">Dados da Portabilidade</CardTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Saldo Devedor</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                <Input 
                  className="pl-10"
                  value={formatarMoeda(formData.saldo_devedor)} 
                  onChange={(e) => handleMoedaChange('saldo_devedor', e.target.value)} 
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Prazo Restante</Label>
              <Input type="number" value={formData.prazo_restante} onChange={(e) => setFormData({ ...formData, prazo_restante: e.target.value.replace(/\D/g, '') })} placeholder="12" />
            </div>
            <div>
              <Label>Contrato Anterior</Label>
              <Input value={formData.contrato_anterior} onChange={(e) => setFormData({ ...formData, contrato_anterior: e.target.value })} />
            </div>
          </div>

          <CardTitle className="text-lg mt-4">Dados do Refinanciamento</CardTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Valor Liberado</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                <Input 
                  className="pl-10"
                  value={formatarMoeda(formData.valor_liberado)} 
                  onChange={(e) => handleMoedaChange('valor_liberado', e.target.value)} 
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Valor Bruto</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                <Input 
                  className="pl-10"
                  value={formatarMoeda(formData.valor_bruto)} 
                  onChange={(e) => handleMoedaChange('valor_bruto', e.target.value)} 
                  placeholder="0,00"
                />
              </div>
            </div>
            <div>
              <Label>Prazo</Label>
              <Input type="number" value={formData.prazo} onChange={(e) => setFormData({ ...formData, prazo: e.target.value.replace(/\D/g, '') })} placeholder="12" />
            </div>
            <div>
              <Label>Parcela</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                <Input 
                  className="pl-10"
                  value={formatarMoeda(formData.parcela)} 
                  onChange={(e) => handleMoedaChange('parcela', e.target.value)} 
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>
        </>
      );
    }
  };

  if (!user || !empresaId) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const stepLabels = ['Informações do Cliente', 'Detalhes da Proposta', 'Estrutura de Comissões', 'Revisão Final'];
  const stepColors = ['purple', 'blue', 'green', 'orange'];

  const getStepColor = (step) => {
    const colors = {
      purple: 'bg-purple-100 text-purple-900 border-purple-200',
      blue: 'bg-blue-100 text-blue-900 border-blue-200',
      green: 'bg-green-100 text-green-900 border-green-200',
      orange: 'bg-orange-100 text-orange-900 border-orange-200'
    };
    return colors[stepColors[step - 1]] || colors.purple;
  };

  return (
    <div className="space-y-6">
      {/* Header com navegação */}
      <div className="flex items-center gap-3 mb-6">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nova Proposta de Empréstimo Consignado</h1>
          <p className="text-sm text-slate-500 mt-1">Preencha as detalhes abaixo para criar uma nova proposta de empréstimo consignado.</p>
        </div>
      </div>

      {/* Stepper/Tabs */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 sticky top-0 z-40">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {stepLabels.map((label, idx) => {
            const step = idx + 1;
            const isActive = currentStep === step;
            const isCompleted = currentStep > step;
            const color = stepColors[idx];
            
            const bgMap = {
              purple: isActive ? 'bg-purple-100 border-purple-300' : isCompleted ? 'bg-purple-50 border-purple-200' : 'bg-slate-50 border-slate-200',
              blue: isActive ? 'bg-blue-100 border-blue-300' : isCompleted ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200',
              green: isActive ? 'bg-green-100 border-green-300' : isCompleted ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200',
              orange: isActive ? 'bg-orange-100 border-orange-300' : isCompleted ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200'
            };

            const badgeMap = {
              purple: 'bg-purple-500 text-white',
              blue: 'bg-blue-500 text-white',
              green: 'bg-green-500 text-white',
              orange: 'bg-orange-500 text-white'
            };

            return (
              <button
                key={step}
                onClick={() => currentStep > step || isActive ? setCurrentStep(step) : null}
                disabled={currentStep < step}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border whitespace-nowrap transition-all ${bgMap[color]} ${currentStep < step ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-sm'}`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${badgeMap[color]}`}>
                  {step}
                </div>
                <span className="text-sm font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Informações do Cliente */}
        {currentStep === 1 && (
        <Card className="border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-50/50 to-white">
          <CardHeader className="bg-purple-50/50 border-b">
            <CardTitle className="flex items-center gap-2 text-purple-900">
              <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">1</span>
              </div>
              Informações do Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div>
              <Label>Cliente *</Label>
              {clienteSelecionado ? (
                <div className="flex items-center justify-between p-4 bg-purple-100 rounded-lg border-2 border-purple-300">
                  <span className="font-semibold text-purple-900">{clienteSelecionado.nome_completo || clienteSelecionado.pj_razao_social}</span>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowClienteModal(true)}>
                      Alterar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input 
                      placeholder="Buscar cliente por nome ou ID" 
                      className="pl-10"
                      onClick={() => setShowClienteModal(true)}
                      readOnly
                    />
                  </div>
                  <Button type="button" className="w-full bg-purple-500 hover:bg-purple-600" onClick={() => setShowClienteModal(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Cliente
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        )}

        {/* Step 2: Detalhes da Proposta */}
        {currentStep === 2 && (

        <Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50/50 to-white">
          <CardHeader className="bg-blue-50/50 border-b">
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">2</span>
              </div>
              Detalhes da Proposta
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Banco *</Label>
                <div className="flex gap-2">
                  <select
                    value={formData.banco}
                    onChange={(e) => setFormData({ ...formData, banco: e.target.value, tabela_emprestimo_id: '' })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    required
                  >
                    <option value="">Selecione...</option>
                    {bancos.map(b => (
                      <option key={b.id} value={b.nome}>{b.nome}</option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowBancoModal(true)}
                    title="Cadastrar novo banco"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>Tipo de Empréstimo *</Label>
                <select
                  value={formData.tipo_consignado}
                  onChange={(e) => setFormData({ ...formData, tipo_consignado: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  required
                >
                  <option value="">Selecione...</option>
                  {tiposEmprestimo.length > 0 ? (
                    tiposEmprestimo.map(t => (
                      <option key={t.id} value={t.slug}>{t.nome}</option>
                    ))
                  ) : (
                    <>
                      <option value="NOVO">Novo</option>
                      <option value="REFINANCIAMENTO">Refinanciamento</option>
                      <option value="PORTABILIDADE_PURA">Portabilidade Pura</option>
                      <option value="REFIN_PORTABILIDADE">Refin + Portabilidade</option>
                      <option value="CARTAO_CONSIGNADO">Cartão Consignado</option>
                      <option value="CARTAO_BENEFICIO">Cartão Benefício</option>
                      <option value="SAQUE">Saque</option>
                      <option value="CARTAO">Cartão</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Convênio *</Label>
                <div className="flex gap-2">
                  <select
                    value={formData.convenio_id}
                    onChange={(e) => setFormData({ ...formData, convenio_id: e.target.value, tabela_emprestimo_id: '' })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    required
                  >
                    <option value="">Selecione...</option>
                    {convenios.map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowConvenioModal(true)}
                    title="Cadastrar novo convênio"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>Tabela</Label>
                <select
                  value={formData.tabela_emprestimo_id}
                  onChange={(e) => handleTabelaChange(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  disabled={!formData.banco || !formData.convenio_id}
                >
                  <option value="">Selecione...</option>
                  {tabelasEmprestimo
                    .filter(t => {
                      const bancoMatch = !formData.banco || t.banco === formData.banco;
                      const convenioMatch = !formData.convenio_id || t.convenio_id === formData.convenio_id;
                      
                      // Filtrar por tipo de consignado
                      let tipoMatch = true;
                      if (formData.tipo_consignado === 'NOVO') {
                        tipoMatch = t.produto === 'NOVO' || t.produto === 'Margem Livre';
                      } else if (formData.tipo_consignado === 'REFINANCIAMENTO') {
                        tipoMatch = t.produto === 'REFINANCIAMENTO';
                      } else if (formData.tipo_consignado === 'PORTABILIDADE_PURA') {
                        tipoMatch = t.produto === 'PORTABILIDADE';
                      } else if (formData.tipo_consignado === 'REFIN_PORTABILIDADE') {
                        tipoMatch = t.produto === 'REFIN/PORTABILIDADE';
                      }
                      
                      return bancoMatch && convenioMatch && tipoMatch;
                    })
                    .map(t => (
                      <option key={t.id} value={t.id}>{t.tabela || t.nome}</option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Número do Benefício</Label>
                <Input value={formData.numero_beneficio} onChange={(e) => setFormData({ ...formData, numero_beneficio: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Vendedor/Parceiro</Label>
                <select
                  value={formData.vendedor_parceiro_id}
                  onChange={(e) => setFormData({ ...formData, vendedor_parceiro_id: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">Selecione...</option>
                  {vendedores.map(v => (
                    <option key={v.id} value={v.id}>{v.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Empresa Parceira</Label>
                <select
                  value={formData.empresa_parceira}
                  onChange={(e) => setFormData({ ...formData, empresa_parceira: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">Selecione...</option>
                  {empresasParceiras.map(ep => (
                    <option key={ep.id} value={ep.nome}>{ep.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            {renderCamposPorTipo()}

          </CardContent>
        </Card>
        )}

        {/* Step 3: Estrutura de Comissões */}
        {currentStep === 3 && (user?.perfil === 'admin' || user?.perfil === 'gerente' || user?.perfil === 'super_admin' || user?.perfil === 'master') && (
          <Card className="border-l-4 border-l-green-500 bg-gradient-to-br from-green-50/50 to-white">
            <CardHeader className="bg-green-50/50 border-b">
              <CardTitle className="flex items-center gap-2 text-green-900">
                <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-bold">3</span>
                </div>
                Estrutura de Comissões
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>% Comissão Empresa</Label>
                    <Input 
                      type="number" 
                      step="0.01"
                      value={formData.percentual_comissao_empresa} 
                      onChange={(e) => setFormData({ ...formData, percentual_comissao_empresa: e.target.value })}
                      placeholder="0.00"
                      className={formData.percentual_comissao_empresa ? 'bg-green-50 border-green-300' : ''}
                    />
                  </div>
                  <div>
                    <Label>Comissão Empresa Prevista</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                      <Input 
                        className="pl-10 bg-slate-50"
                        value={formatarMoeda(formData.comissao_empresa_prevista)}
                        readOnly
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Comissão Empresa Recebida</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                      <Input 
                        className="pl-10"
                        value={formatarMoeda(formData.comissao_empresa_recebida)} 
                        onChange={(e) => handleMoedaChange('comissao_empresa_recebida', e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>% Comissão Vendedor</Label>
                    <Input 
                      type="number" 
                      step="0.01"
                      value={formData.percentual_comissao_vendedor} 
                      onChange={(e) => setFormData({ ...formData, percentual_comissao_vendedor: e.target.value })}
                      placeholder="0.00"
                      className={formData.percentual_comissao_vendedor ? 'bg-green-50 border-green-300' : ''}
                    />
                  </div>
                  <div>
                    <Label>Comissão Vendedor Prevista</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                      <Input 
                        className="pl-10 bg-slate-50"
                        value={formatarMoeda(formData.comissao_vendedor_prevista)}
                        readOnly
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Comissão Vendedor Paga</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                      <Input 
                        className="pl-10"
                        value={formatarMoeda(formData.comissao_vendedor_paga)} 
                        onChange={(e) => handleMoedaChange('comissao_vendedor_paga', e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                </div>
            </CardContent>
          </Card>
        )}

        {user?.perfil === 'vendedor' && formData.comissao_vendedor_prevista && currentStep === 3 && (
          <Card className="border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-50/50 to-white">
            <CardHeader className="bg-amber-50/50 border-b">
              <CardTitle className="flex items-center gap-2 text-amber-900">
                <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-bold">3</span>
                </div>
                Sua Comissão
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Percentual</Label>
                    <Input 
                      value={formData.percentual_comissao_vendedor + '%'}
                      readOnly
                      className="bg-slate-50"
                    />
                  </div>
                  <div>
                    <Label>Valor Previsto</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                      <Input 
                        className="pl-10 bg-slate-50"
                        value={formatarMoeda(formData.comissao_vendedor_prevista)}
                        readOnly
                      />
                    </div>
                  </div>
                </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Revisão Final */}
        {currentStep === 4 && (
          <Card className="border-l-4 border-l-orange-500 bg-gradient-to-br from-orange-50/50 to-white">
            <CardHeader className="bg-orange-50/50 border-b">
              <CardTitle className="flex items-center gap-2 text-orange-900">
                <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-bold">4</span>
                </div>
                Revisão Final
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-3">Resumo da Proposta</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-600">Cliente</p>
                      <p className="font-semibold text-slate-900">{clienteSelecionado?.nome_completo || clienteSelecionado?.pj_razao_social}</p>
                    </div>
                    <div>
                      <p className="text-slate-600">Banco</p>
                      <p className="font-semibold text-slate-900">{formData.banco}</p>
                    </div>
                    <div>
                      <p className="text-slate-600">Valor Liberado</p>
                      <p className="font-semibold text-slate-900">R$ {formatarMoeda(formData.valor_liberado)}</p>
                    </div>
                    <div>
                      <p className="text-slate-600">Prazo</p>
                      <p className="font-semibold text-slate-900">{formData.prazo} meses</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Número ADE</Label>
                  <Input value={formData.numero_ade} onChange={(e) => setFormData({ ...formData, numero_ade: e.target.value })} />
                </div>
                <div>
                  <Label>Número do Contrato</Label>
                  <Input value={formData.numero_contrato} onChange={(e) => setFormData({ ...formData, numero_contrato: e.target.value })} />
                </div>
              </div>

              <div>
                <Label>Status</Label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
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
              </div>

              <div>
                <Label>Observações</Label>
                <textarea
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Botões de Navegação */}
        <div className="flex gap-3 justify-between pt-6 border-t sticky bottom-0 bg-white p-6 -mx-6 rounded-b-lg">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => {
              if (currentStep === 1) navigate(-1);
              else setCurrentStep(currentStep - 1);
            }}
          >
            {currentStep === 1 ? 'Cancelar' : 'Anterior'}
          </Button>
          
          <div className="flex gap-2">
            {currentStep < 4 && (
              <Button 
                type="button" 
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={currentStep === 1 && !clienteSelecionado}
                className="bg-slate-500 hover:bg-slate-600"
              >
                Próximo
              </Button>
            )}
            {currentStep === 4 && (
              <Button 
                type="submit" 
                disabled={criarVendaMutation.isPending} 
                className="bg-[#23BE84] hover:bg-[#1da570]"
              >
                {criarVendaMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Proposta'
                )}
              </Button>
            )}
          </div>
        </div>
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

      <ConvenioFormModal
        open={showConvenioModal}
        onOpenChange={setShowConvenioModal}
        isLoading={salvandoConvenio}
        onSubmit={async (dados) => {
          setSalvandoConvenio(true);
          try {
            const novoConvenio = await base44.entities.Convenio.create({
              empresa_id: empresaId,
              nome: dados.nome,
              tipo: dados.tipo,
              ativo: true
            });
            
            await queryClient.invalidateQueries({ queryKey: ['convenios', empresaId] });
            
            setFormData({ ...formData, convenio_id: novoConvenio.id });
            setShowConvenioModal(false);
            toast.success('Convênio cadastrado com sucesso!');
            return novoConvenio;
          } catch (error) {
            toast.error('Erro ao cadastrar convênio: ' + error.message);
            return null;
          } finally {
            setSalvandoConvenio(false);
          }
        }}
      />

      <BancoFormModal
        open={showBancoModal}
        onOpenChange={setShowBancoModal}
        isLoading={salvandoBanco}
        onSubmit={async (dados) => {
          setSalvandoBanco(true);
          try {
            const novoBanco = await base44.entities.Banco.create({
              empresa_id: empresaId,
              nome: dados.nome,
              codigo: dados.codigo,
              ativo: true
            });
            
            await queryClient.invalidateQueries({ queryKey: ['bancos', empresaId] });
            
            setFormData({ ...formData, banco: novoBanco.nome });
            setShowBancoModal(false);
            toast.success('Banco cadastrado com sucesso!');
            return novoBanco;
          } catch (error) {
            toast.error('Erro ao cadastrar banco: ' + error.message);
            return null;
          } finally {
            setSalvandoBanco(false);
          }
        }}
      />
    </div>
  );
}