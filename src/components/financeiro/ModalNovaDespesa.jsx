import React, { useState } from 'react';
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
import { TrendingDown, Upload, Calendar as CalendarIcon, ChevronDown, CheckCircle, Repeat, Settings } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ModalNovaDespesa({ open, onOpenChange, user, onSuccess }) {
  const queryClient = useQueryClient();
  const [gerenciarCategoriasOpen, setGerenciarCategoriasOpen] = useState(false);
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

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-despesas'],
    queryFn: () => base44.entities.Colaborador.filter({ status: 'ativo' }),
    enabled: !!user,
  });

  const { data: categoriasPersonalizadas = [] } = useQuery({
    queryKey: ['categorias-despesa', user?.empresa_id],
    queryFn: async () => {
      if (!user?.empresa_id) return [];
      const cats = await base44.entities.CategoriaDespesa.filter({ empresa_id: user.empresa_id, status: 'ativa' });
      return cats.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    },
    enabled: !!user?.empresa_id,
  });

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
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setFormData({ ...formData, comprovante_url: file_url });
    toast.success('Comprovante enviado!');
    setUploading(false);
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
      status: formData.foiPaga ? 'pago' : 'pendente',
      data_pagamento: formData.foiPaga ? formData.data : undefined,
      responsavel_id: formData.responsavel_id,
      responsavel_nome: formData.responsavel_nome,
      comprovante_url: formData.comprovante_url,
      observacao: formData.observacao,
      usuario_id: user.id,
      usuario_nome: user.nome || user.full_name,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-4xl bg-[#2A2A2A] text-white border-0">
          <DialogHeader className="border-b border-slate-700 pb-4">
            <DialogTitle className="text-xl font-semibold">Nova Despesa</DialogTitle>
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
                        {formData.data ? format(new Date(formData.data), 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700">
                      <Calendar mode="single" selected={formData.data ? new Date(formData.data) : undefined}
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

              <div className="border-b border-slate-700 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">🏷️</span>
                  <Select value={formData.categoria} onValueChange={(v) => {
                    if (v === '__gerenciar__') { setGerenciarCategoriasOpen(true); }
                    else { setFormData({ ...formData, categoria: v }); }
                  }}>
                    <SelectTrigger className="bg-transparent border-none text-white focus:ring-0 flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {categoriasPersonalizadas.map((cat) => (
                        <SelectItem key={cat.id} value={cat.nome}>{cat.icone} {cat.nome}</SelectItem>
                      ))}
                      {categoriasPersonalizadas.length > 0 && <div className="h-px bg-slate-600 my-1" />}
                      <SelectItem value="Almoço">🍽️ Almoço</SelectItem>
                      <SelectItem value="Reunião">👥 Reunião</SelectItem>
                      <SelectItem value="Visita externa">🚗 Visita externa</SelectItem>
                      <SelectItem value="Adiantamento">💵 Adiantamento</SelectItem>
                      <SelectItem value="Pagamento de salários">💰 Pagamento de salários</SelectItem>
                      <SelectItem value="Combustível">⛽ Combustível</SelectItem>
                      <SelectItem value="Escritório">🏢 Escritório</SelectItem>
                      <SelectItem value="Marketing">📢 Marketing</SelectItem>
                      <SelectItem value="Outros">📦 Outros</SelectItem>
                      <div className="h-px bg-slate-600 my-1" />
                      <SelectItem value="__gerenciar__" className="text-blue-400 font-semibold">
                        <div className="flex items-center gap-2"><Settings className="w-4 h-4" />Gerenciar categorias</div>
                      </SelectItem>
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
                      <div className="flex gap-2">
                        <Input type="number" value={formData.repeticoes}
                          onChange={(e) => setFormData({ ...formData, repeticoes: parseInt(e.target.value) || 2 })}
                          className="w-20 bg-slate-700 border-slate-600 text-white" />
                        <Select value={formData.unidadeRepeticao} onValueChange={(v) => setFormData({ ...formData, unidadeRepeticao: v })}>
                          <SelectTrigger className="bg-slate-700 border-slate-600 text-white"><SelectValue /></SelectTrigger>
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
            <button onClick={() => setMostrarDetalhes(!mostrarDetalhes)}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
              {mostrarDetalhes ? 'Menos detalhes' : 'Mais detalhes'}
              <ChevronDown className={`w-4 h-4 transition-transform ${mostrarDetalhes ? 'rotate-180' : ''}`} />
            </button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { onOpenChange(false); resetForm(); }}
                className="bg-slate-700 hover:bg-slate-600 text-white border-slate-600">Cancelar</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending}
                className="bg-red-500 hover:bg-red-600 text-white">Lançar Despesa</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GerenciarCategoriasModal open={gerenciarCategoriasOpen} onOpenChange={setGerenciarCategoriasOpen} empresaId={user?.empresa_id} />
    </>
  );
}