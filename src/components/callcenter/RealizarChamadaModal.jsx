import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Phone } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function RealizarChamadaModal({ open, onOpenChange, numbersip, numeroInicial = '', onChamadaIniciada }) {
  const [called, setCalled] = useState(numeroInicial);
  const [loading, setLoading] = useState(false);

  // Atualiza 'called' quando numeroInicial muda (vem do softphone)
  useEffect(() => {
    if (numeroInicial) setCalled(numeroInicial);
  }, [numeroInicial]);

  const handleLigar = async () => {
    if (!called) {
      toast.error('Informe o número de destino');
      return;
    }
    setLoading(true);
    const res = await base44.functions.invoke('nvoipCallCenter', {
      action: 'realizarChamada',
      caller: numbersip,
      called,
    });
    setLoading(false);
    if (res.data?.state === 'success') {
      toast.success('Chamada iniciada!');
      onChamadaIniciada?.(res.data.callId, called);
      onOpenChange(false);
      setCalled('');
    } else {
      toast.error('Erro ao realizar chamada: ' + (res.data?.error || 'Erro desconhecido'));
    }
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
          {numbersip && (
            <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600">
              <span className="font-medium">Ramal de origem:</span> {numbersip}
            </div>
          )}
          <div className="space-y-2">
            <Label>Número de Destino *</Label>
            <Input
              placeholder="Ex: 11990000000"
              value={called}
              onChange={e => setCalled(e.target.value)}
            />
            <p className="text-xs text-slate-400">Formato: DDD + número (sem 0)</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleLigar} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Phone className="w-4 h-4 mr-2" />}
              Ligar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}