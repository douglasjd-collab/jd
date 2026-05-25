import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Phone, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

export default function RealizarChamadaModal({ open, onOpenChange, numeroInicial = '', onChamadaIniciada }) {
  const [called, setCalled] = useState(numeroInicial);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [nomeContato, setNomeContato] = useState('');

  useEffect(() => {
    if (numeroInicial) setCalled(numeroInicial);
  }, [numeroInicial]);

  useEffect(() => {
    if (open) carregarConfig();
  }, [open]);

  const carregarConfig = async () => {
    setLoadingConfig(true);
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', { action: 'buscarConfigUsuario' });
      setConfig(res.data?.config || null);
    } catch {
      setConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleLigar = async () => {
    const numero = called.replace(/\D/g, '');
    if (!numero || numero.length < 8) {
      toast.error('Número inválido. Informe DDD + número.');
      return;
    }
    if (!config) {
      toast.error('Configuração NVOIP não encontrada. Acesse Call Center → Meu Ramal.');
      return;
    }

    setLoading(true);
    const res = await base44.functions.invoke('nvoipCallCenter', {
      action: 'realizarChamadaDireta',
      called: numero,
    });
    setLoading(false);

    if (res.data?.callId) {
      toast.success('Chamada iniciada! Aguarde tocar...');
      onChamadaIniciada?.(res.data.callId, called, nomeContato || 'Contato');
      onOpenChange(false);
      setCalled('');
      setNomeContato('');
    } else {
      toast.error('Erro: ' + (res.data?.error || 'Erro desconhecido'));
    }
  };

  const numeroDID = config?.numero_did?.replace(/\D/g, '') || config?.numbersip || '';
  const numeroChip = config?.numero_chip?.replace(/\D/g, '') || '';

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

          {loadingConfig && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Verificando configuração...
            </div>
          )}

          {!loadingConfig && !config && (
            <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>Configuração NVOIP não encontrada. Acesse <strong>Call Center → Meu Ramal</strong>.</p>
            </div>
          )}

          {!loadingConfig && config && (() => {
            const chipIgualDid = config.numero_chip?.replace(/\D/g,'') === config.numero_did?.replace(/\D/g,'');
            return (
            <div className="space-y-2">
              {chipIgualDid && (
                <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-xs text-red-700">
                  <p className="font-semibold">⚠️ Chip igual ao DID!</p>
                  <p className="mt-1">O número do CHIP deve ser seu <strong>celular físico</strong> (ex: 5587991426333). Acesse <strong>Call Center → Meu Ramal</strong> e corrija.</p>
                </div>
              )}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Ramal SIP:</span>
                  <span className="font-mono font-bold">{config.numbersip}</span>
                </div>
                {numeroDID && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">DID de saída:</span>
                    <span className="font-mono font-bold text-green-700">{numeroDID}</span>
                  </div>
                )}
                {numeroChip && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Chip (callback):</span>
                    <span className="font-mono font-bold">{numeroChip}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Senha SIP:</span>
                  <span className={`font-bold text-xs ${config.sip_password ? 'text-green-600' : 'text-red-500'}`}>
                    {config.sip_password ? '✅ Configurada' : '❌ NÃO configurada'}
                  </span>
                </div>
              </div>
              {!config.sip_password && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                  <p className="font-semibold">⚠️ Senha SIP obrigatória!</p>
                  <p className="mt-1">Acesse <strong>Call Center → Meu Ramal</strong> e preencha a <strong>Senha SIP</strong> (senha do ramal no painel NVOIP). Sem ela o encaminhamento não funciona.</p>
                </div>
              )}
            </div>
          )})()}

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
            <p className="font-semibold">📞 Fluxo da chamada:</p>
            <p className="mt-1">1. NVOIP liga primeiro para o seu <strong>chip ({numeroChip || 'não configurado'})</strong></p>
            <p>2. Você atende → NVOIP conecta com o cliente</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={handleLigar}
              disabled={loading || loadingConfig || !config}
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