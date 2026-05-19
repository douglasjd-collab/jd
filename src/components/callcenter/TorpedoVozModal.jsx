import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Volume2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function TorpedoVozModal({ open, onOpenChange, numbersip, telefoneInicial }) {
  const [caller, setCaller] = useState(numbersip || '');
  const [called, setCalled] = useState(telefoneInicial || '');
  const [mensagem, setMensagem] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEnviar = async () => {
    if (!called || !mensagem) {
      toast.error('Preencha o número de destino e a mensagem');
      return;
    }
    setLoading(true);
    const res = await base44.functions.invoke('nvoipCallCenter', {
      action: 'torpedoVoz',
      caller,
      called,
      mensagem,
    });
    setLoading(false);
    if (res.data?.state === 'success' || res.data?.callId) {
      toast.success('Torpedo de voz enviado!');
      setMensagem('');
      setCalled(telefoneInicial || '');
      onOpenChange(false);
    } else {
      toast.error('Erro ao enviar torpedo: ' + (res.data?.error || JSON.stringify(res.data)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-purple-600" />
            Torpedo de Voz
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Ramal de Origem (Caller)</Label>
            <Input
              placeholder="Ex: 1049"
              value={caller}
              onChange={e => setCaller(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Número de Destino *</Label>
            <Input
              placeholder="Ex: 11990000000"
              value={called}
              onChange={e => setCalled(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Mensagem de Voz *</Label>
            <Textarea
              placeholder="Digite o texto que será lido para o destinatário..."
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-slate-400">O texto será convertido em áudio e reproduzido na chamada</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleEnviar} disabled={loading} className="bg-purple-600 hover:bg-purple-700 text-white">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Volume2 className="w-4 h-4 mr-2" />}
              Enviar Torpedo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}