import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Phone, Radio } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Modal de chamada — EXCLUSIVAMENTE WebRTC via wss://app.nvoip.com.br:7443
 * Sem callback, sem API REST, sem chip, sem MicroSIP.
 */
export default function RealizarChamadaModal({
  open,
  onOpenChange,
  numeroInicial = '',
  softphone,        // hook useSoftphone — obrigatório para WebRTC
  onChamadaIniciada,
}) {
  const [numero, setNumero] = useState(numeroInicial);
  const [nomeContato, setNomeContato] = useState('');

  useEffect(() => { if (numeroInicial) setNumero(numeroInicial); }, [numeroInicial]);
  useEffect(() => { if (!open) { setNumero(''); setNomeContato(''); } }, [open]);

  const sipRegistrado = softphone?.sipStatus === 'registrado';

  const handleLigar = async () => {
    const num = numero.replace(/\D/g, '');
    if (!num || num.length < 8) { toast.error('Número inválido. Informe DDD + número.'); return; }
    if (!sipRegistrado) { toast.error('Webphone não registrado. Aguarde o status "Pronto".'); return; }

    console.log(`📞 [Modal] Iniciando chamada WebRTC → ${num} via wss://app.nvoip.com.br:7443`);
    const ok = await softphone.realizarChamada(num);
    if (ok !== false) {
      onChamadaIniciada?.(null, num, nomeContato || 'Contato');
      onOpenChange(false);
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
            <Label>Número *</Label>
            <Input
              placeholder="DDD + número (ex: 87991426333)"
              value={numero}
              onChange={e => setNumero(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleLigar()}
              autoFocus
            />
            <p className="text-xs text-slate-400">DDD + número, sem DDI</p>
          </div>

          {/* Status do Webphone */}
          <div className={`rounded-lg p-3 text-xs flex items-center gap-2 border ${
            sipRegistrado
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <Radio className="w-4 h-4 shrink-0" />
            <span>
              {sipRegistrado
                ? '✓ Webphone pronto — chamada sairá direto pelo navegador (WSS/WebRTC)'
                : `⚠ Webphone ${softphone?.sipStatus || 'desconectado'} — aguarde o registro SIP`}
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={handleLigar}
              disabled={!numero.trim() || !sipRegistrado}
              className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-40"
            >
              <Phone className="w-4 h-4 mr-2" />
              Ligar via WebRTC
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}