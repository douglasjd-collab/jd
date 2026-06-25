import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';

const TIPO_BEM_OPTIONS = [
  { value: 'automovel', label: 'Automóvel' },
  { value: 'imovel', label: 'Imóvel' },
  { value: 'motocicleta', label: 'Motocicleta' },
  { value: 'servico', label: 'Serviço' },
  { value: 'outros', label: 'Outros' },
];

export default function CadastroMenorLanceModal({ open, onOpenChange, empresaId, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [registros, setRegistros] = useState([]);
  const [form, setForm] = useState({
    administradora: '',
    grupo: '',
    tipo_bem: 'automovel',
    modalidade: 'livre',
    menor_lance_percentual: '',
    data_assembleia: new Date().toISOString().slice(0, 10),
    observacao: '',
  });

  useEffect(() => {
    if (open && empresaId) carregarRegistros();
  }, [open, empresaId]);

  const carregarRegistros = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.MenorLanceAssembleia.filter(
        { empresa_id: empresaId },
        '-data_assembleia',
        50
      );
      setRegistros(data);
    } catch {
      toast.error('Erro ao carregar registros');
    } finally {
      setLoading(false);
    }
  };

  const handleSalvar = async () => {
    if (!form.administradora || !form.grupo || !form.menor_lance_percentual || !form.data_assembleia) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setSalvando(true);
    try {
      await base44.entities.MenorLanceAssembleia.create({
        ...form,
        empresa_id: empresaId,
        menor_lance_percentual: parseFloat(form.menor_lance_percentual),
      });
      toast.success('Registro salvo!');
      setForm({ administradora: '', grupo: '', tipo_bem: 'automovel', modalidade: 'livre', menor_lance_percentual: '', data_assembleia: new Date().toISOString().slice(0, 10), observacao: '' });
      carregarRegistros();
      onSaved?.();
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async (id) => {
    try {
      await base44.entities.MenorLanceAssembleia.delete(id);
      toast.success('Excluído');
      carregarRegistros();
    } catch {
      toast.error('Erro ao excluir');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastro — Menor Lance da Última Assembleia</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Formulário */}
          <div className="bg-slate-50 rounded-xl border p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Novo Registro</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Administradora *</Label>
                <Input value={form.administradora} onChange={e => setForm(f => ({ ...f, administradora: e.target.value }))} placeholder="Ex: Canopus" className="h-9 mt-1" />
              </div>
              <div>
                <Label className="text-xs">Grupo *</Label>
                <Input value={form.grupo} onChange={e => setForm(f => ({ ...f, grupo: e.target.value }))} placeholder="Ex: 8120" className="h-9 mt-1" />
              </div>
              <div>
                <Label className="text-xs">Tipo de Bem *</Label>
                <Select value={form.tipo_bem} onValueChange={v => setForm(f => ({ ...f, tipo_bem: v }))}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPO_BEM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Modalidade *</Label>
                <Select value={form.modalidade} onValueChange={v => setForm(f => ({ ...f, modalidade: v }))}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="livre">Lance Livre</SelectItem>
                    <SelectItem value="limitado">Lance Limitado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Menor Lance Contemplado (%) *</Label>
                <Input type="number" step="0.01" min="0" max="100" value={form.menor_lance_percentual} onChange={e => setForm(f => ({ ...f, menor_lance_percentual: e.target.value }))} placeholder="Ex: 62.00" className="h-9 mt-1" />
              </div>
              <div>
                <Label className="text-xs">Data da Assembleia *</Label>
                <Input type="date" value={form.data_assembleia} onChange={e => setForm(f => ({ ...f, data_assembleia: e.target.value }))} className="h-9 mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Observação (opcional)</Label>
              <Textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Informações adicionais..." className="mt-1 h-16 resize-none" />
            </div>
            <Button onClick={handleSalvar} disabled={salvando} className="bg-[#10353C] hover:bg-[#083942] text-white gap-2">
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {salvando ? 'Salvando...' : 'Salvar Registro'}
            </Button>
          </div>

          {/* Histórico */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Histórico Cadastrado</p>
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : registros.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Nenhum registro cadastrado</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {registros.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg text-sm">
                    <div>
                      <span className="font-semibold text-slate-800">{r.administradora} — Grupo {r.grupo}</span>
                      <span className="mx-2 text-slate-300">|</span>
                      <span className="text-slate-600 capitalize">{r.tipo_bem}</span>
                      <span className="mx-2 text-slate-300">|</span>
                      <span className={`font-medium ${r.modalidade === 'livre' ? 'text-blue-600' : 'text-orange-600'}`}>
                        {r.modalidade === 'livre' ? 'Lance Livre' : 'Lance Limitado'}
                      </span>
                      <span className="mx-2 text-slate-300">|</span>
                      <span className="font-bold text-green-700">{r.menor_lance_percentual}%</span>
                      <span className="ml-2 text-xs text-slate-400">{new Date(r.data_assembleia).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => handleExcluir(r.id)} className="h-7 w-7 text-red-400 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}