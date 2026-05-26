import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Phone } from 'lucide-react';
import { toast } from 'sonner';

export default function RealizarChamadaModal({ open, onOpenChange, numeroInicial = '', onChamadaIniciada }) {
  const [called, setCalled] = useState(numeroInicial);
  const [nomeContato, setNomeContato] = useState('');

  useEffect(() => {
    if (numeroInicial) setCalled(numeroInicial);
  }, [numeroInicial]);

  const handleLigar = () => {
    const numero = called.replace(/\D/g, '');
    if (!numero || numero.length < 8) {
      toast.error('Número inválido. Informe DDD + número.');
      return;
    }

    // Disca direto pelo MicroSIP via protocolo microsip:
    const a = document.createElement('a');
    a.href = `microsip:${numero}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    toast.success('Discando para ' + numero + ' via MicroSIP...');
    onChamadaIniciada?.(null, numero, nomeContato || 'Contato');
    onOpenChange(false);
    setCalled('');
    setNomeContato('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-green-600" />
            Nova Chamada
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nome do Contato (opcional)</Label>
            <Input
              placeholder="Ex: João Silva"
              value={nomeContato}
              onChange={e => setNomeContato(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLigar()}
            />
          </div>

          <div className="space-y-2">
            <Label>Número do Cliente *</Label>
            <Input
              placeholder="Ex: 87991426333 (DDD + número)"
              value={called}
              onChange={e => setCalled(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleLigar()}
              autoFocus
            />
            <p className="text-xs text-slate-400">DDD + número, sem 0 e sem +55</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
            <p className="font-semibold">📞 Como funciona:</p>
            <p className="mt-1">O MicroSIP discará diretamente para o número informado.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={handleLigar}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Phone className="w-4 h-4 mr-2" />
              Ligar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}