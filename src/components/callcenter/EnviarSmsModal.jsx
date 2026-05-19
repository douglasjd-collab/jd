import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessageSquare } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function EnviarSmsModal({ open, onOpenChange, telefoneInicial }) {
  const [numero, setNumero] = useState(telefoneInicial || '');
  const [mensagem, setMensagem] = useState('');
  const [loading, setLoading] = useState(false);

  // Remove acentos para SMS
  const removerAcentos = (str) =>
    str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const handleEnviar = async () => {
    if (!numero || !mensagem) {
      toast.error('Preencha o número e a mensagem');
      return;
    }
    if (mensagem.length > 160) {
      toast.error('SMS não pode ter mais de 160 caracteres');
      return;
    }
    setLoading(true);
    const res = await base44.functions.invoke('nvoipCallCenter', {
      action: 'enviarSMS',
      numberPhone: numero,
      message: removerAcentos(mensagem),
      flashSms: false,
    });
    setLoading(false);
    if (res.data?.status?.includes('200') || res.data?.mensagem?.includes('enviado')) {
      toast.success('SMS enviado com sucesso!');
      setMensagem('');
      onOpenChange(false);
    } else {
      toast.error('Erro ao enviar SMS: ' + (res.data?.error || JSON.stringify(res.data)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            Enviar SMS
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Número *</Label>
            <Input
              placeholder="Ex: 11999990000"
              value={numero}
              onChange={e => setNumero(e.target.value)}
            />
            <p className="text-xs text-slate-400">Formato: DDD + número (sem espaços)</p>
          </div>
          <div className="space-y-2">
            <Label>Mensagem * <span className="text-slate-400 text-xs">({mensagem.length}/160)</span></Label>
            <Textarea
              placeholder="Texto sem acentuação (max 160 caracteres)"
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
              maxLength={160}
              rows={4}
            />
            <p className="text-xs text-amber-500">⚠ SMS não suporta acentos — serão removidos automaticamente</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleEnviar} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MessageSquare className="w-4 h-4 mr-2" />}
              Enviar SMS
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}