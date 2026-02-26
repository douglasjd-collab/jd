import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const CORES = [
  { value: 'blue', label: 'Azul', bg: 'bg-blue-100', text: 'text-blue-800' },
  { value: 'green', label: 'Verde', bg: 'bg-green-100', text: 'text-green-800' },
  { value: 'red', label: 'Vermelho', bg: 'bg-red-100', text: 'text-red-800' },
  { value: 'yellow', label: 'Amarelo', bg: 'bg-yellow-100', text: 'text-yellow-800' },
  { value: 'purple', label: 'Roxo', bg: 'bg-purple-100', text: 'text-purple-800' },
  { value: 'orange', label: 'Laranja', bg: 'bg-orange-100', text: 'text-orange-800' },
  { value: 'teal', label: 'Verde Água', bg: 'bg-teal-100', text: 'text-teal-800' },
  { value: 'indigo', label: 'Índigo', bg: 'bg-indigo-100', text: 'text-indigo-800' },
  { value: 'emerald', label: 'Esmeralda', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  { value: 'slate', label: 'Cinza', bg: 'bg-slate-100', text: 'text-slate-800' },
];

const FUNCOES = [
  { value: 'em_digitacao', label: 'Em Digitação' },
  { value: 'em_analise', label: 'Em Análise' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'reprovado', label: 'Reprovado' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'pendente', label: 'Pendente' },
];

export default function ModalStatusPrincipal({ open, onClose, onSave, statusEditando, loading }) {
  const [form, setForm] = useState({ nome: '', cor: 'blue', funcao_fluxo: 'em_analise' });

  useEffect(() => {
    if (statusEditando) {
      setForm({ nome: statusEditando.nome, cor: statusEditando.cor || 'blue', funcao_fluxo: statusEditando.funcao_fluxo || 'em_analise' });
    } else {
      setForm({ nome: '', cor: 'blue', funcao_fluxo: 'em_analise' });
    }
  }, [statusEditando, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{statusEditando ? 'Editar Status Principal' : 'Novo Status Principal'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Operação Finalizada" required />
          </div>
          <div>
            <Label>Função do Fluxo *</Label>
            <Select value={form.funcao_fluxo} onValueChange={v => setForm({ ...form, funcao_fluxo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FUNCOES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 mt-1">Define como o sistema classifica propostas com este status nos relatórios e funil.</p>
          </div>
          <div>
            <Label>Cor</Label>
            <div className="grid grid-cols-5 gap-2 mt-2">
              {CORES.map(cor => (
                <button key={cor.value} type="button" onClick={() => setForm({ ...form, cor: cor.value })}
                  className={`p-2 rounded-lg border-2 transition-all ${form.cor === cor.value ? 'border-slate-900 scale-105' : 'border-slate-200'} ${cor.bg}`}>
                  <div className={`text-xs font-medium ${cor.text}`}>{cor.label}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading} className="bg-[#23BE84] hover:bg-[#1da570]">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}