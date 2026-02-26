import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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

const FUNCAO_LABEL = {
  em_digitacao: 'Em Digitação', em_analise: 'Em Análise', aprovado: 'Aprovado',
  reprovado: 'Reprovado', finalizado: 'Finalizado', cancelado: 'Cancelado', pendente: 'Pendente',
};

export default function ModalSubstatus({ open, onClose, onSave, statusPai, substatusEditando, loading }) {
  const [form, setForm] = useState({ nome: '', cor: '' });

  useEffect(() => {
    if (substatusEditando) {
      setForm({ nome: substatusEditando.nome, cor: substatusEditando.cor || '' });
    } else {
      setForm({ nome: '', cor: '' });
    }
  }, [substatusEditando, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const paiLabel = statusPai ? FUNCAO_LABEL[statusPai.funcao_fluxo] : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {substatusEditando ? 'Editar Substatus' : `Adicionar Substatus em "${statusPai?.nome}"`}
          </DialogTitle>
        </DialogHeader>
        {statusPai && (
          <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-lg text-sm">
            <span className="text-slate-500">Status pai:</span>
            <Badge className="bg-slate-200 text-slate-700">{statusPai.nome}</Badge>
            {paiLabel && <Badge variant="outline" className="text-xs">{paiLabel} (herdado)</Badge>}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nome do Substatus *</Label>
            <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Pago, Baixado, Pendente Doc." required />
          </div>
          <div>
            <Label>Cor (opcional — herda do principal se não definida)</Label>
            <div className="grid grid-cols-5 gap-2 mt-2">
              <button type="button" onClick={() => setForm({ ...form, cor: '' })}
                className={`p-2 rounded-lg border-2 transition-all ${!form.cor ? 'border-slate-900' : 'border-slate-200'} bg-slate-100`}>
                <div className="text-xs font-medium text-slate-600">Herdar</div>
              </button>
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