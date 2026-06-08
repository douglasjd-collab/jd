import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import GerenciarCategoriasModal from '@/components/forms/GerenciarCategoriasModal';
import { TrendingDown, Upload, Calendar as CalendarIcon, ChevronDown, CheckCircle, Repeat, Settings, Landmark, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ModalNovaDespesa({ open, onOpenChange, user, onSuccess, despesaParaEditar = null }) {
  const queryClient = useQueryClient();
  const [gerenciarCategoriasOpen, setGerenciarCategoriasOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [criarSubcatOpen, setCriarSubcatOpen] = useState(false);
  const [novaSubcatNome, setNovaSubcatNome] = useState('');
  const [mostrarDetalhes, setMostrarDetalhes] = useState(true);

  const getFormFromDespesa = (d) => ({
    descricao: d.descricao || '',
    categoria: d.categoria || '',
    subcategoria: '',
    valor: d.valor ? d.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
    data: d.data || moment().format('YYYY-MM-DD'),
    filial_id: d.filial_id || '',
    filial_nome: d.filial_nome || '',
    centro_custo_id: d.centro_custo_id || '',
    centro_custo_nome: d.centro_custo_nome || '',
    responsavel_id: d.responsavel_id || '',
    responsavel_nome: d.responsavel_nome || '',
    comprovante_url: d.comprovante_url || '',
    observacao: d.observacao || '',
    foiPaga: ['pago', 'paga'].includes(d.status),
    despesaFixa: false,
    repetir: false,
    repeticoes: 2,
    unidadeRepeticao: 'meses',
    parcelaInicial: 1,
    totalParcelas: 0,
    conta_bancaria_id: d.conta_bancaria_id || '',
  });

  const emptyForm = {
    descricao: '',
    categoria: '',
    subcategoria: '',
    valor: '',
    data: moment().format('YYYY-MM-DD'),
    filial_id: '',
    filial_nome: '',
    centro_custo_id: '',
    centro_custo_nome: '',
    responsavel_id: '',
    responsavel_nome: '',
    comprovante_url: '',
    observacao: '',
    foiPaga: true,
    despesaFixa: false,
    repetir: false,
    repeticoes: 2,
    unidadeRepeticao: 'meses',
    parcelaInicial: 1,
    totalParcelas: 0,
    conta_bancaria_id: '',
  };

  const [formData, setFormData] = useState(emptyForm);

  React.useEffect(() => {
    if (open) {
      setFormData(despesaParaEditar ? getFormFromDespesa(despesaParaEditar) : emptyForm);
    }
  }, [open, despesaParaEditar]);

  const { data: filiais = [] } = useQuery({
    queryKey: ['filiais-despesa', user?.empresa_id],
    queryFn: () => base44.entities.Filial.filter(user?.empresa_id ? { empresa_id: user.empresa_id, situacao: 'ativa' } : {}, 'nome'),
    enabled: !!user,
  });

  const { data: centrosCusto = [] } = useQuery({
    queryKey: ['centros-custo-despesa', user?.empresa_id],
    queryFn: () => base44.entities.CentroCusto.filter(user?.empresa_id ? { empresa_id: user.empresa_id, ativo: true } : {}, 'nome'),
    enabled: !!user,
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-despesas'],
    queryFn: () => base44.entities.Colaborador.filter({ status: 'ativo' }),
    enabled: !!user,
  });

  const { data: contasBancarias = [] } = useQuery({
    queryKey: ['contas-bancarias-despesa', user?.empresa_id],
    queryFn: () => base44.entities.ContaBancaria.filter(
      user?.empresa_id ? { empresa_id: user.empresa_id, status: 'ativa' } : { status: 'ativa' }
    ),
    enabled: !!user,
  });

  const { data: todasCategorias = [] } = useQuery({
    queryKey: ['categorias-despesa', user?.empresa_id],
    queryFn: async () => {
      if (!user?.empresa_id) return [];
      const cats = await base44.entities.CategoriaDespesa.filter({ empresa_id: user.empresa_id, status: 'ativa' });
      return cats.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    },
    enabled: !!user?.empresa_id,
  });

  const categoriasPai = todasCategorias.filter(c => !c.categoria_pai_id);
  const subcategoriasDaCat = todasCategorias.filter(c => {
    const pai = categoriasPai.find(p => p.nome === formData.categoria);
    return pai && c.categoria_pai_id === pai.id;
  });

  const criarSubcatMutation = useMutation({
    mutationFn: (data) => base44.entities.CategoriaDespesa.create(data),
    onSuccess: (novaSub) => {
      queryClient.invalidateQueries({ queryKey: ['categorias-despesa', user?.empresa_id] });
      toast.success('Subcategoria criada!');
      setFormData(prev => ({ ...prev, subcategoria: novaSub.nome }));
      setNovaSubcatNome('');
      setCriarSubcatOpen(false);
    },
  });

  const handleCriarSubcat = () => {
    const nome = novaSubcatNome.trim();
    if (!nome) { toast.error('Digite o nome da subcategoria'); return; }
    const pai = categoriasPai.find(p => p.nome === formData.categoria);
    if (!pai) { toast.error('Selecione uma categoria primeiro'); return; }
    criarSubcatMutation.mutate({
      empresa_id: user.empresa_id,
      nome,
      icone: '🏷️',
      categoria_pai_id: pai.id,
      ordem: subcategoriasDaCat.length,
      status: 'ativa',
    });
  };

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Despesa.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['despesas']);
      queryClient.invalidateQueries(['despesas-transacoes']);
      toast.success('Despesa lançada com sucesso!');
      onOpenChange(false);
      resetForm();
      onSuccess?.();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Despesa.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['despesas']);
      queryClient.invalidateQueries(['despesas-transacoes']);
      toast.success('Despesa atualizada com sucesso!');
      onOpenChange(false);
      resetForm();
      onSuccess?.();
    },
  });

  const resetForm = () => {
    setFormData({
      descricao: '',
      categoria: '',
      subcategoria: '',
      valor: '',
      data: moment().format('YYYY-MM-DD'),
      filial_id: '',
      filial_nome: '',
      centro_custo_id: '',
      centro_custo_nome: '',
      responsavel_id: '',
      responsavel_nome: '',
      comprovante_url: '',
      observacao: '',
      foiPaga: true,
      despesaFixa: false,
      repetir: false,
      repeticoes: 2,
      unidadeRepeticao: 'meses',
      parcelaInicial: 1,
      totalParcelas: 0,
      conta_bancaria_id: '',
      });
      setMostrarDetalhes(true);
      };

  const formatarValor = (val) => {
    const num = val.replace(/\D/g, '');
    if (!num) return '';
    const valor = parseFloat(num) / 100;
    return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setFormData({ ...formData, comprovante_url: file_url });
    toast.success('Comprovante enviado!');
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!formData.descricao || !formData.valor || !formData.filial_id) {
      toast.error('Preencha os campos obrigatórios: Descrição, Valor e Filial');
      return;
    }
    const valor = parseFloat(formData.valor.replace(/\./g, '').replace(',', '.'));
    if (isNaN(valor) || valor <= 0) {
      toast.error('Valor inválido');
      return;
    }

    const base = {
      empresa_id: user.empresa_id,
      filial_id: formData.filial_id,
      filial_nome: formData.filial_nome,
      centro_custo_id: formData.centro_custo_id || null,
      centro_custo_nome: formData.centro_custo_nome || null,
      descricao: formData.descricao,
      categoria: formData.subcategoria || formData.categoria,
      valor,
      responsavel_id: formData.responsavel_id || null,
      responsavel_nome: formData.responsavel_nome || null,
      comprovante_url: formData.comprovante_url,
      observacao: formData.observacao,
      usuario_id: user.id,
      usuario_nome: user.nome || user.full_name,
      conta_bancaria_id: formData.conta_bancaria_id || null,
    };

    if (!formData.repetir) {
      if (despesaParaEditar) {
        updateMutation.mutate({
          id: despesaParaEditar.id,
          data: {
            ...base,
            data: formData.data,
            status: formData.foiPaga ? 'pago' : 'pendente',
            data_pagamento: formData.foiPaga ? formData.data : undefined,
          },
        });
      } else {
        createMutation.mutate({
          ...base,
          data: formData.data,
          status: formData.foiPaga ? 'pago' : 'pendente',
          data_pagamento: formData.foiPaga ? formData.data : undefined,
        });
      }
      return;
    }

    // Lançamento com repetição / parcelas em andamento
    const parcelaInicial = parseInt(formData.parcelaInicial) || 1;
    const totalParcelas = parseInt(formData.totalParcelas) || 0;
    const qtdRepetir = parseInt(formData.repeticoes) || 2;
    const unidade = formData.unidadeRepeticao === 'meses' ? 'months' : 'weeks';

    // Total de parcelas do contrato (se informado)
    const totalContrato = totalParcelas > 0 ? totalParcelas : (parcelaInicial - 1 + qtdRepetir);

    // Gerar as parcelas a partir da parcelaInicial, contando da data selecionada
    const despesasParaCriar = [];
    for (let i = 0; i < qtdRepetir; i++) {
      const numeroParcela = parcelaInicial + i;
      const dataVencimento = moment(formData.data).add(i, unidade).format('YYYY-MM-DD');
      // Parcelas anteriores à atual (já pagas retroativamente)
      const jaDeveriaTerSidoPaga = numeroParcela < parcelaInicial + (qtdRepetir - qtdRepetir); // sempre false - só as já informadas antes da inicial

      despesasParaCriar.push({
        ...base,
        descricao: totalContrato > 0
          ? `${formData.descricao} (${numeroParcela}/${totalContrato})`
          : `${formData.descricao} (${numeroParcela}/${qtdRepetir + parcelaInicial - 1})`,
        data: dataVencimento,
        status: i === 0 && formData.foiPaga ? 'pago' : 'pendente',
        data_pagamento: i === 0 && formData.foiPaga ? dataVencimento : undefined,
      });
    }

    // Criar despesas retroativas (parcelas anteriores à inicial, já pagas)
    const despesasRetroativas = [];
    for (let i = 1; i < parcelaInicial; i++) {
      const dataRetroativa = moment(formData.data).subtract(parcelaInicial - i, unidade).format('YYYY-MM-DD');
      despesasRetroativas.push({
        ...base,
        descricao: totalContrato > 0
          ? `${formData.descricao} (${i}/${totalContrato})`
          : `${formData.descricao} (${i}/${qtdRepetir + parcelaInicial - 1})`,
        data: dataRetroativa,
        status: 'pago',
        data_pagamento: dataRetroativa,
      });
    }

    const todas = [...despesasRetroativas, ...despesasParaCriar];

    try {
      for (const d of todas) {
        await base44.entities.Despesa.create(d);
      }
      queryClient.invalidateQueries(['despesas']);
      queryClient.invalidateQueries(['despesas-transacoes']);
      toast.success(`${todas.length} despesa(s) lançadas com sucesso!`);
      onOpenChange(false);
      resetForm();
      onSuccess?.();
    } catch (err) {
      toast.error('Erro ao lançar despesas: ' + err.message);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-4xl bg-[#2A2A2A] text-white border-0">
          <DialogHeader className="border-b border-slate-700 pb-4">
            <DialogTitle className="text-xl font-semibold">{despesaParaEditar ? 'Editar Despesa' : 'Nova Despesa'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-6 py-4">
            {/* Coluna Esquerda */}
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3 border-b border-slate-700 pb-3">
                  <TrendingDown className="w-5 h-5 text-slate-400" />
                  <span className="text-xl font-bold text-red-400">R$</span>
                  <Input
                    value={formData.valor}
                    onChange={(e) => setFormData({ ...formData, valor: formatarValor(e.target.value) })}
                    placeholder="0,00"
                    className="text-2xl font-bold bg-transparent border-none text-red-400 h-auto p-0 focus-visible:ring-0 flex-1"
                  />
                </div>
                {(!formData.valor || parseFloat(formData.valor.replace(/[^\d,.-]/g, '').replace(',', '.')) === 0) && (
                  <p className="text-xs text-orange-400">Deve ter um valor diferente de 0</p>
                )}
              </div>

              <div className="flex items-center justify-between border-b border-slate-700 pb-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className={`w-5 h-5 ${formData.foiPaga ? 'text-green-500' : 'text-slate-400'}`} />
                  <span>Foi paga</span>
                </div>
                <Switch checked={formData.foiPaga} onCheckedChange={(v) => setFormData({ ...formData, foiPaga: v })} />
              </div>

              <div className="border-b border-slate-700 pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarIcon className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-400">Data</span>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm"
                    onClick={() => setFormData({ ...formData, data: moment().format('YYYY-MM-DD') })}
                    className={formData.data === moment().format('YYYY-MM-DD') ? 'bg-red-500 hover:bg-red-600' : 'bg-slate-700 hover:bg-slate-600 text-white'}
                  >Hoje</Button>
                  <Button type="button" size="sm"
                    onClick={() => setFormData({ ...formData, data: moment().subtract(1, 'day').format('YYYY-MM-DD') })}
                    className={formData.data === moment().subtract(1, 'day').format('YYYY-MM-DD') ? 'bg-red-500 hover:bg-red-600' : 'bg-slate-700 hover:bg-slate-600 text-white'}
                  >Ontem</Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="flex-1 bg-slate-700 hover:bg-slate-600 text-white border-slate-600 justify-start">
                        <CalendarIcon className="w-4 h-4 mr-2" />
                        {formData.data ? format(parseISO(formData.data), 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700">
                      <Calendar mode="single" selected={formData.data ? parseISO(formData.data) : undefined}
                        onSelect={(date) => { if (date) setFormData({ ...formData, data: format(date, 'yyyy-MM-dd') }); }}
                        locale={ptBR} className="bg-slate-800 text-white" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="border-b border-slate-700 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">📝</span>
                  <Input value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    placeholder="Descrição" className="bg-transparent border-none text-white focus-visible:ring-0 flex-1" />
                </div>
              </div>

              {/* Categoria Principal */}
              <div className="border-b border-slate-700 pb-4">
                <div className="flex items-center gap-2">
                  {!formData.categoria && <span className="text-slate-400">🏷️</span>}
                  <Select value={formData.categoria} onValueChange={(v) => {
                    if (v === '__gerenciar__') { setGerenciarCategoriasOpen(true); }
                    else { setFormData({ ...formData, categoria: v, subcategoria: '' }); }
                  }}>
                    <SelectTrigger className="bg-transparent border-none text-white focus:ring-0 flex-1">
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {categoriasPai.map((cat) => (
                        <SelectItem key={cat.id} value={cat.nome}>{cat.icone} {cat.nome}</SelectItem>
                      ))}
                      {categoriasPai.length > 0 && <div className="h-px bg-slate-600 my-1" />}
                      <SelectItem value="__gerenciar__" className="text-blue-400 font-semibold">
                        <div className="flex items-center gap-2"><Settings className="w-4 h-4" />Gerenciar categorias</div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Subcategoria — aparece sempre que há categoria selecionada */}
              {formData.categoria && (
                <div className="border-b border-slate-700 pb-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-sm pl-4">↳</span>
                    <Select value={formData.subcategoria} onValueChange={(v) => {
                      if (v === '__nova__') { setCriarSubcatOpen(true); }
                      else { setFormData({ ...formData, subcategoria: v }); }
                    }}>
                      <SelectTrigger className="bg-transparent border-none text-white focus:ring-0 flex-1">
                        <SelectValue placeholder="Subcategoria (opcional)" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {subcategoriasDaCat.map((sub) => (
                          <SelectItem key={sub.id} value={sub.nome}>{sub.icone} {sub.nome}</SelectItem>
                        ))}
                        {formData.subcategoria && (
                          <SelectItem value={null}>— Remover subcategoria</SelectItem>
                        )}
                        <div className="h-px bg-slate-600 my-1" />
                        <SelectItem value="__nova__" className="text-blue-400 font-semibold">
                          <div className="flex items-center gap-2"><Plus className="w-4 h-4" />Nova subcategoria</div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Inline: criar nova subcategoria */}
                  {criarSubcatOpen && (
                    <div className="flex items-center gap-2 pl-8">
                      <Input
                        autoFocus
                        value={novaSubcatNome}
                        onChange={(e) => setNovaSubcatNome(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCriarSubcat(); if (e.key === 'Escape') { setCriarSubcatOpen(false); setNovaSubcatNome(''); } }}
                        placeholder="Nome da subcategoria"
                        className="bg-slate-700 border-slate-600 text-white text-sm h-8 flex-1"
                      />
                      <Button size="sm" onClick={handleCriarSubcat} disabled={criarSubcatMutation.isPending} className="h-8 bg-blue-600 hover:bg-blue-700 text-white px-3">
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setCriarSubcatOpen(false); setNovaSubcatNome(''); }} className="h-8 text-slate-400 hover:text-white px-2">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Filial - OBRIGATÓRIO */}
              <div className="border-b border-slate-700 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">🏢</span>
                  <Select value={formData.filial_id} onValueChange={v => {
                    const f = filiais.find(f => f.id === v);
                    setFormData({ ...formData, filial_id: v, filial_nome: f?.nome || '' });
                  }}>
                    <SelectTrigger className="bg-transparent border-none text-white focus:ring-0 flex-1">
                      <SelectValue placeholder="Filial (obrigatório)" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {filiais.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {!formData.filial_id && <p className="text-xs text-orange-400 mt-1 pl-6">Campo obrigatório</p>}
              </div>

              {/* Centro de Custo */}
              <div className="border-b border-slate-700 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">🎯</span>
                  <Select value={formData.centro_custo_id || 'none'} onValueChange={v => {
                    const cc = centrosCusto.find(c => c.id === v);
                    setFormData({ ...formData, centro_custo_id: v === 'none' ? '' : v, centro_custo_nome: cc?.nome || '' });
                  }}>
                    <SelectTrigger className="bg-transparent border-none text-white focus:ring-0 flex-1">
                      <SelectValue placeholder="Centro de Custo (opcional)" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="none">— Nenhum</SelectItem>
                      {centrosCusto.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-b border-slate-700 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">👤</span>
                  <Select value={formData.responsavel_id} onValueChange={(v) => {
                    const colab = colaboradores.find((c) => c.id === v);
                    setFormData({ ...formData, responsavel_id: v, responsavel_nome: colab?.nome || '' });
                  }}>
                    <SelectTrigger className="bg-transparent border-none text-white focus:ring-0 flex-1">
                      <SelectValue placeholder="Responsável" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {colaboradores.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-b border-slate-700 pb-4">
                <div className="flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-slate-400" />
                  <Select value={formData.conta_bancaria_id} onValueChange={(v) => setFormData({ ...formData, conta_bancaria_id: v })}>
                    <SelectTrigger className="bg-transparent border-none text-white focus:ring-0 flex-1">
                      <SelectValue placeholder="Conta Bancária (obrigatório)" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {contasBancarias.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome_conta} — {c.banco}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!formData.conta_bancaria_id && <p className="text-xs text-orange-400 mt-1 pl-6">Campo obrigatório</p>}
              </div>

              {mostrarDetalhes && (
                <div className="border-b border-slate-700 pb-4">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                    <Upload className="w-4 h-4" />
                    <span className="text-sm">Anexar Arquivo</span>
                    <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                  </label>
                  {uploading && <span className="text-xs text-slate-400 mt-1">Enviando...</span>}
                  {formData.comprovante_url && <p className="text-xs text-green-400 mt-1">✓ Comprovante enviado</p>}
                </div>
              )}
            </div>

            {/* Coluna Direita */}
            <div className="space-y-4">
              <div className="border-b border-slate-700 pb-4">
                <Textarea value={formData.observacao} onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
                  placeholder="Observação" rows={3} className="bg-transparent border-none text-white placeholder:text-slate-500 focus-visible:ring-0 resize-none" />
              </div>
              {mostrarDetalhes && (
                <>
                  <div className="flex items-center justify-between border-b border-slate-700 pb-4">
                    <div className="flex items-center gap-3"><Repeat className="w-5 h-5 text-slate-400" /><span>Despesa fixa</span></div>
                    <Switch checked={formData.despesaFixa} onCheckedChange={(v) => setFormData({ ...formData, despesaFixa: v })} />
                  </div>
                  <div className="border-b border-slate-700 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3"><Repeat className="w-5 h-5 text-slate-400" /><span>Repetir</span></div>
                      <Switch checked={formData.repetir} onCheckedChange={(v) => setFormData({ ...formData, repetir: v })} />
                    </div>
                    {formData.repetir && (
                      <div className="space-y-3 mt-2">
                        {/* Quantidade e unidade */}
                        <div className="flex gap-2">
                          <Input type="number" min={1} value={formData.repeticoes}
                            onChange={(e) => setFormData({ ...formData, repeticoes: parseInt(e.target.value) || 2 })}
                            className="w-20 bg-slate-700 border-slate-600 text-white" />
                          <Select value={formData.unidadeRepeticao} onValueChange={(v) => setFormData({ ...formData, unidadeRepeticao: v })}>
                            <SelectTrigger className="bg-slate-700 border-slate-600 text-white flex-1"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700">
                              <SelectItem value="meses">Meses</SelectItem>
                              <SelectItem value="semanas">Semanas</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Parcelas em andamento */}
                        <div className="bg-slate-800 rounded-lg p-3 space-y-3 border border-slate-600">
                          <p className="text-xs text-slate-400 font-medium">Parcelas em andamento?</p>
                          <div className="flex gap-3 items-center">
                            <div className="flex-1">
                              <label className="text-xs text-slate-500 mb-1 block">Começar na parcela</label>
                              <Input type="number" min={1} value={formData.parcelaInicial}
                                onChange={(e) => setFormData({ ...formData, parcelaInicial: parseInt(e.target.value) || 1 })}
                                className="bg-slate-700 border-slate-600 text-white h-8 text-sm" />
                            </div>
                            <div className="text-slate-500 mt-5">de</div>
                            <div className="flex-1">
                              <label className="text-xs text-slate-500 mb-1 block">Total de parcelas</label>
                              <Input type="number" min={0} value={formData.totalParcelas || ''}
                                placeholder="auto"
                                onChange={(e) => setFormData({ ...formData, totalParcelas: parseInt(e.target.value) || 0 })}
                                className="bg-slate-700 border-slate-600 text-white h-8 text-sm placeholder:text-slate-600" />
                            </div>
                          </div>
                          {formData.parcelaInicial > 1 && (
                            <p className="text-xs text-amber-400">
                              ⚠️ {formData.parcelaInicial - 1} parcela(s) anterior(es) serão lançadas como <strong>já pagas</strong> retroativamente.
                            </p>
                          )}
                          {formData.parcelaInicial === 1 && (
                            <p className="text-xs text-slate-500">
                              Deixe em 1 se está cadastrando desde o início.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-slate-700 pt-4 flex justify-between items-center">
            <button onClick={() => setMostrarDetalhes(!mostrarDetalhes)}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
              {mostrarDetalhes ? 'Menos detalhes' : 'Mais detalhes'}
              <ChevronDown className={`w-4 h-4 transition-transform ${mostrarDetalhes ? 'rotate-180' : ''}`} />
            </button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { onOpenChange(false); resetForm(); }}
                className="bg-slate-700 hover:bg-slate-600 text-white border-slate-600">Cancelar</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-red-500 hover:bg-red-600 text-white">{despesaParaEditar ? 'Salvar Alterações' : 'Lançar Despesa'}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GerenciarCategoriasModal open={gerenciarCategoriasOpen} onOpenChange={setGerenciarCategoriasOpen} empresaId={user?.empresa_id} />
    </>
  );
}