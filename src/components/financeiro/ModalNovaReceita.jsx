import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import GerenciarCategoriasReceitaModal from '@/components/forms/GerenciarCategoriasReceitaModal';
import GerenciarContasBancariasModal from '@/components/forms/GerenciarContasBancariasModal';
import { Calculator, CheckCircle, Tag, FileText, Repeat, Paperclip, ChevronDown, Settings, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

export default function ModalNovaReceita({ open, onOpenChange, user, onSuccess, receitaParaEditar = null }) {
  const queryClient = useQueryClient();
  const [categoriasModalOpen, setCategoriasModalOpen] = useState(false);
  const [contasModalOpen, setContasModalOpen] = useState(false);
  const [mostrarDetalhes, setMostrarDetalhes] = useState(true);
  const [criarSubcatOpen, setCriarSubcatOpen] = useState(false);
  const [novaSubcatNome, setNovaSubcatNome] = useState('');

  const emptyForm = {
    valor: '',
    foiRecebida: true,
    tipoData: 'hoje',
    dataCustom: moment().format('YYYY-MM-DD'),
    descricao: '',
    receitaFixa: false,
    repetir: false,
    repeticoes: 2,
    unidadeRepeticao: 'meses',
    categoria_id: '',
    subcategoria_id: '',
    origem: '',
    filial_id: '',
    filial_nome: '',
  };

  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    if (open) {
      if (receitaParaEditar) {
        setFormData({
          valor: receitaParaEditar.valor ? receitaParaEditar.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
          foiRecebida: receitaParaEditar.status === 'recebida',
          tipoData: 'outro',
          dataCustom: receitaParaEditar.data || moment().format('YYYY-MM-DD'),
          descricao: receitaParaEditar.descricao || '',
          receitaFixa: false,
          repetir: false,
          repeticoes: 2,
          unidadeRepeticao: 'meses',
          categoria_id: receitaParaEditar.categoria_id || '',
          subcategoria_id: receitaParaEditar.subcategoria_id || '',
          origem: receitaParaEditar.conta_bancaria_id || '',
          filial_id: receitaParaEditar.filial_id || '',
          filial_nome: receitaParaEditar.filial_nome || '',
        });
      } else {
        setFormData(emptyForm);
      }
    }
  }, [open, receitaParaEditar]);

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias-receita'],
    queryFn: () => base44.entities.CategoriaReceita.filter({ ativo: true }, 'ordem'),
    enabled: !!user,
  });

  const { data: subcategorias = [] } = useQuery({
    queryKey: ['subcategorias-receita', formData.categoria_id],
    queryFn: () => {
      if (!formData.categoria_id) return [];
      return base44.entities.SubcategoriaReceita.filter({ categoria_id: formData.categoria_id, ativo: true }, 'ordem');
    },
    enabled: !!user && !!formData.categoria_id,
  });

  const { data: filiais = [] } = useQuery({
    queryKey: ['filiais-receita', user?.empresa_id],
    queryFn: () => base44.entities.Filial.filter(user?.empresa_id ? { empresa_id: user.empresa_id, situacao: 'ativa' } : {}, 'nome'),
    enabled: !!user,
  });

  const { data: contas = [] } = useQuery({
    queryKey: ['contas-bancarias', user?.empresa_id],
    queryFn: () => base44.entities.ContaBancaria.filter(
      user?.empresa_id ? { empresa_id: user.empresa_id, status: 'ativa' } : { status: 'ativa' }
    ),
    enabled: !!user,
  });

  const criarSubcatMutation = useMutation({
    mutationFn: (data) => base44.entities.SubcategoriaReceita.create(data),
    onSuccess: (novaSub) => {
      queryClient.invalidateQueries({ queryKey: ['subcategorias-receita', formData.categoria_id] });
      toast.success('Subcategoria criada!');
      setFormData(prev => ({ ...prev, subcategoria_id: novaSub.id }));
      setNovaSubcatNome('');
      setCriarSubcatOpen(false);
    },
  });

  const handleCriarSubcat = () => {
    const nome = novaSubcatNome.trim();
    if (!nome) { toast.error('Digite o nome da subcategoria'); return; }
    if (!formData.categoria_id) { toast.error('Selecione uma categoria primeiro'); return; }
    const categoria = categorias.find(c => c.id === formData.categoria_id);
    criarSubcatMutation.mutate({
      empresa_id: user.empresa_id,
      categoria_id: formData.categoria_id,
      categoria_nome: categoria?.nome || '',
      nome,
      ativo: true,
      ordem: subcategorias.length,
    });
  };

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Receita.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['receitas']);
      queryClient.invalidateQueries(['receitas-transacoes']);
      toast.success('Receita lançada com sucesso!');
      onOpenChange(false);
      resetForm();
      onSuccess?.();
    },
    onError: (err) => {
      toast.error('Erro ao lançar receita: ' + (err?.message || 'Erro desconhecido'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Receita.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['receitas']);
      queryClient.invalidateQueries(['receitas-transacoes']);
      toast.success('Receita atualizada com sucesso!');
      onOpenChange(false);
      resetForm();
      onSuccess?.();
    },
    onError: (err) => {
      toast.error('Erro ao atualizar receita: ' + (err?.message || 'Erro desconhecido'));
    },
  });

  const resetForm = () => {
    setFormData({
      valor: '',
      foiRecebida: true,
      tipoData: 'hoje',
      dataCustom: moment().format('YYYY-MM-DD'),
      descricao: '',
      receitaFixa: false,
      repetir: false,
      repeticoes: 2,
      unidadeRepeticao: 'meses',
      categoria_id: '',
      subcategoria_id: '',
      origem: '',
      filial_id: '',
      filial_nome: '',
    });
    setMostrarDetalhes(true);
  };

  const formatarValor = (val) => {
    let num = val.replace(/\D/g, '');
    if (!num) return '';
    if (num.length === 1) num = '0' + num;
    const reais = num.slice(0, -2) || '0';
    const centavos = num.slice(-2);
    return `${parseInt(reais).toLocaleString('pt-BR')},${centavos}`;
  };

  const handleSubmit = () => {
    if (!formData.categoria_id || !formData.valor || !formData.filial_id) {
      toast.error('Preencha categoria, valor e filial');
      return;
    }
    const valorLimpo = formData.valor.replace(/\./g, '').replace(',', '.');
    const valor = parseFloat(valorLimpo);
    if (isNaN(valor) || valor <= 0) {
      toast.error('Valor inválido');
      return;
    }

    let dataFinal = moment().format('YYYY-MM-DD');
    if (formData.tipoData === 'ontem') dataFinal = moment().subtract(1, 'day').format('YYYY-MM-DD');
    else if (formData.tipoData === 'outro') dataFinal = formData.dataCustom;

    const categoria = categorias.find(c => c.id === formData.categoria_id);
    const subcategoria = formData.subcategoria_id ? subcategorias.find(s => s.id === formData.subcategoria_id) : null;

    let origemFinal = formData.origem;
    if (formData.origem) {
      const conta = contas.find(c => c.id === formData.origem);
      if (conta) origemFinal = `${conta.nome_conta} — ${conta.banco}`;
    }

  const payload = {
      empresa_id: user.empresa_id,
      filial_id: formData.filial_id,
      filial_nome: formData.filial_nome,
      descricao: formData.descricao,
      categoria_id: formData.categoria_id,
      categoria_nome: categoria?.nome || '',
      subcategoria_id: formData.subcategoria_id || null,
      subcategoria_nome: subcategoria?.nome || null,
      valor,
      data: dataFinal,
      status: formData.foiRecebida ? 'recebida' : 'pendente',
      data_recebimento: formData.foiRecebida ? dataFinal : null,
      origem: origemFinal,
      conta_bancaria_id: formData.origem || null,
      usuario_id: user.id,
      usuario_nome: user.nome || user.full_name,
    };

    if (receitaParaEditar) {
      updateMutation.mutate({ id: receitaParaEditar.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#2a2d35] text-white border-none">
          <DialogHeader>
            <DialogTitle className="text-white">{receitaParaEditar ? 'Editar Receita' : 'Nova Receita'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Valor */}
            <div className="border-b border-slate-600 pb-4">
              <div className="flex items-center gap-3">
                <Calculator className="w-6 h-6 text-slate-400" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-green-400">R$</span>
                    <Input value={formData.valor}
                      onChange={(e) => setFormData({ ...formData, valor: formatarValor(e.target.value) })}
                      placeholder="0,00"
                      className="text-2xl font-bold bg-transparent border-none text-green-400 h-auto p-0 focus-visible:ring-0" />
                    <span className="text-sm text-slate-400">BRL</span>
                  </div>
                  {!formData.valor && <p className="text-xs text-orange-400 mt-1">Deve ter um valor diferente de 0</p>}
                </div>
              </div>
            </div>

            {/* Foi recebida */}
            <div className="flex items-center justify-between border-b border-slate-600 pb-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-slate-400" />
                <span>Foi recebida</span>
              </div>
              <Switch checked={formData.foiRecebida} onCheckedChange={(v) => setFormData({ ...formData, foiRecebida: v })} />
            </div>

            {/* Tipo de data */}
            <div className="border-b border-slate-600 pb-4">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-slate-400" />
                <div className="flex gap-2 flex-wrap items-center">
                  {['hoje', 'ontem', 'outro'].map((tipo) => (
                    <Button key={tipo} size="sm" onClick={() => setFormData({ ...formData, tipoData: tipo })}
                      className={formData.tipoData === tipo ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-700 hover:bg-slate-600 text-white'}>
                      {tipo === 'hoje' ? 'Hoje' : tipo === 'ontem' ? 'Ontem' : 'Outros...'}
                    </Button>
                  ))}
                  {formData.tipoData === 'outro' && (
                    <Input type="date" value={formData.dataCustom}
                      onChange={(e) => setFormData({ ...formData, dataCustom: e.target.value })}
                      className="bg-slate-700 border-slate-600 text-white w-auto" />
                  )}
                </div>
              </div>
            </div>

            {/* Descrição */}
            <div className="border-b border-slate-600 pb-4">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-slate-400" />
                <Input value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Descrição" className="bg-transparent border-none text-white placeholder:text-slate-500 focus-visible:ring-0" />
              </div>
            </div>

            {mostrarDetalhes && (
              <>
                <div className="flex items-center justify-between border-b border-slate-600 pb-4">
                  <div className="flex items-center gap-3"><Repeat className="w-5 h-5 text-slate-400" /><span>Receita fixa</span></div>
                  <Switch checked={formData.receitaFixa} onCheckedChange={(v) => setFormData({ ...formData, receitaFixa: v })} />
                </div>

                <div className="border-b border-slate-600 pb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3"><Repeat className="w-5 h-5 text-slate-400" /><span>Repetir</span></div>
                    <Switch checked={formData.repetir} onCheckedChange={(v) => setFormData({ ...formData, repetir: v })} />
                  </div>
                  {formData.repetir && (
                    <div className="flex gap-2">
                      <Input type="number" value={formData.repeticoes}
                        onChange={(e) => setFormData({ ...formData, repeticoes: parseInt(e.target.value) || 2 })}
                        className="w-20 bg-slate-700 border-slate-600 text-white" />
                      <Select value={formData.unidadeRepeticao} onValueChange={(v) => setFormData({ ...formData, unidadeRepeticao: v })}>
                        <SelectTrigger className="bg-slate-700 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vezes">vezes</SelectItem>
                          <SelectItem value="meses">Meses</SelectItem>
                          <SelectItem value="anos">Anos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Categoria */}
                <div className="border-b border-slate-600 pb-4">
                  <div className="flex items-center gap-3">
                    <Tag className="w-5 h-5 text-slate-400" />
                    <div className="flex-1">
                      <Select value={formData.categoria_id} onValueChange={(v) => setFormData({ ...formData, categoria_id: v, subcategoria_id: '' })}>
                        <SelectTrigger className="bg-transparent border-none text-white focus:ring-0">
                          <SelectValue placeholder="Selecione a categoria *" />
                        </SelectTrigger>
                        <SelectContent>
                          {categorias.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {!formData.categoria_id && <p className="text-xs text-orange-400 mt-1">Campo obrigatório</p>}
                    </div>
                    <Button type="button" size="icon" variant="ghost" onClick={() => setCategoriasModalOpen(true)} className="text-slate-400 hover:text-white">
                      <Settings className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {formData.categoria_id && (
                  <div className="border-b border-slate-600 pb-4 space-y-2">
                    <div className="flex items-center gap-3">
                      <Tag className="w-5 h-5 text-slate-400" />
                      <Select value={formData.subcategoria_id} onValueChange={(v) => {
                        if (v === '__nova__') { setCriarSubcatOpen(true); }
                        else { setFormData({ ...formData, subcategoria_id: v }); }
                      }}>
                        <SelectTrigger className="bg-transparent border-none text-white focus:ring-0">
                          <SelectValue placeholder="Subcategoria (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {subcategorias.map(sub => <SelectItem key={sub.id} value={sub.id}>{sub.nome}</SelectItem>)}
                          {formData.subcategoria_id && (
                            <SelectItem value={null}>— Remover subcategoria</SelectItem>
                          )}
                          <div className="h-px bg-slate-200 my-1" />
                          <SelectItem value="__nova__" className="text-blue-500 font-semibold">
                            <div className="flex items-center gap-2"><Plus className="w-4 h-4" />Nova subcategoria</div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
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
                <div className="border-b border-slate-600 pb-4">
                  <div className="flex items-center gap-3">
                    <Tag className="w-5 h-5 text-slate-400" />
                    <Select value={formData.filial_id} onValueChange={(v) => {
                      const f = filiais.find(f => f.id === v);
                      setFormData({ ...formData, filial_id: v, filial_nome: f?.nome || '' });
                    }}>
                      <SelectTrigger className="bg-transparent border-none text-white focus:ring-0">
                        <SelectValue placeholder="Filial (obrigatório) *" />
                      </SelectTrigger>
                      <SelectContent>
                        {filiais.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {!formData.filial_id && <p className="text-xs text-orange-400 mt-1 pl-8">Campo obrigatório</p>}
                </div>

                {/* Conta Bancária */}
                <div className="border-b border-slate-600 pb-4">
                  <div className="flex items-center gap-3">
                    <Calculator className="w-5 h-5 text-slate-400" />
                    <div className="flex-1">
                      <Select value={formData.origem} onValueChange={(v) => setFormData({ ...formData, origem: v })}>
                        <SelectTrigger className="bg-transparent border-none text-white focus:ring-0">
                          <SelectValue placeholder="Selecione a conta bancária" />
                        </SelectTrigger>
                        <SelectContent>
                          {contas.map(conta => (
                            <SelectItem key={conta.id} value={conta.id}>{conta.nome_conta} — {conta.banco}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="button" size="icon" variant="ghost" onClick={() => setContasModalOpen(true)} className="text-slate-400 hover:text-white">
                      <Settings className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="border-b border-slate-600 pb-4">
                  <div className="flex items-center gap-3 text-slate-400">
                    <Paperclip className="w-5 h-5" />
                    <span>Anexar Arquivo</span>
                  </div>
                </div>
              </>
            )}

            <button onClick={() => setMostrarDetalhes(!mostrarDetalhes)}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
              {mostrarDetalhes ? 'Menos detalhes' : 'Mais detalhes'}
              <ChevronDown className={`w-4 h-4 transition-transform ${mostrarDetalhes ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => { onOpenChange(false); resetForm(); }}
              className="bg-slate-700 hover:bg-slate-600 text-white border-none">Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="bg-green-600 hover:bg-green-700">
              {receitaParaEditar ? 'Salvar Alterações' : 'Lançar Receita'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GerenciarCategoriasReceitaModal open={categoriasModalOpen} onOpenChange={setCategoriasModalOpen} empresaId={user?.empresa_id} />
      <GerenciarContasBancariasModal open={contasModalOpen} onOpenChange={setContasModalOpen} empresaId={user?.empresa_id} />
    </>
  );
}