import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import ClienteSearchModal from '@/components/forms/ClienteSearchModal';
import ConvenioFormModal from '@/components/forms/ConvenioFormModal';
import BancoFormModal from '@/components/forms/BancoFormModal';

export default function NovaVendaConsignado() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
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

  const { data: empresasParceiras = [] } = useQuery({
    queryKey: ['empresas-parceiras', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.EmpresaParceira.filter({ empresa_id: empresaId, ativo: true }, 'nome')
  });

  const criarVendaMutation = useMutation({
    mutationFn: async (dados) => {
      const convenioSelecionado = convenios.find(c => c.id === dados.convenio_id);
      const vendedorSelecionado = vendedores.find(v => v.id === dados.vendedor_parceiro_id);

      const vendaBase = await base44.entities.VendaBase.create({
        empresa_id: empresaId,
        produto: 'EMPRESTIMO_CONSIGNADO',
        tipo: dados.tipo_consignado,
        cliente_id: clienteSelecionado.id,
        cliente_nome: clienteSelecionado.nome_completo || clienteSelecionado.pj_razao_social,
        usuario_digitador_id: user.id,
        usuario_digitador_nome: user.full_name,
        vendedor_id: vendedorSelecionado?.id || user.id,
        vendedor_nome: vendedorSelecionado?.nome || user.full_name,
        empresa_parceira: dados.empresa_parceira || dados.banco,
        status: dados.status,
        valor_total: parseFloat(dados.valor_liberado) || 0,
        data_venda: new Date().toISOString().split('T')[0],
        observacoes: dados.observacoes
      });

      await base44.entities.VendaConsignado.create({
        venda_base_id: vendaBase.id,
        tipo_consignado: dados.tipo_consignado,
        numero_ade: dados.numero_ade,
        numero_contrato: dados.numero_contrato,
        convenio_id: dados.convenio_id,
        convenio_nome: convenioSelecionado?.nome || '',
        numero_beneficio: dados.numero_beneficio,
        banco: dados.banco,
        valor_liberado: parseFloat(dados.valor_liberado) || 0,
        valor_bruto: parseFloat(dados.valor_bruto) || 0,
        prazo: parseInt(dados.prazo) || 0,
        parcela: parseFloat(dados.parcela) || 0,
        data_liberacao: dados.data_liberacao || null,
        banco_anterior: dados.banco_anterior,
        saldo_devedor: parseFloat(dados.saldo_devedor) || 0,
        prazo_restante: parseInt(dados.prazo_restante) || 0,
        prazo_original: parseInt(dados.prazo_original) || 0,
        contrato_anterior: dados.contrato_anterior,
        data_inicio: dados.data_inicio || null,
        vendedor_parceiro_id: dados.vendedor_parceiro_id || null,
        vendedor_parceiro_nome: vendedorSelecionado?.nome || '',
        tabela_comissao_id: dados.tabela_comissao_id || null,
        percentual_comissao_empresa: parseFloat(dados.percentual_comissao_empresa) || 0,
        comissao_empresa_prevista: parseFloat(dados.comissao_empresa_prevista) || 0,
        comissao_empresa_recebida: parseFloat(dados.comissao_empresa_recebida) || 0,
        percentual_comissao_vendedor: parseFloat(dados.percentual_comissao_vendedor) || 0,
        comissao_vendedor_prevista: parseFloat(dados.comissao_vendedor_prevista) || 0,
        comissao_vendedor_paga: parseFloat(dados.comissao_vendedor_paga) || 0,
        status: dados.status
      });

      return vendaBase;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendas'] });
      toast.success('Empréstimo consignado cadastrado com sucesso!');
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nova Proposta - Empréstimo Consignado"
        subtitle="Cadastre um novo empréstimo consignado"
        backTo="NovaVenda"
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Módulo Cliente */}
        <Card className="border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-50/50 to-white">
          <CardHeader className="bg-purple-50/50 border-b">
            <CardTitle className="flex items-center gap-2 text-purple-900">
              <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">1</span>
              </div>
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div>
              <Label>Cliente *</Label>
              {clienteSelecionado ? (
                <div className="flex items-center justify-between p-4 bg-purple-100 rounded-lg border-2 border-purple-300">
                  <span className="font-semibold text-purple-900">{clienteSelecionado.nome_completo || clienteSelecionado.pj_razao_social}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowClienteModal(true)}>
                    Alterar
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full h-12 border-2 border-dashed" onClick={() => setShowClienteModal(true)}>
                  + Selecionar Cliente
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Módulo Proposta */}
        <Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50/50 to-white">
          <CardHeader className="bg-blue-50/50 border-b">
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">2</span>
              </div>
              Dados da Proposta
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
                <Label>Tipo de Consignado *</Label>
                <select
                  value={formData.tipo_consignado}
                  onChange={(e) => setFormData({ ...formData, tipo_consignado: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  required
                >
                  <option value="NOVO">Novo</option>
                  <option value="REFINANCIAMENTO">Refinanciamento</option>
                  <option value="PORTABILIDADE_PURA">Portabilidade Pura</option>
                  <option value="REFIN_PORTABILIDADE">Refin + Portabilidade</option>
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
                      return bancoMatch && convenioMatch;
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

        {/* Módulo Comissões */}
        {(user?.perfil === 'admin' || user?.perfil === 'gerente' || user?.perfil === 'super_admin' || user?.perfil === 'master') && (
          <Card className="border-l-4 border-l-green-500 bg-gradient-to-br from-green-50/50 to-white">
            <CardHeader className="bg-green-50/50 border-b">
              <CardTitle className="flex items-center gap-2 text-green-900">
                <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-bold">3</span>
                </div>
                Comissões
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
                      readOnly
                      className="bg-slate-50"
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
                      readOnly
                      className="bg-slate-50"
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

        {user?.perfil === 'vendedor' && formData.comissao_vendedor_prevista && (
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

        {/* Módulo Finalização */}
        <Card className="border-l-4 border-l-slate-500 bg-gradient-to-br from-slate-50/50 to-white">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <div className="w-8 h-8 bg-slate-500 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">4</span>
              </div>
              Finalização
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
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
                <option value="em_andamento">Em andamento</option>
                <option value="pendente">Pendente</option>
                <option value="aguardando_formalizacao">Aguardando formalização</option>
                <option value="aguardando_cip">Aguardando CIP</option>
                <option value="saldo_retornado">Saldo retornado</option>
                <option value="aguardando_pagamento">Aguardando pagamento</option>
                <option value="pago">Pago</option>
                <option value="cancelado">Cancelado</option>
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

            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => navigate('/NovaVenda')}>
                Cancelar
              </Button>
              <Button type="submit" disabled={criarVendaMutation.isPending} className="bg-[#23BE84] hover:bg-[#1da570]">
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