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
import { TrendingUp, Search, Trash2, Calculator, CheckCircle, Tag, FileText, Repeat, Paperclip, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

export default function LancamentoReceitas() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    valor: '',
    foiRecebida: true,
    tipoData: 'hoje',
    dataCustom: moment().format('YYYY-MM-DD'),
    descricao: '',
    observacao: '',
    receitaFixa: false,
    repetir: false,
    repeticoes: 2,
    unidadeRepeticao: 'meses',
    categoria: 'Bônus',
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
      observacao: '',
      receitaFixa: false,
      repetir: false,
      repeticoes: 2,
      unidadeRepeticao: 'meses',
      categoria: 'Bônus',
      origem: '',
    });
    setMostrarDetalhes(true);
  };

  const handleSubmit = () => {
    if (!formData.categoria || !formData.valor) {
      toast.error('Preencha categoria e valor');
      return;
    }

    const valor = parseFloat(formData.valor.replace(/[^\d,.-]/g, '').replace(',', '.'));
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

    createMutation.mutate({
      empresa_id: user.empresa_id,
      descricao: formData.descricao,
      categoria: formData.categoria,
      valor,
      data: dataFinal,
      origem: formData.origem,
      observacao: formData.observacao,
      usuario_id: user.id,
      usuario_nome: user.nome || user.full_name,
    });
  };

  const formatarValor = (val) => {
    const num = val.replace(/\D/g, '');
    if (!num) return '';
    const valor = parseFloat(num) / 100;
    return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
                <th className="text-left p-4 font-semibold text-slate-700">Data</th>
                <th className="text-left p-4 font-semibold text-slate-700">Descrição</th>
                <th className="text-left p-4 font-semibold text-slate-700">Categoria</th>
                <th className="text-left p-4 font-semibold text-slate-700">Origem</th>
                <th className="text-left p-4 font-semibold text-slate-700">Valor</th>
                <th className="text-left p-4 font-semibold text-slate-700">Lançado por</th>
                <th className="text-left p-4 font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Nenhuma receita encontrada
                  </td>
                </tr>
              ) : (
                filtered.map((receita) => (
                  <tr key={receita.id} className="border-b hover:bg-slate-50">
                    <td className="p-4">{moment(receita.data).format('DD/MM/YYYY')}</td>
                    <td className="p-4">{receita.descricao}</td>
                    <td className="p-4 text-sm text-slate-600">{receita.categoria}</td>
                    <td className="p-4 text-sm text-slate-600">{receita.origem || '-'}</td>
                    <td className="p-4 font-semibold text-green-600">
                      {(receita.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="p-4 text-sm">{receita.usuario_nome}</td>
                    <td className="p-4">
                      {['master', 'super_admin', 'admin'].includes(user?.perfil) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleExcluir(receita.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
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
            <DialogTitle className="text-white">Nova receita</DialogTitle>
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
                      className="text-4xl font-bold bg-transparent border-none text-green-400 h-auto p-0 focus-visible:ring-0"
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

            {/* Observação */}
            <div className="border-b border-slate-600 pb-4">
              <div className="flex items-center gap-3">
                <Tag className="w-5 h-5 text-slate-400" />
                <Input
                  value={formData.observacao}
                  onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
                  placeholder="Observação"
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
                        value={formData.categoria}
                        onValueChange={(v) => setFormData({ ...formData, categoria: v })}
                      >
                        <SelectTrigger className="bg-transparent border-none text-white focus:ring-0">
                          <SelectValue placeholder="Categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Bônus">Bônus</SelectItem>
                          <SelectItem value="Repasse">Repasse</SelectItem>
                          <SelectItem value="Ajuste">Ajuste</SelectItem>
                          <SelectItem value="Outros">Outros</SelectItem>
                        </SelectContent>
                      </Select>
                      {!formData.categoria && (
                        <p className="text-xs text-orange-400 mt-1">Campo obrigatório</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Origem (Conta) */}
                <div className="border-b border-slate-600 pb-4">
                  <div className="flex items-center gap-3">
                    <Calculator className="w-5 h-5 text-slate-400" />
                    <Input
                      value={formData.origem}
                      onChange={(e) => setFormData({ ...formData, origem: e.target.value })}
                      placeholder="Conta/Origem"
                      className="bg-transparent border-none text-white placeholder:text-slate-500 focus-visible:ring-0"
                    />
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
              Lançar Receita
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}