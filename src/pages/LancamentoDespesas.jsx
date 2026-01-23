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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/ui/PageHeader';
import { TrendingDown, Search, Trash2, Upload, Calendar as CalendarIcon, ChevronDown, CheckCircle, Repeat } from 'lucide-react';
import { toast } from 'react-hot-toast';
import moment from 'moment';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function LancamentoDespesas() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mostrarDetalhes, setMostrarDetalhes] = useState(true);
  const [formData, setFormData] = useState({
    descricao: '',
    categoria: 'Almoço',
    valor: '',
    data: moment().format('YYYY-MM-DD'),
    responsavel_id: '',
    responsavel_nome: '',
    comprovante_url: '',
    observacao: '',
    foiPaga: true,
    despesaFixa: false,
    repetir: false,
    repeticoes: 2,
    unidadeRepeticao: 'meses',
  });

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

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-despesas'],
    queryFn: async () => {
      return await base44.entities.Colaborador.filter({ status: 'ativo' });
    },
    enabled: !!user,
  });

  const { data: despesas = [], isLoading } = useQuery({
    queryKey: ['despesas'],
    queryFn: async () => {
      return await base44.entities.Despesa.filter({});
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.Despesa.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['despesas']);
      toast.success('Despesa lançada com sucesso!');
      setModalOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.Despesa.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['despesas']);
      toast.success('Despesa excluída!');
    },
  });

  const resetForm = () => {
    setFormData({
      descricao: '',
      categoria: 'Almoço',
      valor: '',
      data: moment().format('YYYY-MM-DD'),
      responsavel_id: '',
      responsavel_nome: '',
      comprovante_url: '',
      observacao: '',
      foiPaga: true,
      despesaFixa: false,
      repetir: false,
      repeticoes: 2,
      unidadeRepeticao: 'meses',
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
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, comprovante_url: file_url });
      toast.success('Comprovante enviado!');
    } catch (error) {
      toast.error('Erro ao enviar comprovante');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!formData.descricao || !formData.valor || !formData.responsavel_id) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    const valor = parseFloat(formData.valor.replace(/[^\d,.-]/g, '').replace(',', '.'));
    if (isNaN(valor) || valor <= 0) {
      toast.error('Valor inválido');
      return;
    }

    createMutation.mutate({
      empresa_id: user.empresa_id,
      descricao: formData.descricao,
      categoria: formData.categoria,
      valor,
      data: formData.data,
      responsavel_id: formData.responsavel_id,
      responsavel_nome: formData.responsavel_nome,
      comprovante_url: formData.comprovante_url,
      observacao: formData.observacao,
      usuario_id: user.id,
      usuario_nome: user.nome || user.full_name,
    });
  };

  const handleExcluir = (id) => {
    if (confirm('Excluir esta despesa?')) {
      deleteMutation.mutate(id);
    }
  };

  const filtered = despesas.filter((d) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        d.descricao?.toLowerCase().includes(term) ||
        d.categoria?.toLowerCase().includes(term) ||
        d.responsavel_nome?.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const totalDespesas = filtered.reduce((acc, d) => acc + (d.valor || 0), 0);

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
        title="Lançamento de Despesas"
        subtitle="Registrar despesas operacionais"
        actionLabel="Nova Despesa"
        onAction={() => setModalOpen(true)}
      />

      {/* Stats */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Total de Despesas</p>
            <p className="text-3xl font-bold text-red-600">
              {totalDespesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
          <TrendingDown className="w-12 h-12 text-red-600" />
        </div>
      </Card>

      {/* Search */}
      <Card className="p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar despesa..."
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
                <th className="text-left p-4 font-semibold text-slate-700">Responsável</th>
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
                    Nenhuma despesa encontrada
                  </td>
                </tr>
              ) : (
                filtered.map((despesa) => (
                  <tr key={despesa.id} className="border-b hover:bg-slate-50">
                    <td className="p-4">{moment(despesa.data).format('DD/MM/YYYY')}</td>
                    <td className="p-4">{despesa.descricao}</td>
                    <td className="p-4 text-sm text-slate-600">{despesa.categoria}</td>
                    <td className="p-4 text-sm">{despesa.responsavel_nome}</td>
                    <td className="p-4 font-semibold text-red-600">
                      {(despesa.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="p-4 text-sm">{despesa.usuario_nome}</td>
                    <td className="p-4">
                      {['master', 'super_admin', 'admin'].includes(user?.perfil) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleExcluir(despesa.id)}
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
        <DialogContent className="max-w-4xl bg-[#2A2A2A] text-white border-0">
          <DialogHeader className="border-b border-slate-700 pb-4">
            <DialogTitle className="text-xl font-semibold">Nova Despesa</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-6 py-4">
            {/* Coluna Esquerda */}
            <div className="space-y-4">
              {/* Valor */}
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

              {/* Foi paga */}
              <div className="flex items-center justify-between border-b border-slate-700 pb-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-slate-400" />
                  <span>Foi paga</span>
                </div>
                <Switch
                  checked={formData.foiPaga}
                  onCheckedChange={(v) => setFormData({ ...formData, foiPaga: v })}
                />
              </div>

              {/* Data */}
              <div className="border-b border-slate-700 pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarIcon className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-400">Data</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={formData.data === moment().format('YYYY-MM-DD') ? 'default' : 'outline'}
                    onClick={() => setFormData({ ...formData, data: moment().format('YYYY-MM-DD') })}
                    className={formData.data === moment().format('YYYY-MM-DD') ? 'bg-red-500 hover:bg-red-600' : 'bg-slate-700 hover:bg-slate-600 text-white'}
                  >
                    Hoje
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={formData.data === moment().subtract(1, 'day').format('YYYY-MM-DD') ? 'default' : 'outline'}
                    onClick={() => setFormData({ ...formData, data: moment().subtract(1, 'day').format('YYYY-MM-DD') })}
                    className={formData.data === moment().subtract(1, 'day').format('YYYY-MM-DD') ? 'bg-red-500 hover:bg-red-600' : 'bg-slate-700 hover:bg-slate-600 text-white'}
                  >
                    Ontem
                  </Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="flex-1 bg-slate-700 hover:bg-slate-600 text-white border-slate-600 justify-start"
                      >
                        <CalendarIcon className="w-4 h-4 mr-2" />
                        {formData.data ? format(new Date(formData.data), 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700">
                      <Calendar
                        mode="single"
                        selected={formData.data ? new Date(formData.data) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            setFormData({ ...formData, data: format(date, 'yyyy-MM-dd') });
                          }
                        }}
                        locale={ptBR}
                        className="bg-slate-800 text-white"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Descrição */}
              <div className="border-b border-slate-700 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">📝</span>
                  <Input
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    placeholder="Descrição"
                    className="bg-transparent border-none text-white focus-visible:ring-0 flex-1"
                  />
                </div>
              </div>

              {/* Categoria */}
              <div className="border-b border-slate-700 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">🏷️</span>
                  <Select
                    value={formData.categoria}
                    onValueChange={(v) => setFormData({ ...formData, categoria: v })}
                  >
                    <SelectTrigger className="bg-transparent border-none text-white focus:ring-0 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="Almoço">Almoço</SelectItem>
                      <SelectItem value="Reunião">Reunião</SelectItem>
                      <SelectItem value="Visita externa">Visita externa</SelectItem>
                      <SelectItem value="Adiantamento">Adiantamento</SelectItem>
                      <SelectItem value="Pagamento de salários">Pagamento de salários</SelectItem>
                      <SelectItem value="Combustível">Combustível</SelectItem>
                      <SelectItem value="Escritório">Escritório</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="Outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Responsável */}
              <div className="border-b border-slate-700 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">👤</span>
                  <Select
                    value={formData.responsavel_id}
                    onValueChange={(v) => {
                      const colab = colaboradores.find((c) => c.id === v);
                      setFormData({
                        ...formData,
                        responsavel_id: v,
                        responsavel_nome: colab?.nome || '',
                      });
                    }}
                  >
                    <SelectTrigger className="bg-transparent border-none text-white focus:ring-0 flex-1">
                      <SelectValue placeholder="Responsável" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {colaboradores.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {mostrarDetalhes && (
                <>
                  {/* Anexar Arquivo */}
                  <div className="border-b border-slate-700 pb-4">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                      <Upload className="w-4 h-4" />
                      <span className="text-sm">Anexar Arquivo</span>
                      <input 
                        type="file" 
                        className="hidden" 
                        onChange={handleFileUpload} 
                        disabled={uploading}
                      />
                    </label>
                    {uploading && <span className="text-xs text-slate-400 mt-1">Enviando...</span>}
                    {formData.comprovante_url && (
                      <p className="text-xs text-green-400 mt-1">✓ Comprovante enviado</p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Coluna Direita */}
            <div className="space-y-4">
              {/* Observação */}
              <div className="border-b border-slate-700 pb-4">
                <Textarea
                  value={formData.observacao}
                  onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
                  placeholder="Observação"
                  rows={3}
                  className="bg-transparent border-none text-white placeholder:text-slate-500 focus-visible:ring-0 resize-none"
                />
              </div>

              {mostrarDetalhes && (
                <>
                  {/* Despesa fixa */}
                  <div className="flex items-center justify-between border-b border-slate-700 pb-4">
                    <div className="flex items-center gap-3">
                      <Repeat className="w-5 h-5 text-slate-400" />
                      <span>Despesa fixa</span>
                    </div>
                    <Switch
                      checked={formData.despesaFixa}
                      onCheckedChange={(v) => setFormData({ ...formData, despesaFixa: v })}
                    />
                  </div>

                  {/* Repetir */}
                  <div className="border-b border-slate-700 pb-4">
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
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="vezes">vezes</SelectItem>
                            <SelectItem value="meses">Meses</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-slate-700 pt-4 flex justify-between items-center">
            <button
              onClick={() => setMostrarDetalhes(!mostrarDetalhes)}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              {mostrarDetalhes ? 'Menos detalhes' : 'Mais detalhes'}
              <ChevronDown className={`w-4 h-4 transition-transform ${mostrarDetalhes ? 'rotate-180' : ''}`} />
            </button>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setModalOpen(false);
                  resetForm();
                }}
                className="bg-slate-700 hover:bg-slate-600 text-white border-slate-600"
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleSubmit}
                className="bg-red-500 hover:bg-red-600 text-white"
              >
                Lançar Despesa
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}