import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Phone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

export default function RealizarChamadaModal({ open, onOpenChange, numeroInicial = '', onChamadaIniciada, webphoneAtivo = false }) {
  const [called, setCalled] = useState(numeroInicial);
  const [nomeContato, setNomeContato] = useState('');
  const [ligando, setLigando] = useState(false);

  useEffect(() => {
    if (numeroInicial) setCalled(numeroInicial);
  }, [numeroInicial]);

  const handleLigar = async () => {
    const numero = called.replace(/\D/g, '');
    if (!numero || numero.length < 8) {
      toast.error('Número inválido. Informe DDD + número.');
      return;
    }

    setLigando(true);
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', {
        action: 'realizarChamada',
        called: numero,
        webphoneAtivo,
      });
      
      console.log('[Modal] Resposta nvoipCallCenter:', res);
      
      if (res.status && res.status >= 400) {
        toast.error('Erro ' + res.status + ': Falha ao iniciar chamada');
        return;
      }
      
      if (res.data?.error) {
        const isRateLimit = res.data._error_type === 'rate_limit' || res.data._fallback === 'microsip';
        toast.error(res.data.error);
        
        // Se for limite diário, sugere MicroSIP
        if (isRateLimit) {
          const usarMicroSIP = window.confirm('NVOIP atingiu o limite diário. Deseja abrir o MicroSIP para ligar?');
          if (usarMicroSIP) {
            window.location.href = `microsip:${numero}`;
            onOpenChange(false);
          }
        }
        return;
      }
      
      const callId = res.data?.callId || res.data?.call_id || res.data?.id || null;
      if (!callId) {
        toast.warning('Chamada iniciada, mas ID não foi retornado');
      } else {
        toast.success('Chamada iniciada para ' + numero);
      }
      onChamadaIniciada?.(callId, numero, nomeContato || 'Contato');
      onOpenChange(false);
      setCalled('');
      setNomeContato('');
    } catch (e) {
      console.error('[Modal] Erro na chamada:', e);
      toast.error('Erro ao iniciar chamada: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setLigando(false);
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
            <p className="mt-1">1️⃣ A NVOIP liga para seu <strong>chip/celular</strong> primeiro</p>
            <p className="mt-1">2️⃣ Quando você atende, ela liga para o <strong>cliente</strong></p>
            <p className="mt-1">3️⃣ As duas chamadas são conectadas</p>
            <p className="mt-2 text-red-700"><strong>⚠️ Atenda seu celular rapidamente!</strong> A ligação se encerra se você não atender em ~30 segundos.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={handleLigar}
              disabled={ligando}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {ligando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Phone className="w-4 h-4 mr-2" />}
              Ligar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}