import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Phone, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function RealizarChamadaModal({ open, onOpenChange, numbersip, numeroDid, numeroInicial = '', onChamadaIniciada }) {
  const [called, setCalled] = useState(numeroInicial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (numeroInicial) setCalled(numeroInicial);
  }, [numeroInicial]);

  const handleLigar = async () => {
    const numero = called.replace(/\D/g, '');
    if (!numero || numero.length < 8) {
      toast.error('Informe um número de destino válido');
      return;
    }
    if (!numeroDid) {
      toast.error('Configure o Número DID nas configurações do Call Center antes de ligar.');
      return;
    }
    setLoading(true);
    const res = await base44.functions.invoke('nvoipCallCenter', {
      action: 'realizarChamada',
      called: numero,
    });
    setLoading(false);
    if (res.data?.callId) {
      toast.success('Chamada iniciada! Aguarde o telefone tocar.');
      onChamadaIniciada?.(res.data.callId, called);
      onOpenChange(false);
      setCalled('');
    } else {
      toast.error('Erro ao realizar chamada: ' + (res.data?.error || res.data?.message || 'Erro desconhecido'));
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
          {!numeroDid && (
            <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
              <div>
                <strong>Número DID não configurado.</strong>
                <p className="mt-0.5">Acesse <strong>Configurar</strong> e informe o Número DID (ex: 558132998470) para habilitar chamadas.</p>
              </div>
            </div>
          )}

          {numeroDid && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
              <span className="font-medium">Número de saída:</span> {numeroDid}
            </div>
          )}

          <div className="space-y-2">
            <Label>Número de Destino *</Label>
            <Input
              placeholder="Ex: 87991426333"
              value={called}
              onChange={e => setCalled(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleLigar()}
              autoFocus
            />
            <p className="text-xs text-slate-400">DDD + número (sem 0 e sem +55)</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={handleLigar}
              disabled={loading || !numeroDid}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Phone className="w-4 h-4 mr-2" />}
              Ligar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}