import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/ui/PageHeader';
import { TrendingUp, Search, Trash2, Calculator, CheckCircle, Tag, FileText, Repeat, Paperclip, ChevronDown, Settings, MoreVertical, Edit2, Check } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import moment from 'moment';
import GerenciarCategoriasReceitaModal from '@/components/forms/GerenciarCategoriasReceitaModal';
import GerenciarContasBancariasModal from '@/components/forms/GerenciarContasBancariasModal';

export default function LancamentoReceitas() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [categoriasModalOpen, setCategoriasModalOpen] = useState(false);
  const [contasModalOpen, setContasModalOpen] = useState(false);
  const [editingReceita, setEditingReceita] = useState(null);
  const [recebimentoModalOpen, setRecebimentoModalOpen] = useState(false);
  const [receitaParaReceber, setReceitaParaReceber] = useState(null);
  const [dataRecebimento, setDataRecebimento] = useState(moment().format('YYYY-MM-DD'));
  const [formData, setFormData] = useState({
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
  });
  const [mostrarDetalhes, setMostrarDetalhes] = useState(true);

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
        setUser({ ...me, perfil: colab.perfil, empresa_id: colab.empresa_id, nome: colab.nome });
      }
    }
  };

  const { data: receitas = [], isLoading } = useQuery({
    queryKey: ['receitas'],
    queryFn: async () => {
      return await base44.entities.Receita.filter({});
    },
    enabled: !!user,
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias-receita'],
    queryFn: async () => {
      return await base44.entities.CategoriaReceita.filter({ ativo: true }, 'ordem');
    },
    enabled: !!user,
  });

  const { data: subcategorias = [] } = useQuery({
    queryKey: ['subcategorias-receita', formData.categoria_id],
    queryFn: async () => {
      if (!formData.categoria_id) return [];
      return await base44.entities.SubcategoriaReceita.filter({ 
        categoria_id: formData.categoria_id, 
        ativo: true 
      }, 'ordem');
    },
    enabled: !!user && !!formData.categoria_id,
  });

  const { data: contas = [] } = useQuery({
    queryKey: ['contas-bancarias'],
    queryFn: async () => {
      return await base44.entities.ContaBancaria.filter({ ativo: true }, 'ordem');
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.Receita.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['receitas']);
      toast.success('Receita lançada com sucesso!');
      setModalOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.Receita.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['receitas']);
      toast.success('Receita atualizada!');
      setModalOpen(false);
      resetForm();
    },
  });

  const finalizarRecebimentoMutation = useMutation({
    mutationFn: async ({ id, data_recebimento }) => {
      return await base44.entities.Receita.update(id, {
        status: 'recebida',
        data_recebimento
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['receitas']);
      toast.success('Receita marcada como recebida!');
      setRecebimentoModalOpen(false);
      setReceitaParaReceber(null);
      setDataRecebimento(moment().format('YYYY-MM-DD'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.Receita.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['receitas']);
      toast.success('Receita excluída!');
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
    });
    setMostrarDetalhes(true);
    setEditingReceita(null);
  };

  const handleEdit = (receita) => {
    setEditingReceita(receita);
    setFormData({
      valor: receita.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      foiRecebida: receita.status === 'recebida',
      tipoData: 'outro',
      dataCustom: receita.data,
      descricao: receita.descricao || '',
      receitaFixa: false,
      repetir: false,
      repeticoes: 2,
      unidadeRepeticao: 'meses',
      categoria_id: receita.categoria_id || '',
      subcategoria_id: receita.subcategoria_id || '',
      origem: receita.origem || '',
    });
    setModalOpen(true);
  };

  const handleAbrirRecebimento = (receita) => {
    setReceitaParaReceber(receita);
    setDataRecebimento(moment().format('YYYY-MM-DD'));
    setRecebimentoModalOpen(true);
  };

  const handleConfirmarRecebimento = () => {
    if (!dataRecebimento) {
      toast.error('Informe a data de recebimento');
      return;
    }
    finalizarRecebimentoMutation.mutate({
      id: receitaParaReceber.id,
      data_recebimento: dataRecebimento
    });
  };

  const handleSubmit = () => {
    if (!formData.categoria_id || !formData.valor) {
      toast.error('Preencha categoria e valor');
      return;
    }

    // Remove pontos de milhar, substitui vírgula por ponto, depois converte
    const valorLimpo = formData.valor.replace(/\./g, '').replace(',', '.');
    const valor = parseFloat(valorLimpo);
    if (isNaN(valor) || valor <= 0) {
      toast.error('Valor inválido');
      return;
    }

    let dataFinal = moment().format('YYYY-MM-DD');
    if (formData.tipoData === 'hoje') {
      dataFinal = moment().format('YYYY-MM-DD');
    } else if (formData.tipoData === 'ontem') {
      dataFinal = moment().subtract(1, 'day').format('YYYY-MM-DD');
    } else {
      dataFinal = formData.dataCustom;
    }

    const categoria = categorias.find(c => c.id === formData.categoria_id);
    const subcategoria = formData.subcategoria_id 
      ? subcategorias.find(s => s.id === formData.subcategoria_id) 
      : null;
    
    // Buscar nome da conta se origem for um ID
    let origemFinal = formData.origem;
    if (formData.origem) {
      const conta = contas.find(c => c.id === formData.origem);
      if (conta) {
        origemFinal = `${conta.codigo_banco} - ${conta.nome_banco}`;
      }
    }

    const payload = {
      empresa_id: user.empresa_id,
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
      usuario_id: user.id,
      usuario_nome: user.nome || user.full_name,
    };

    if (editingReceita) {
      updateMutation.mutate({ id: editingReceita.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const formatarValor = (val) => {
    // Remove tudo exceto dígitos
    let num = val.replace(/\D/g, '');
    if (!num) return '';
    
    // Adiciona centavos se não tiver o suficiente
    if (num.length === 1) num = '0' + num;
    
    // Separa reais e centavos
    const reais = num.slice(0, -2) || '0';
    const centavos = num.slice(-2);
    
    // Formata com separador de milhares
    const reaisFormatado = parseInt(reais).toLocaleString('pt-BR');
    
    return `${reaisFormatado},${centavos}`;
  };

  const handleExcluir = (id) => {
    if (confirm('Excluir esta receita?')) {
      deleteMutation.mutate(id);
    }
  };

  const filtered = receitas.filter((r) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return r.descricao?.toLowerCase().includes(term) || r.origem?.toLowerCase().includes(term);
    }
    return true;
  });

  const totalReceitas = filtered.reduce((acc, r) => acc + (r.valor || 0), 0);

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(user?.perfil);

  if (!user || !isAdmin) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <p className="text-slate-600">Acesso restrito a administradores e gerentes</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Lançamento de Receitas"
        subtitle="Receitas que não são comissões (bônus, repasses, ajustes)"
        actionLabel="Nova Receita"
        onAction={() => setModalOpen(true)}
      />

      {/* Stats */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Total de Receitas</p>
            <p className="text-3xl font-bold text-green-600">
              {totalReceitas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
          <TrendingUp className="w-12 h-12 text-green-600" />
        </div>
      </Card>

      {/* Search */}
      <Card className="p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar receita..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-4 font-semibold text-slate-700">Status</th>
                <th className="text-left p-4 font-semibold text-slate-700">Data</th>
                <th className="text-left p-4 font-semibold text-slate-700">Descrição</th>
                <th className="text-left p-4 font-semibold text-slate-700">Categoria</th>
                <th className="text-left p-4 font-semibold text-slate-700">Subcategoria</th>
                <th className="text-left p-4 font-semibold text-slate-700">Origem</th>
                <th className="text-left p-4 font-semibold text-slate-700">Valor</th>
                <th className="text-left p-4 font-semibold text-slate-700">Lançado por</th>
                <th className="text-left p-4 font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    Nenhuma receita encontrada
                  </td>
                </tr>
              ) : (
                filtered.map((receita) => (
                  <tr key={receita.id} className="border-b hover:bg-slate-50">
                    <td className="p-4">
                      {receita.status === 'pendente' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAbrirRecebimento(receita)}
                          className="bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100"
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Receber
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm">Recebida</span>
                        </div>
                      )}
                    </td>
                    <td className="p-4">{moment(receita.data).format('DD/MM/YYYY')}</td>
                    <td className="p-4">{receita.descricao}</td>
                    <td className="p-4 text-sm text-slate-600">{receita.categoria_nome || receita.categoria || '-'}</td>
                    <td className="p-4 text-sm text-slate-600">{receita.subcategoria_nome || '-'}</td>
                    <td className="p-4 text-sm text-slate-600">{receita.origem || '-'}</td>
                    <td className="p-4 font-semibold text-green-600">
                      {(receita.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="p-4 text-sm">{receita.usuario_nome}</td>
                    <td className="p-4">
                      {['master', 'super_admin', 'admin'].includes(user?.perfil) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(receita)}>
                              <Edit2 className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleExcluir(receita.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#2a2d35] text-white border-none">
          <DialogHeader>
            <DialogTitle className="text-white">{editingReceita ? 'Editar receita' : 'Nova receita'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Valor */}
            <div className="border-b border-slate-600 pb-4">
              <div className="flex items-center gap-3">
                <Calculator className="w-6 h-6 text-slate-400" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-green-400">R$</span>
                    <Input
                      value={formData.valor}
                      onChange={(e) => setFormData({ ...formData, valor: formatarValor(e.target.value) })}
                      placeholder="0,00"
                      className="text-2xl font-bold bg-transparent border-none text-green-400 h-auto p-0 focus-visible:ring-0"
                    />
                    <span className="text-sm text-slate-400">BRL</span>
                  </div>
                  {!formData.valor && (
                    <p className="text-xs text-orange-400 mt-1">Deve ter um valor diferente de 0</p>
                  )}
                </div>
              </div>
            </div>

            {/* Foi recebida */}
            <div className="flex items-center justify-between border-b border-slate-600 pb-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-slate-400" />
                <span>Foi recebida</span>
              </div>
              <Switch
                checked={formData.foiRecebida}
                onCheckedChange={(v) => setFormData({ ...formData, foiRecebida: v })}
              />
            </div>

            {/* Tipo de data */}
            <div className="border-b border-slate-600 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <FileText className="w-5 h-5 text-slate-400" />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={formData.tipoData === 'hoje' ? 'default' : 'outline'}
                    onClick={() => setFormData({ ...formData, tipoData: 'hoje' })}
                    className={formData.tipoData === 'hoje' ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-700 hover:bg-slate-600 text-white'}
                  >
                    Hoje
                  </Button>
                  <Button
                    size="sm"
                    variant={formData.tipoData === 'ontem' ? 'default' : 'outline'}
                    onClick={() => setFormData({ ...formData, tipoData: 'ontem' })}
                    className={formData.tipoData === 'ontem' ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-700 hover:bg-slate-600 text-white'}
                  >
                    Ontem
                  </Button>
                  <Button
                    size="sm"
                    variant={formData.tipoData === 'outro' ? 'default' : 'outline'}
                    onClick={() => setFormData({ ...formData, tipoData: 'outro' })}
                    className={formData.tipoData === 'outro' ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-700 hover:bg-slate-600 text-white'}
                  >
                    Outros...
                  </Button>
                </div>
              </div>
              {formData.tipoData === 'outro' && (
                <Input
                  type="date"
                  value={formData.dataCustom}
                  onChange={(e) => setFormData({ ...formData, dataCustom: e.target.value })}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              )}
            </div>

            {/* Descrição */}
            <div className="border-b border-slate-600 pb-4">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-slate-400" />
                <Input
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Descrição"
                  className="bg-transparent border-none text-white placeholder:text-slate-500 focus-visible:ring-0"
                />
              </div>
            </div>

            {mostrarDetalhes && (
              <>
                {/* Receita fixa */}
                <div className="flex items-center justify-between border-b border-slate-600 pb-4">
                  <div className="flex items-center gap-3">
                    <Repeat className="w-5 h-5 text-slate-400" />
                    <span>Receita fixa</span>
                  </div>
                  <Switch
                    checked={formData.receitaFixa}
                    onCheckedChange={(v) => setFormData({ ...formData, receitaFixa: v })}
                  />
                </div>

                {/* Repetir */}
                <div className="border-b border-slate-600 pb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Repeat className="w-5 h-5 text-slate-400" />
                      <span>Repetir</span>
                    </div>
                    <Switch
                      checked={formData.repetir}
                      onCheckedChange={(v) => setFormData({ ...formData, repetir: v })}
                    />
                  </div>
                  {formData.repetir && (
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={formData.repeticoes}
                        onChange={(e) => setFormData({ ...formData, repeticoes: parseInt(e.target.value) || 2 })}
                        className="w-20 bg-slate-700 border-slate-600 text-white"
                      />
                      <Select
                        value={formData.unidadeRepeticao}
                        onValueChange={(v) => setFormData({ ...formData, unidadeRepeticao: v })}
                      >
                        <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                          <SelectValue />
                        </SelectTrigger>
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
                      <Select
                        value={formData.categoria_id}
                        onValueChange={(v) => setFormData({ ...formData, categoria_id: v, subcategoria_id: '' })}
                      >
                        <SelectTrigger className="bg-transparent border-none text-white focus:ring-0">
                          <SelectValue placeholder="Selecione a categoria *" />
                        </SelectTrigger>
                        <SelectContent>
                          {categorias.length > 0 ? (
                            categorias.map(cat => (
                              <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>
                            ))
                          ) : (
                            <div className="p-4 text-center text-sm text-slate-500">
                              Nenhuma categoria cadastrada
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                      {!formData.categoria_id && (
                        <p className="text-xs text-orange-400 mt-1">Campo obrigatório</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setCategoriasModalOpen(true)}
                      className="text-slate-400 hover:text-white"
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Subcategoria */}
                {formData.categoria_id && (
                  <div className="border-b border-slate-600 pb-4">
                    <div className="flex items-center gap-3">
                      <Tag className="w-5 h-5 text-slate-400" />
                      <div className="flex-1">
                        <Select
                          value={formData.subcategoria_id}
                          onValueChange={(v) => setFormData({ ...formData, subcategoria_id: v })}
                        >
                          <SelectTrigger className="bg-transparent border-none text-white focus:ring-0">
                            <SelectValue placeholder="Subcategoria (opcional)" />
                          </SelectTrigger>
                          <SelectContent>
                            {subcategorias.length > 0 ? (
                              subcategorias.map(sub => (
                                <SelectItem key={sub.id} value={sub.id}>{sub.nome}</SelectItem>
                              ))
                            ) : (
                              <div className="p-4 text-center text-sm text-slate-500">
                                Nenhuma subcategoria cadastrada
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Conta Bancária */}
                <div className="border-b border-slate-600 pb-4">
                  <div className="flex items-center gap-3">
                    <Calculator className="w-5 h-5 text-slate-400" />
                    <div className="flex-1">
                      <Select
                        value={formData.origem}
                        onValueChange={(v) => setFormData({ ...formData, origem: v })}
                      >
                        <SelectTrigger className="bg-transparent border-none text-white focus:ring-0">
                          {formData.origem ? (
                            <div className="flex items-center gap-2">
                              {(() => {
                                const conta = contas.find(c => c.id === formData.origem);
                                return (
                                  <>
                                    {conta?.logo_url ? (
                                      <img src={conta.logo_url} alt="" className="w-6 h-6 rounded-full object-cover border border-slate-600" />
                                    ) : (
                                      <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center">
                                        <Calculator className="w-3 h-3 text-slate-400" />
                                      </div>
                                    )}
                                    <span>{conta?.codigo_banco} - {conta?.nome_banco}</span>
                                  </>
                                );
                              })()}
                            </div>
                          ) : (
                            <SelectValue placeholder="Selecione a conta bancária" />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          {contas.length > 0 ? (
                            contas.map(conta => (
                              <SelectItem key={conta.id} value={conta.id}>
                                <div className="flex items-center gap-2">
                                  {conta.logo_url ? (
                                    <img src={conta.logo_url} alt="" className="w-6 h-6 rounded-full object-cover border border-slate-200" />
                                  ) : (
                                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                                      <Calculator className="w-3 h-3 text-slate-400" />
                                    </div>
                                  )}
                                  <span>{conta.codigo_banco} - {conta.nome_banco}</span>
                                </div>
                              </SelectItem>
                            ))
                          ) : (
                            <div className="p-4 text-center text-sm text-slate-500">
                              Nenhuma conta cadastrada
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setContasModalOpen(true)}
                      className="text-slate-400 hover:text-white"
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Anexar Arquivo */}
                <div className="border-b border-slate-600 pb-4">
                  <div className="flex items-center gap-3 text-slate-400">
                    <Paperclip className="w-5 h-5" />
                    <span>Anexar Arquivo</span>
                  </div>
                </div>
              </>
            )}

            {/* Toggle Detalhes */}
            <button
              onClick={() => setMostrarDetalhes(!mostrarDetalhes)}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              {mostrarDetalhes ? 'Menos detalhes' : 'Mais detalhes'}
              <ChevronDown className={`w-4 h-4 transition-transform ${mostrarDetalhes ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <DialogFooter className="mt-6">
            <Button 
              variant="outline" 
              onClick={() => {
                setModalOpen(false);
                resetForm();
              }}
              className="bg-slate-700 hover:bg-slate-600 text-white border-none"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              className="bg-green-600 hover:bg-green-700"
            >
              {editingReceita ? 'Atualizar Receita' : 'Lançar Receita'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Gerenciar Categorias */}
      <GerenciarCategoriasReceitaModal
        open={categoriasModalOpen}
        onOpenChange={setCategoriasModalOpen}
        empresaId={user?.empresa_id}
      />

      {/* Modal Gerenciar Contas Bancárias */}
      <GerenciarContasBancariasModal
        open={contasModalOpen}
        onOpenChange={setContasModalOpen}
        empresaId={user?.empresa_id}
      />

      {/* Modal Confirmar Recebimento */}
      <Dialog open={recebimentoModalOpen} onOpenChange={setRecebimentoModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Recebimento</DialogTitle>
          </DialogHeader>
          
          {receitaParaReceber && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600 mb-1">Receita</p>
                <p className="font-semibold">{receitaParaReceber.descricao}</p>
                <p className="text-2xl font-bold text-green-600 mt-2">
                  {(receitaParaReceber.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>

              <div>
                <Label>Data de Recebimento</Label>
                <Input
                  type="date"
                  value={dataRecebimento}
                  onChange={(e) => setDataRecebimento(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setRecebimentoModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmarRecebimento}
              className="bg-green-600 hover:bg-green-700"
            >
              Confirmar Recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}