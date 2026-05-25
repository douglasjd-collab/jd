import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const resultadoOptions = [
  { value: 'atendida', label: 'Atendida' },
  { value: 'recusada', label: 'Recusada' },
  { value: 'caixa_postal', label: 'Caixa Postal' },
  { value: 'ocupado', label: 'Ocupado' },
  { value: 'nao_atende', label: 'Não Atende' },
  { value: 'numero_invalido', label: 'Número Inválido' },
  { value: 'falha_conexao', label: 'Falha na Conexão' },
];

export default function CallEndModal({ open, onOpenChange, contato, numero, duracao, onConfirm, loading }) {
  const [resultado, setResultado] = useState('');

  const handleConfirm = () => {
    if (!resultado) {
      alert('Por favor, selecione um resultado para a ligação');
      return;
    }
    onConfirm(resultado);
  };

  const formatDuracao = (segundos) => {
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return `${m}m ${s}s`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Resumo da Ligação</DialogTitle>
          <p className="text-sm text-slate-500 mt-1">Preencha o resumo obrigatório da ligação antes de continuar.</p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Informações da ligação */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-600">Lead:</span>
              <span className="font-semibold text-slate-900">{contato}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Número:</span>
              <span className="font-mono text-slate-900">{numero}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Duração:</span>
              <span className="font-mono text-slate-900">{formatDuracao(duracao)}</span>
            </div>
          </div>

          {/* Resultado da ligação */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Resultado da Ligação</label>
            <Select value={resultado} onValueChange={setResultado}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o resultado..." />
              </SelectTrigger>
              <SelectContent>
                {resultadoOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Botão confirmar */}
          <Button
            onClick={handleConfirm}
            disabled={loading || !resultado}
            className="w-full bg-green-500 hover:bg-green-600 text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Confirmar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}