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
  const [alfabetizado, setAlfabetizado] = useState(null); // null | true | false
  const [grauEscolaridade, setGrauEscolaridade] = useState('');

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
    data_cadastro: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
    data_liberacao: '',
    banco_anterior: '',
    saldo_devedor: '',
    prazo_restante: '',
    prazo_original: '',
    contrato_anterior: '',
    data_inicio: '',
    // Campos de Portabilidade
    origem_banco: '',
    origem_contrato: '',
    origem_parcela: '',
    origem_prazo: '',
    origem_prazo_restante: '',
    origem_saldo_devedor: '',
    origem_tabela: '',
    // Campos de Refinanciamento (Porto + Refin)
    refin_parcela: '',
    refin_valor_bruto: '',
    refin_valor_liberado: '',
    refin_prazo: '',
    refin_tabela: '',
    vendedor_parceiro_id: '',
    tabela_comissao_id: '',
    valor_base_comissao: '',
    percentual_comissao_empresa: '',
    comissao_empresa_prevista: '',
    comissao_empresa_recebida: '',
    percentual_comissao_vendedor: '',
    comissao_vendedor_prevista: '',
    comissao_vendedor_paga: '',
    status: 'aguardando_digitacao',
    empresa_parceira: '',
    empresa_parceira_id: '',
    empresa_parceira_nome: '',
    observacoes: '',
    testemunha1_nome: '',
    testemunha1_cpf: '',
    testemunha1_telefone: '',
    testemunha1_endereco: '',
    testemunha2_nome: '',
    testemunha2_cpf: '',
    testemunha2_telefone: '',
    testemunha2_endereco: ''
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();

    if (me.role === 'super_admin' || me.perfil === 'super_admin') {
      setUser({ ...me, perfil: 'super_admin' });
      const empresas = await base44.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) setEmpresaId(empresas[0].id);
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) {
        const colab = colabs[0];
        setUser({ ...me, perfil: colab.perfil, colaborador_id: colab.id, colaborador_nome: colab.nome });
        setEmpresaId(colab.empresa_id);
        // Se for vendedor, pré-selecionar ele mesmo como vendedor da proposta
        if (colab.perfil === 'vendedor' || colab.perfil === 'funcionario') {
          setFormData(prev => ({ ...prev, vendedor_parceiro_id: colab.id }));
        }
      } else {
        setUser(me);
      }
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

  // Quando os status personalizados carregarem, inicializar o formData.status com o primeiro
  useEffect(() => {
    if (statusPropostas && statusPropostas.length > 0) {
      const primeiroStatus = statusPropostas.find(s => s.tipo === 'principal' || !s.tipo);
      if (primeiroStatus) {
        setFormData(prev => ({ ...prev, status: primeiroStatus.codigo || primeiroStatus.slug || '' }));
      }
    }
  }, [statusPropostas]);

  const criarVendaMutation = useMutation({
    mutationFn: async (dados) => {
      const convenioSelecionado = convenios.find((c) => c.id === dados.convenio_id);
      const vendedorSelecionado = vendedores.find((v) => v.id === dados.vendedor_parceiro_id);

      // Vendedor: se for perfil vendedor, forçar ele mesmo; senão usar selecionado
      const isVendedorPerfil = user?.perfil === 'vendedor' || user?.perfil === 'funcionario';
      const vendedorId = isVendedorPerfil ? user.colaborador_id : (vendedorSelecionado?.id || user.colaborador_id || user.id);
      const vendedorNome = isVendedorPerfil ? (user.colaborador_nome || user.full_name) : (vendedorSelecionado?.nome || user.full_name);

      const proposta = await base44.entities.Proposta.create({
        empresa_id: empresaId,
        produto: 'emprestimo',
        cliente_id: clienteSelecionado.id,
        cliente_nome: clienteSelecionado.nome_completo || clienteSelecionado.pj_razao_social,
        cliente_cpf: clienteSelecionado.cpf || '',
        vendedor_id: vendedorId,
        vendedor_nome: vendedorNome,
        administradora_id: '',
        administradora_nome: dados.banco || '',
        contrato: dados.numero_contrato,
        status: dados.status,
        data_venda: dados.data_cadastro || new Date().toISOString().split('T')[0],
        valor_credito: parseFloat(dados.valor_bruto) || parseFloat(dados.valor_liberado) || 0,
        valor_liquido: parseFloat(dados.valor_liberado) || 0,
        valor_comissao: parseFloat(dados.comissao_empresa_prevista) || 0,
        comissao_recebida: parseFloat(dados.comissao_empresa_recebida) || 0,
        observacoes: dados.observacoes,
        tabela_comissao_id: dados.tabela_emprestimo_id || dados.tabela_comissao_id || '',
        percentual_comissao_vendedor: parseFloat(dados.percentual_comissao_vendedor) || 0,
        valor_comissao_vendedor_pago: parseFloat(dados.comissao_vendedor_paga) || 0,
        emprestimo_tipo: dados.tipo_consignado,
        emprestimo_convenio_id: dados.convenio_id,
        emprestimo_convenio_nome: convenioSelecionado?.nome || '',
        emprestimo_numero_beneficio: dados.numero_beneficio,
        emprestimo_numero_ade: dados.numero_ade,
        emprestimo_prazo: parseInt(dados.prazo) || parseInt(dados.prazo_restante) || 0,
        emprestimo_valor_parcela: parseFloat(dados.parcela) || 0,
        emprestimo_saldo_devedor: parseFloat(dados.saldo_devedor) || 0,
        emprestimo_data_liberacao: dados.data_liberacao || null,
        emprestimo_banco_anterior: dados.banco_anterior,
        empresa_parceira_id: dados.empresa_parceira_id || '',
        empresa_parceira_nome: dados.empresa_parceira_nome || dados.empresa_parceira || '',
        testemunha1_nome: dados.testemunha1_nome || '',
        testemunha1_cpf: dados.testemunha1_cpf || '',
        testemunha1_telefone: dados.testemunha1_telefone || '',
        testemunha1_endereco: dados.testemunha1_endereco || '',
        testemunha2_nome: dados.testemunha2_nome || '',
        testemunha2_cpf: dados.testemunha2_cpf || '',
        testemunha2_telefone: dados.testemunha2_telefone || '',
        testemunha2_endereco: dados.testemunha2_endereco || '',
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
    // Contrato é obrigatório apenas quando o status não for "aguardando digitação"
    const statusAtual = formData.status || '';
    const isAguardandoDigitacao = statusAtual.toLowerCase().includes('aguardando') && statusAtual.toLowerCase().includes('digit');
    const statusObj = statusPropostas.find(s => (s.codigo || s.slug) === statusAtual);
    const nomeStatus = (statusObj?.nome || '').toLowerCase();
    const isAguardandoDigitacaoPorNome = nomeStatus.includes('aguardando') && nomeStatus.includes('digit');

    if (!isAguardandoDigitacao && !isAguardandoDigitacaoPorNome && !formData.numero_contrato) {
      toast.error('Número do Contrato é obrigatório para o status selecionado');
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

  const TIPOS_BRUTO_IGUAL_LIBERADO = ['NOVO', 'REFINANCIAMENTO', 'CARTAO', 'CARTAO_BENEFICIO', 'CARTAO_CONSIGNADO', 'SAQUE'];

  const handleMoedaChange = (campo, valor) => {
    const numero = valor.replace(/\D/g, '');
    const novoValor = (parseFloat(numero) / 100).toFixed(2);
    let novoForm = { ...formData, [campo]: novoValor };

    // Quando preencher valor_liberado em tipos onde bruto = líquido, replicar para valor_bruto automaticamente
    if (campo === 'valor_liberado' && TIPOS_BRUTO_IGUAL_LIBERADO.includes(formData.tipo_consignado)) {
      novoForm.valor_bruto = novoValor;
    }

    // Recalcular comissões se for valor_liberado ou prazo
    if (campo === 'valor_liberado') {
      calcularComissoes(novoForm);
    } else {
      setFormData(novoForm);
    }
  };

  const calcularComissoes = (dadosForm) => {
    const valorLiberado = parseFloat(dadosForm.valor_liberado) || 0;
    const valorBruto = parseFloat(dadosForm.valor_bruto) || 0;
    const prazo = parseInt(dadosForm.prazo) || 0;
    const tipo = dadosForm.tipo_consignado;
    const convenioId = dadosForm.convenio_id;
    const banco = dadosForm.banco;

    // Buscar tabela de comissão aplicável
    const tabelaAplicavel = tabelasComissao.find((t) => {
      const tipoMatch = t.tipo_operacao === tipo;
      const convenioMatch = !t.convenio_id || t.convenio_id === convenioId;
      const bancoMatch = !t.banco || t.banco === banco;
      const prazoMatch = prazo >= t.prazo_min && prazo <= t.prazo_max;
      return tipoMatch && convenioMatch && bancoMatch && prazoMatch;
    });

    // Calcular base de comissão automática (se não foi editada manualmente)
    const tabelaBaseComissao = tabelaAplicavel?.base_comissao || null;
    const baseAuto = getBaseComissaoAutomatica(tipo, valorLiberado, valorBruto, tabelaBaseComissao);

    // Usar o valor_base_comissao já no form se foi preenchido manualmente, senão auto
    const base = parseFloat(dadosForm.valor_base_comissao) > 0 ? parseFloat(dadosForm.valor_base_comissao) : baseAuto;

    if (tabelaAplicavel && base > 0) {
      const comissaoEmpresa = base * tabelaAplicavel.percentual_comissao_empresa / 100;
      const comissaoVendedor = base * tabelaAplicavel.percentual_comissao_vendedor / 100;

      setFormData({
        ...dadosForm,
        valor_base_comissao: baseAuto.toFixed(2),
        tabela_comissao_id: tabelaAplicavel.id,
        percentual_comissao_empresa: tabelaAplicavel.percentual_comissao_empresa,
        comissao_empresa_prevista: comissaoEmpresa.toFixed(2),
        percentual_comissao_vendedor: tabelaAplicavel.percentual_comissao_vendedor,
        comissao_vendedor_prevista: comissaoVendedor.toFixed(2)
      });
    } else {
      setFormData({
        ...dadosForm,
        valor_base_comissao: baseAuto > 0 ? baseAuto.toFixed(2) : dadosForm.valor_base_comissao,
        tabela_comissao_id: '',
        percentual_comissao_empresa: '',
        comissao_empresa_prevista: '',
        percentual_comissao_vendedor: '',
        comissao_vendedor_prevista: ''
      });
    }
  };

  // Determina a base de comissão automática pelo tipo de empréstimo
  const getBaseComissaoAutomatica = (tipo, valorLiberado, valorBruto, tabelaBaseComissao) => {
    const tipoUp = (tipo || '').toUpperCase();
    if (['NOVO', 'REFINANCIAMENTO', 'CARTAO', 'CARTAO_CONSIGNADO', 'CARTAO_BENEFICIO', 'SAQUE'].includes(tipoUp)) {
      return parseFloat(valorLiberado) || 0;
    }
    if (tipoUp === 'PORTABILIDADE' || (tipoUp.includes('PORTABILIDADE') && !tipoUp.includes('REFIN'))) {
      return parseFloat(valorBruto) || parseFloat(valorLiberado) || 0;
    }
    if (tipoUp === 'REFIN_PORTABILIDADE' || tipoUp === 'PORTABILIDADE_REFIN' || (tipoUp.includes('PORTABILIDADE') && tipoUp.includes('REFIN'))) {
      // A tabela determina: se tabela tem base_comissao='bruto' usa bruto, senão líquido
      if (tabelaBaseComissao === 'bruto') return parseFloat(valorBruto) || 0;
      return parseFloat(valorLiberado) || 0;
    }
    return parseFloat(valorLiberado) || 0;
  };

  // Recalcular quando prazo, tipo, convênio ou banco mudar
  useEffect(() => {
    if (formData.valor_liberado && formData.prazo) {
      calcularComissoes(formData);
    }
  }, [formData.prazo, formData.tipo_consignado, formData.convenio_id, formData.banco]);

  // Aplicar comissões da tabela selecionada
  const handleTabelaChange = (tabelaId) => {
    const tabela = tabelasEmprestimo.find((t) => t.id === tabelaId);
    if (tabela) {
      const valorLiberado = parseFloat(formData.valor_liberado) || 0;
      const valorBruto = parseFloat(formData.valor_bruto) || 0;
      // A tabela pode definir a base (bruto ou líquido), especialmente para REFIN_PORTABILIDADE
      const base = getBaseComissaoAutomatica(
        formData.tipo_consignado,
        valorLiberado,
        valorBruto,
        tabela.base_comissao || null
      );
      const comissaoEmpresa = base > 0 ? base * tabela.comissao_empresa / 100 : 0;
      const comissaoVendedor = base > 0 ? base * (tabela.comissao_corretor || 0) / 100 : 0;

      setFormData({
        ...formData,
        tabela_emprestimo_id: tabelaId,
        valor_base_comissao: base > 0 ? base.toFixed(2) : formData.valor_base_comissao,
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

  // Atualiza base automaticamente quando tipo ou valores mudam (sem tabela de comissão manual)
  useEffect(() => {
    if (!formData.tabela_emprestimo_id) {
      const valorLiberado = parseFloat(formData.valor_liberado) || 0;
      const valorBruto = parseFloat(formData.valor_bruto) || 0;
      const baseAuto = getBaseComissaoAutomatica(formData.tipo_consignado, valorLiberado, valorBruto, null);
      if (baseAuto > 0) {
        setFormData((prev) => ({ ...prev, valor_base_comissao: baseAuto.toFixed(2) }));
      }
    }
  }, [formData.tipo_consignado, formData.valor_liberado, formData.valor_bruto]);

  // Recalcular comissões quando valor mudar e tabela estiver selecionada
  useEffect(() => {
    if (formData.tabela_emprestimo_id && (formData.valor_liberado || formData.valor_bruto)) {
      const tabela = tabelasEmprestimo.find((t) => t.id === formData.tabela_emprestimo_id);
      if (tabela) {
        const valorLiberado = parseFloat(formData.valor_liberado) || 0;
        const valorBruto = parseFloat(formData.valor_bruto) || 0;
        // Usa base_comissao manual se existir, senão recalcula automático
        const baseManual = parseFloat(formData.valor_base_comissao) || 0;
        const baseAuto = getBaseComissaoAutomatica(formData.tipo_consignado, valorLiberado, valorBruto, tabela.base_comissao || null);
        const base = baseManual > 0 ? baseManual : baseAuto;
        const comissaoEmpresa = base > 0 ? base * tabela.comissao_empresa / 100 : 0;
        const comissaoVendedor = base > 0 ? base * (tabela.comissao_corretor || 0) / 100 : 0;
        setFormData((prev) => ({
          ...prev,
          valor_base_comissao: baseAuto > 0 ? baseAuto.toFixed(2) : prev.valor_base_comissao,
          percentual_comissao_empresa: tabela.comissao_empresa,
          comissao_empresa_prevista: comissaoEmpresa.toFixed(2),
          percentual_comissao_vendedor: tabela.comissao_corretor || 0,
          comissao_vendedor_prevista: comissaoVendedor.toFixed(2)
        }));
      }
    }
  }, [formData.valor_liberado, formData.valor_bruto, formData.tabela_emprestimo_id]);

  const tipoAtual = (formData.tipo_consignado || '').toUpperCase();
  const isPortabilidade = tipoAtual === 'PORTABILIDADE' || tipoAtual.includes('PORTABILIDADE') && !tipoAtual.includes('REFIN');
  const isRefinPortabilidade = (tipoAtual === 'REFIN_PORTABILIDADE' || tipoAtual === 'PORTABILIDADE_REFIN' || (tipoAtual.includes('PORTABILIDADE') && tipoAtual.includes('REFIN')));

  const renderCamposPorTipo = () => {
    if (['NOVO', 'REFINANCIAMENTO', 'CARTAO', 'CARTAO_BENEFICIO', 'CARTAO_CONSIGNADO', 'SAQUE'].includes(tipoAtual)) {
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
                  required />
                
              </div>
            </div>
            <div>
              <Label className="flex items-center gap-1">
                Valor Base Comissão
                <span className="text-xs text-slate-400 font-normal">(= Vl. Líquido)</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                <Input
                  className="pl-10 bg-amber-50 border-amber-200"
                  value={formatarMoeda(formData.valor_base_comissao)}
                  onChange={(e) => handleMoedaChange('valor_base_comissao', e.target.value)}
                  placeholder="0,00" />
                
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
                  placeholder="0,00" />
                
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
                  placeholder="0,00" />
                
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Data de Cadastro</Label>
              <Input type="date" value={formData.data_cadastro} onChange={(e) => setFormData({ ...formData, data_cadastro: e.target.value })} />
            </div>
            <div>
              <Label>Data de Liberação</Label>
              <Input type="date" value={formData.data_liberacao} onChange={(e) => setFormData({ ...formData, data_liberacao: e.target.value })} />
            </div>
          </div>
        </>);

    }

    if (isPortabilidade && !isRefinPortabilidade) {
      return (
        <div className="space-y-3">
          {/* Dados do contrato de origem - apenas portabilidade, sem seção de refin */}
          <div className="border-l-4 border-l-purple-500 pl-4 py-2 bg-purple-50 rounded space-y-2">
            <h3 className="font-semibold text-purple-900">Informações da Portabilidade</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Código do Banco</Label>
                <Input
                  value={formData.origem_banco}
                  onChange={(e) => setFormData({ ...formData, origem_banco: e.target.value })}
                  placeholder="Ex: 341, 001, 033..." />
                
              </div>
              <div>
                <Label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Banco*</Label>
                <select
                  value={formData.banco_anterior}
                  onChange={(e) => setFormData({ ...formData, banco_anterior: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  required>
                  
                  <option value="">Selecione o banco...</option>
                  {bancos.map((b) =>
                  <option key={b.id} value={b.nome}>{b.nome}</option>
                  )}
                </select>
              </div>
              <div>
                <Label>Contrato Portado *</Label>
                <Input value={formData.origem_contrato} onChange={(e) => setFormData({ ...formData, origem_contrato: e.target.value })} required />
              </div>
              <div>
                <Label>Parcela *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                  <Input className="pl-10" value={formatarMoeda(formData.origem_parcela)} onChange={(e) => handleMoedaChange('origem_parcela', e.target.value)} required />
                </div>
              </div>
              <div>
                <Label>Saldo Devedor *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                  <Input className="pl-10" value={formatarMoeda(formData.origem_saldo_devedor)} onChange={(e) => handleMoedaChange('origem_saldo_devedor', e.target.value)} required />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Qt. Parcelas a Vencer *</Label>
                <Input type="number" placeholder="Ex: 48" value={formData.origem_prazo_restante} onChange={(e) => setFormData({ ...formData, origem_prazo_restante: e.target.value })} required />
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  Valor Base Comissão
                  <span className="text-xs text-slate-400 font-normal">(= Vl. Bruto)</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                  <Input
                    className="pl-10 bg-amber-50 border-amber-200"
                    value={formatarMoeda(formData.valor_base_comissao)}
                    onChange={(e) => handleMoedaChange('valor_base_comissao', e.target.value)}
                    placeholder="0,00" />
                </div>
              </div>
            </div>
          </div>

        </div>);

    }

    if (isRefinPortabilidade) {
      return (
        <div className="space-y-3">
          {/* Seção Portabilidade - idêntica à PORTABILIDADE */}
          <div className="border-l-4 border-l-purple-500 pl-4 py-2 bg-purple-50 rounded space-y-2">
            <h3 className="font-semibold text-purple-900">Informações da Portabilidade</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Código do Banco</Label>
                <Input value={formData.origem_banco} onChange={(e) => setFormData({ ...formData, origem_banco: e.target.value })} placeholder="Ex: 341, 001, 033..." />
              </div>
              <div>
                <Label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Banco*</Label>
                <select value={formData.banco_anterior} onChange={(e) => setFormData({ ...formData, banco_anterior: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" required>
                  <option value="">Selecione o banco...</option>
                  {bancos.map((b) => <option key={b.id} value={b.nome}>{b.nome}</option>)}
                </select>
              </div>
              <div>
                <Label>Contrato Portado *</Label>
                <Input value={formData.origem_contrato} onChange={(e) => setFormData({ ...formData, origem_contrato: e.target.value })} required />
              </div>
              <div>
                <Label>Parcela *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                  <Input className="pl-10" value={formatarMoeda(formData.origem_parcela)} onChange={(e) => handleMoedaChange('origem_parcela', e.target.value)} required />
                </div>
              </div>
              <div>
                <Label>Saldo Devedor *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                  <Input className="pl-10" value={formatarMoeda(formData.origem_saldo_devedor)} onChange={(e) => handleMoedaChange('origem_saldo_devedor', e.target.value)} required />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Qt. Parcelas a Vencer *</Label>
                <Input type="number" placeholder="Ex: 48" value={formData.origem_prazo_restante} onChange={(e) => setFormData({ ...formData, origem_prazo_restante: e.target.value })} required />
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  Valor Base Comissão
                  <span className="text-xs text-slate-400 font-normal">(= Vl. Bruto)</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                  <Input className="pl-10 bg-amber-50 border-amber-200" value={formatarMoeda(formData.valor_base_comissao)} onChange={(e) => handleMoedaChange('valor_base_comissao', e.target.value)} placeholder="0,00" />
                </div>
              </div>
            </div>
          </div>

          {/* Seção Refin - idêntica à seção azul de PORTABILIDADE */}
          <div className="border-l-4 border-l-blue-500 pl-4 py-2 bg-blue-50 rounded space-y-2">
            <h3 className="font-semibold text-blue-900">Informações do Refin da Portabilidade</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Valor Liberado *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                  <Input className="pl-10" value={formatarMoeda(formData.valor_liberado)} onChange={(e) => handleMoedaChange('valor_liberado', e.target.value)} placeholder="0,00" required />
                </div>
              </div>
              <div>
                <Label>Prazo (meses) *</Label>
                <Input type="number" placeholder="Ex: 84" value={formData.prazo} onChange={(e) => setFormData({ ...formData, prazo: e.target.value })} required />
              </div>
              <div>
                <Label>Parcela *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                  <Input className="pl-10" value={formatarMoeda(formData.parcela)} onChange={(e) => handleMoedaChange('parcela', e.target.value)} placeholder="0,00" required />
                </div>
              </div>
            </div>
          </div>
        </div>);

    }
  };

  if (!user || !empresaId) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>);

  }

  const stepLabels = ['Informações do Cliente', 'Detalhes da Proposta', 'Testemunhas', 'Estrutura de Comissões', 'Revisão Final'];
  const stepColors = ['teal', 'blue', 'purple', 'green', 'orange'];

  const getStepColor = (step) => {
    const colors = {
      teal: 'bg-teal-100 text-teal-900 border-teal-200',
      blue: 'bg-blue-100 text-blue-900 border-blue-200',
      purple: 'bg-purple-100 text-purple-900 border-purple-200',
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
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          
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
              teal: isActive ? 'bg-teal-100 border-teal-300' : isCompleted ? 'bg-teal-50 border-teal-200' : 'bg-slate-50 border-slate-200',
              blue: isActive ? 'bg-blue-100 border-blue-300' : isCompleted ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200',
              purple: isActive ? 'bg-purple-100 border-purple-300' : isCompleted ? 'bg-purple-50 border-purple-200' : 'bg-slate-50 border-slate-200',
              green: isActive ? 'bg-green-100 border-green-300' : isCompleted ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200',
              orange: isActive ? 'bg-orange-100 border-orange-300' : isCompleted ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200'
            };

            const badgeMap = {
              teal: 'bg-[#10353C] text-white',
              blue: 'bg-blue-500 text-white',
              purple: 'bg-purple-500 text-white',
              green: 'bg-green-500 text-white',
              orange: 'bg-orange-500 text-white'
            };

            return (
              <button
                key={step}
                onClick={() => currentStep > step || isActive ? setCurrentStep(step) : null}
                disabled={currentStep < step}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border whitespace-nowrap transition-all ${bgMap[color]} ${currentStep < step ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-sm'}`}>
                
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${badgeMap[color]}`}>
                  {step}
                </div>
                <span className="text-sm font-medium">{label}</span>
              </button>);

          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Informações do Cliente */}
        {currentStep === 1 &&
        <Card className="border-l-4 border-l-[#10353C] bg-gradient-to-br from-teal-50/50 to-white">
          <CardHeader className="bg-teal-50/50 border-b">
            <CardTitle className="flex items-center gap-2 text-[#10353C]">
              <div className="w-8 h-8 bg-[#10353C] rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">1</span>
              </div>
              Informações do Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div>
              <Label>Cliente *</Label>
              {clienteSelecionado ?
              <div className="flex items-center justify-between p-4 bg-teal-50 rounded-lg border-2 border-[#10353C]/40">
                  <span className="font-semibold text-[#10353C]">{clienteSelecionado.nome_completo || clienteSelecionado.pj_razao_social}</span>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowClienteModal(true)}>
                      Alterar
                    </Button>
                  </div>
                </div> :

              <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                    placeholder="Buscar cliente por nome ou ID"
                    className="pl-10"
                    onClick={() => setShowClienteModal(true)}
                    readOnly />
                  
                  </div>
                  <Button type="button" className="w-full bg-[#10353C] hover:bg-[#1a4a52]" onClick={() => setShowClienteModal(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Cliente
                  </Button>
                </div>
              }
            </div>

            {/* Número do Benefício / Matrícula */}
            {clienteSelecionado &&
            <div>
                <Label>Número do Benefício / Matrícula</Label>
                <Input
                value={formData.numero_beneficio}
                onChange={(e) => setFormData({ ...formData, numero_beneficio: e.target.value })}
                placeholder="Digite o número do benefício ou matrícula" />
              
              </div>
            }

            {/* Grau de Alfabetização — aparece somente após selecionar cliente */}
            {clienteSelecionado &&
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
                <p className="font-semibold text-slate-800 flex items-center gap-2">🎓 Grau de Alfabetização</p>

                <div>
                  <Label className="text-sm text-slate-600 mb-2 block">O cliente é alfabetizado?</Label>
                  <div className="flex gap-3">
                    <button
                    type="button"
                    onClick={() => {setAlfabetizado(true);}}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                    alfabetizado === true ?
                    'bg-green-500 text-white border-green-500' :
                    'bg-white text-slate-700 border-slate-300 hover:border-green-400'}`
                    }>
                    
                      ✅ Sim
                    </button>
                    <button
                    type="button"
                    onClick={() => {setAlfabetizado(false);setGrauEscolaridade('');}}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                    alfabetizado === false ?
                    'bg-red-500 text-white border-red-500' :
                    'bg-white text-slate-700 border-slate-300 hover:border-red-400'}`
                    }>
                    
                      ❌ Não
                    </button>
                  </div>
                </div>

                {alfabetizado === true &&
              <div>
                    <Label className="text-sm text-slate-600 mb-2 block">Grau de escolaridade</Label>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                  { value: 'fundamental_incompleto', label: '📘 Ensino Fundamental Incompleto', desc: 'Não concluiu o fundamental (até o 9º ano).' },
                  { value: 'fundamental_completo', label: '📗 Ensino Fundamental Completo', desc: 'Concluiu o 9º ano.' },
                  { value: 'medio_incompleto', label: '📙 Ensino Médio Incompleto', desc: 'Começou o ensino médio, mas não terminou.' },
                  { value: 'medio_completo', label: '📓 Ensino Médio Completo', desc: 'Concluiu o ensino médio (antigo 2º grau).' },
                  { value: 'superior_incompleto', label: '🎓 Ensino Superior Incompleto', desc: 'Está cursando faculdade, mas não terminou.' },
                  { value: 'superior_completo', label: '🎓 Ensino Superior Completo', desc: 'Concluiu faculdade (graduação).' },
                  { value: 'pos_graduacao', label: '🎓 Pós-graduação', desc: 'Especialização, MBA, mestrado ou doutorado.' }].
                  map((op) =>
                  <button
                    key={op.value}
                    type="button"
                    onClick={() => setGrauEscolaridade(op.value)}
                    className={`text-left px-4 py-2.5 rounded-lg border text-sm transition-all ${
                    grauEscolaridade === op.value ?
                    'bg-purple-100 border-purple-400 text-purple-900' :
                    'bg-white border-slate-200 text-slate-700 hover:border-purple-300'}`
                    }>
                    
                          <span className="font-medium">{op.label}</span>
                          <span className="text-xs text-slate-500 ml-2">{op.desc}</span>
                        </button>
                  )}
                    </div>
                  </div>
              }
              </div>
            }
          </CardContent>
        </Card>
        }

        {/* Step 2: Detalhes da Proposta */}
        {currentStep === 2 &&

        <Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50/50 to-white">
          <CardHeader className="bg-blue-50/50 border-b">
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">2</span>
              </div>
              Detalhes da Proposta
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Empréstimo *</Label>
                <select
                  value={formData.tipo_consignado}
                  onChange={(e) => {
                    const novoTipo = e.target.value;
                    const updates = { tipo_consignado: novoTipo };
                    if (TIPOS_BRUTO_IGUAL_LIBERADO.includes(novoTipo) && formData.valor_liberado) {
                      updates.valor_bruto = formData.valor_liberado;
                    }
                    setFormData({ ...formData, ...updates });
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  required>
                  
                  <option value="">Selecione...</option>
                  {tiposEmprestimo.length > 0 ?
                  tiposEmprestimo.map((t) =>
                  <option key={t.id} value={t.slug}>{t.nome}</option>
                  ) :

                  <>
                      <option value="NOVO">Novo</option>
                      <option value="REFINANCIAMENTO">Refinanciamento</option>
                      <option value="PORTABILIDADE">Portabilidade</option>
                      <option value="REFIN_PORTABILIDADE">Refin + Portabilidade</option>
                      <option value="CARTAO_CONSIGNADO">Cartão Consignado</option>
                      <option value="CARTAO_BENEFICIO">Cartão Benefício</option>
                      <option value="SAQUE">Saque</option>
                      <option value="CARTAO">Cartão</option>
                    </>
                  }
                </select>
              </div>
              <div>
                <Label>Banco *</Label>
                <div className="flex gap-2">
                  <select
                    value={formData.banco}
                    onChange={(e) => setFormData({ ...formData, banco: e.target.value, tabela_emprestimo_id: '' })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    required>
                    <option value="">Selecione...</option>
                    {bancos.map((b) =>
                    <option key={b.id} value={b.nome}>{b.nome}</option>
                    )}
                  </select>
                  <Button type="button" variant="outline" size="icon" onClick={() => setShowBancoModal(true)} title="Cadastrar novo banco">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Convênio *</Label>
                <div className="flex gap-2">
                  <select
                    value={formData.convenio_id}
                    onChange={(e) => setFormData({ ...formData, convenio_id: e.target.value, tabela_emprestimo_id: '' })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    required>
                    
                    <option value="">Selecione...</option>
                    {convenios.map((c) =>
                    <option key={c.id} value={c.id}>{c.nome}</option>
                    )}
                  </select>
                  <Button type="button" variant="outline" size="icon" onClick={() => setShowConvenioModal(true)} title="Cadastrar novo convênio">
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
                  disabled={!formData.banco && !formData.convenio_id}>
                  
                  <option value="">Selecione...</option>
                  {tabelasEmprestimo.
                  filter((t) => {
                    const bancoMatch = !formData.banco || t.banco === formData.banco;
                    const convenioMatch = !formData.convenio_id || t.convenio_id === formData.convenio_id;
                    return bancoMatch && convenioMatch;
                  }).
                  map((t) =>
                  <option key={t.id} value={t.id}>{t.tabela || t.nome}</option>
                  )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Vendedor/Parceiro</Label>
                {(user?.perfil === 'vendedor' || user?.perfil === 'funcionario') ? (
                  <div className="flex h-9 w-full items-center rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700 cursor-not-allowed">
                    {user?.colaborador_nome || user?.full_name}
                    <span className="ml-auto text-xs text-slate-400">(você)</span>
                  </div>
                ) : (
                  <select
                    value={formData.vendedor_parceiro_id}
                    onChange={(e) => setFormData({ ...formData, vendedor_parceiro_id: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                    <option value="">Selecione...</option>
                    {vendedores.map((v) =>
                    <option key={v.id} value={v.id}>{v.nome}</option>
                    )}
                  </select>
                )}
              </div>
              <div>
                <Label>Empresa Parceira</Label>
                <select
                  value={formData.empresa_parceira_id}
                  onChange={(e) => {
                    const ep = empresasParceiras.find(x => x.id === e.target.value);
                    setFormData({ ...formData, empresa_parceira_id: e.target.value, empresa_parceira_nome: ep?.nome || '', empresa_parceira: ep?.nome || '' });
                  }}
                  disabled={user?.perfil === 'vendedor'}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  
                  <option value="">Selecione...</option>
                  {empresasParceiras.map((ep) =>
                  <option key={ep.id} value={ep.id}>{ep.nome}</option>
                  )}
                </select>
              </div>
            </div>

            {renderCamposPorTipo()}

          </CardContent>
        </Card>
        }

        {/* Step 3: Testemunhas */}
        {currentStep === 3 &&
        <Card className="border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-50/50 to-white">
          <CardHeader className="bg-purple-50/50 border-b">
            <CardTitle className="flex items-center gap-2 text-purple-900">
              <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">3</span>
              </div>
              Testemunhas
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm text-slate-500">Opcional — reforça o Termo de Autorização.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map((n) => (
                <div key={n} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-slate-600">Testemunha {n}</p>
                  <div>
                    <Label>Nome</Label>
                    <Input
                      value={formData[`testemunha${n}_nome`]}
                      onChange={(e) => setFormData({ ...formData, [`testemunha${n}_nome`]: e.target.value })}
                      placeholder="Nome completo" />
                  </div>
                  <div>
                    <Label>CPF</Label>
                    <Input
                      value={formData[`testemunha${n}_cpf`]}
                      onChange={(e) => setFormData({ ...formData, [`testemunha${n}_cpf`]: e.target.value })}
                      placeholder="000.000.000-00" />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input
                      value={formData[`testemunha${n}_telefone`]}
                      onChange={(e) => setFormData({ ...formData, [`testemunha${n}_telefone`]: e.target.value })}
                      placeholder="(00) 00000-0000" />
                  </div>
                  <div>
                    <Label>Endereço</Label>
                    <Input
                      value={formData[`testemunha${n}_endereco`]}
                      onChange={(e) => setFormData({ ...formData, [`testemunha${n}_endereco`]: e.target.value })}
                      placeholder="Endereço completo" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        }

        {/* Step 4: Estrutura de Comissões */}
        {currentStep === 4 && (user?.perfil === 'admin' || user?.perfil === 'gerente' || user?.perfil === 'super_admin' || user?.perfil === 'master') &&
        <Card className="border-l-4 border-l-green-500 bg-gradient-to-br from-green-50/50 to-white">
            <CardHeader className="bg-green-50/50 border-b">
              <CardTitle className="flex items-center gap-2 text-green-900">
                <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-bold">4</span>
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
                  className={formData.percentual_comissao_empresa ? 'bg-green-50 border-green-300' : ''} />
                
                  </div>
                  <div>
                    <Label>Comissão Empresa Prevista</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                      <Input
                    className="pl-10 bg-slate-50"
                    value={formatarMoeda(formData.comissao_empresa_prevista)}
                    readOnly />
                  
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
                    placeholder="0,00" />
                  
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
                  className={formData.percentual_comissao_vendedor ? 'bg-green-50 border-green-300' : ''} />
                
                  </div>
                  <div>
                    <Label>Comissão Vendedor Prevista</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                      <Input
                    className="pl-10 bg-slate-50"
                    value={formatarMoeda(formData.comissao_vendedor_prevista)}
                    readOnly />
                  
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
                    placeholder="0,00" />
                  
                    </div>
                  </div>
                </div>
            </CardContent>
          </Card>
        }

        {user?.perfil === 'vendedor' && formData.comissao_vendedor_prevista && currentStep === 4 &&
        <Card className="border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-50/50 to-white">
            <CardHeader className="bg-amber-50/50 border-b">
              <CardTitle className="flex items-center gap-2 text-amber-900">
                <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-bold">4</span>
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
                  className="bg-slate-50" />
                
                  </div>
                  <div>
                    <Label>Valor Previsto</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                      <Input
                    className="pl-10 bg-slate-50"
                    value={formatarMoeda(formData.comissao_vendedor_prevista)}
                    readOnly />
                  
                    </div>
                  </div>
                </div>
            </CardContent>
          </Card>
        }

        {/* Step 5: Revisão Final */}
        {currentStep === 5 && (() => {
          const convenioSelecionado = convenios.find(c => c.id === formData.convenio_id);
          const vendedorSelecionado = vendedores.find(v => v.id === formData.vendedor_parceiro_id);
          const InfoItem = ({ label, value }) => value ? (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
              <p className="font-semibold text-slate-900 text-sm mt-0.5">{value}</p>
            </div>
          ) : null;

          return (
            <Card className="border-l-4 border-l-orange-500 bg-gradient-to-br from-orange-50/50 to-white">
              <CardHeader className="bg-orange-50/50 border-b">
                <CardTitle className="flex items-center gap-2 text-orange-900">
                  <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm font-bold">5</span>
                  </div>
                  Revisão Final
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-5">

                {/* Bloco: Informações do Cliente */}
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
                  <h3 className="font-bold text-purple-900 text-sm uppercase tracking-wide flex items-center gap-2">
                    👤 Informações do Cliente
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <InfoItem label="Nome" value={clienteSelecionado?.nome_completo || clienteSelecionado?.pj_razao_social} />
                    <InfoItem label="CPF" value={clienteSelecionado?.cpf || clienteSelecionado?.pj_cnpj} />
                    <InfoItem label="Nº Benefício / Matrícula" value={formData.numero_beneficio} />
                    <InfoItem label="RG" value={clienteSelecionado?.rg} />
                    <InfoItem label="Data de Nascimento" value={clienteSelecionado?.data_nascimento} />
                    <InfoItem label="Estado Civil" value={clienteSelecionado?.estado_civil} />
                    <InfoItem label="Profissão" value={clienteSelecionado?.profissao} />
                    <InfoItem label="Celular" value={clienteSelecionado?.celular} />
                    <InfoItem label="Telefone Fixo" value={clienteSelecionado?.telefone_fixo} />
                    <InfoItem label="E-mail" value={clienteSelecionado?.email} />
                    <InfoItem
                      label="Endereço"
                      value={clienteSelecionado ? `${clienteSelecionado.res_endereco || ''}${clienteSelecionado.res_numero ? ', nº ' + clienteSelecionado.res_numero : ''}${clienteSelecionado.res_complemento ? ', ' + clienteSelecionado.res_complemento : ''}`.trim().replace(/^,\s*/, '') || null : null} />
                    <InfoItem label="Bairro" value={clienteSelecionado?.res_bairro} />
                    <InfoItem label="Cidade/UF" value={clienteSelecionado?.res_cidade ? `${clienteSelecionado.res_cidade}${clienteSelecionado.res_uf ? ' - ' + clienteSelecionado.res_uf : ''}` : null} />
                    <InfoItem label="CEP" value={clienteSelecionado?.res_cep} />
                    <InfoItem label="Nome da Mãe" value={clienteSelecionado?.nome_mae} />
                    <InfoItem label="Nome do Pai" value={clienteSelecionado?.nome_pai} />
                  </div>
                </div>

                {/* Bloco: Testemunhas */}
                {(formData.testemunha1_nome || formData.testemunha2_nome) && (
                  <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 space-y-3">
                    <h3 className="font-bold text-pink-900 text-sm uppercase tracking-wide flex items-center gap-2">
                      ✍️ Testemunhas
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[1, 2].map((n) => formData[`testemunha${n}_nome`] && (
                        <div key={n} className="grid grid-cols-2 gap-3 text-sm">
                          <InfoItem label={`Testemunha ${n} - Nome`} value={formData[`testemunha${n}_nome`]} />
                          <InfoItem label="CPF" value={formData[`testemunha${n}_cpf`]} />
                          <InfoItem label="Telefone" value={formData[`testemunha${n}_telefone`]} />
                          <InfoItem label="Endereço" value={formData[`testemunha${n}_endereco`]} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bloco: Detalhes da Proposta */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                  <h3 className="font-bold text-blue-900 text-sm uppercase tracking-wide flex items-center gap-2">
                    📋 Detalhes da Proposta
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <InfoItem label="Tipo de Empréstimo" value={formData.tipo_consignado} />
                    <InfoItem label="Banco" value={formData.banco} />
                    <InfoItem label="Convênio" value={convenioSelecionado?.nome} />
                    <InfoItem label="Vendedor / Parceiro" value={vendedorSelecionado?.nome} />
                    <InfoItem label="Empresa Parceira" value={formData.empresa_parceira} />
                  </div>
                </div>

                {/* Bloco: Dados Financeiros */}
                {(isPortabilidade || isRefinPortabilidade) && (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
                    <h3 className="font-bold text-purple-900 text-sm uppercase tracking-wide">🔄 Portabilidade - Contrato de Origem</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                      <InfoItem label="Banco de Origem" value={formData.banco_anterior} />
                      <InfoItem label="Código do Banco" value={formData.origem_banco} />
                      <InfoItem label="Contrato Portado" value={formData.origem_contrato} />
                      <InfoItem label="Parcela Origem" value={formData.origem_parcela ? `R$ ${formatarMoeda(formData.origem_parcela)}` : null} />
                      <InfoItem label="Saldo Devedor" value={formData.origem_saldo_devedor ? `R$ ${formatarMoeda(formData.origem_saldo_devedor)}` : null} />
                      <InfoItem label="Qt. Parcelas a Vencer" value={formData.origem_prazo_restante} />
                    </div>
                  </div>
                )}

                {(isRefinPortabilidade || (!isPortabilidade && !isRefinPortabilidade)) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                    <h3 className="font-bold text-blue-900 text-sm uppercase tracking-wide">
                      {isRefinPortabilidade ? '💰 Refin da Portabilidade' : '💰 Dados Financeiros'}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                      <InfoItem label="Valor Liberado" value={formData.valor_liberado ? `R$ ${formatarMoeda(formData.valor_liberado)}` : null} />
                      <InfoItem label="Valor Bruto" value={formData.valor_bruto ? `R$ ${formatarMoeda(formData.valor_bruto)}` : null} />
                      <InfoItem label="Prazo" value={formData.prazo ? `${formData.prazo} meses` : null} />
                      <InfoItem label="Parcela" value={formData.parcela ? `R$ ${formatarMoeda(formData.parcela)}` : null} />
                    </div>
                  </div>
                )}

                {/* Bloco: Finalização */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                  <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">✅ Finalização</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Número ADE</Label>
                      <Input value={formData.numero_ade} onChange={(e) => setFormData({ ...formData, numero_ade: e.target.value })} />
                    </div>
                    <div>
                      <Label>
                        Número do Contrato
                        {(() => {
                          const s = formData.status || '';
                          const obj = statusPropostas.find(x => (x.codigo || x.slug) === s);
                          const nome = (obj?.nome || '').toLowerCase();
                          const isAguDig = (s.toLowerCase().includes('aguardando') && s.toLowerCase().includes('digit')) || (nome.includes('aguardando') && nome.includes('digit'));
                          return !isAguDig ? <span className="text-red-500 ml-1">*</span> : null;
                        })()}
                      </Label>
                      <Input value={formData.numero_contrato} onChange={(e) => setFormData({ ...formData, numero_contrato: e.target.value })} />
                    </div>
                  </div>

                  <div>
                    <Label>Status</Label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                      {statusPropostas.length > 0 ?
                        statusPropostas.filter((s) => s.tipo === 'principal' || !s.tipo).map((status) =>
                          <option key={status.id} value={status.codigo || status.slug}>{status.nome}</option>
                        ) :
                        <>
                          <option value="aguardando_digitacao">Aguardando Digitação</option>
                          <option value="em_andamento">Em andamento</option>
                          <option value="pendente">Pendente</option>
                          <option value="aguardando_formalizacao">Aguardando formalização</option>
                          <option value="aguardando_cip">Aguardando CIP</option>
                          <option value="saldo_retornado">Saldo retornado</option>
                          <option value="aguardando_pagamento">Aguardando pagamento</option>
                          <option value="pago">Pago</option>
                          <option value="cancelado">Cancelado</option>
                        </>
                      }
                    </select>
                  </div>

                  <div>
                    <Label>Observações</Label>
                    <textarea
                      value={formData.observacoes}
                      onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
                  </div>
                </div>

              </CardContent>
            </Card>
          );
        })()}


        {/* Botões de Navegação */}
        <div className="flex gap-3 justify-between pt-6 border-t sticky bottom-0 bg-white p-6 -mx-6 rounded-b-lg">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (currentStep === 1) navigate(-1);else
              setCurrentStep(currentStep - 1);
            }}>
            
            {currentStep === 1 ? 'Cancelar' : 'Anterior'}
          </Button>
          
          <div className="flex gap-2">
            {currentStep < 5 &&
            <Button
              type="button"
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={currentStep === 1 && !clienteSelecionado}
              className="bg-slate-500 hover:bg-slate-600">
              
                Próximo
              </Button>
            }
            {currentStep === 5 &&
            <Button
              type="submit"
              disabled={criarVendaMutation.isPending}
              className="bg-[#23BE84] hover:bg-[#1da570]">
              
                {criarVendaMutation.isPending ?
              <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </> :

              'Salvar Proposta'
              }
              </Button>
            }
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
        empresaIdSelecionada={empresaId} />
      

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
        }} />
      

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
        }} />
      
    </div>);

}