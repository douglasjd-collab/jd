import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Phone, AlertTriangle, User, Smartphone } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function RealizarChamadaModal({ open, onOpenChange, numeroInicial = '', onChamadaIniciada }) {
  const [called, setCalled] = useState(numeroInicial);
  const [loading, setLoading] = useState(false);
  const [configUsuario, setConfigUsuario] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [testandoChip, setTestandoChip] = useState(false);

  useEffect(() => {
    if (numeroInicial) setCalled(numeroInicial);
  }, [numeroInicial]);

  useEffect(() => {
    if (open) carregarConfigUsuario();
  }, [open]);

  const carregarConfigUsuario = async () => {
    setLoadingConfig(true);
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', { action: 'buscarConfigUsuario' });
      setConfigUsuario(res.data?.config || null);
    } catch {
      setConfigUsuario(null);
    } finally {
      setLoadingConfig(false);
    }
  };

  const temRamalPessoal = configUsuario && configUsuario.numbersip;
  const numeroDID = (configUsuario?.numero_did || '').replace(/\D/g, '');
  const celularFisico = (configUsuario?.numero_chip || '').replace(/\D/g, '');
  const temConfiguracao = !!temRamalPessoal;
  const chipIgualDid = false; // número virtual é válido como chip

  const handleTestarChip = async () => {
    const chip = configUsuario?.numero_chip?.replace(/\D/g, '');
    if (!chip) {
      toast.error('Nenhum número de chip configurado. Acesse Meu Ramal primeiro.');
      return;
    }
    setTestandoChip(true);
    // Faz uma chamada de teste: caller = ramal, called = próprio chip (para confirmar que ele toca)
    const res = await base44.functions.invoke('nvoipCallCenter', {
      action: 'realizarChamada',
      called: chip,
      _testeChip: true,
    });
    setTestandoChip(false);
    if (res.data?.callId) {
      toast.success(`Chamada de teste enviada para ${chip}! Veja se o celular tocou.`, { duration: 8000 });
    } else {
      const erro = res.data?.error || 'Erro desconhecido';
      toast.error(`Falha no teste do chip: ${erro}`, { description: 'Verifique o número e as configurações no painel NVOIP.', duration: 8000 });
    }
  };

  const handleLigar = async () => {
    const numero = called.replace(/\D/g, '');
    if (!numero || numero.length < 8) {
      toast.error('Número inválido. Informe DDD + número (mínimo 8 dígitos).');
      return;
    }
    if (!temConfiguracao) {
      toast.error('Ramal não configurado.', {
        description: 'Acesse Call Center → Meu Ramal ou Config Empresa para configurar.',
        duration: 8000,
      });
      return;
    }

    setLoading(true);
    const res = await base44.functions.invoke('nvoipCallCenter', {
      action: 'realizarChamada',
      called: numero,
    });
    setLoading(false);

    if (res.data?.callId) {
      const clienteFormatado = numero.startsWith('55') ? numero : '55' + numero;
      toast.success('Chamada iniciada!', {
        description: `Ligando para ${clienteFormatado}...`,
        duration: 8000,
      });
      onChamadaIniciada?.(res.data.callId, called, celularFisico || numeroDID || '', numeroDID);
      onOpenChange(false);
      setCalled('');
    } else {
      const erro = res.data?.error || res.data?.message || 'Erro desconhecido';
      const tipo = res.data?._error_type;
      const isCredencialInvalida = erro.toLowerCase().includes('invalid user') || erro.toLowerCase().includes('forbidden') || erro.toLowerCase().includes('invalid_token');
      if (isCredencialInvalida) {
        toast.error('Credenciais NVOIP inválidas', {
          description: 'A Napikey ou User Token configurados estão incorretos. Acesse Call Center → Config Empresa (ou Meu Ramal) e reconfigure com os dados corretos do painel NVOIP → API.',
          duration: 12000,
        });
      } else if (tipo === 'chip_nao_configurado') {
        toast.error('Número de encaminhamento (chip) não configurado.', {
          description: 'Acesse Call Center → Meu Ramal e informe o Número do Chip.',
          duration: 8000,
        });
      } else if (tipo === 'ramal_nao_configurado' || erro.includes('ramal') || erro.includes('configurad')) {
        toast.error(erro, { description: 'Acesse Call Center → Meu Ramal para configurar.', duration: 7000 });
      } else if (erro.includes('autenticaç') || erro.includes('token') || erro.includes('credenciai')) {
        toast.error('Falha de autenticação NVOIP.', { description: 'Reconfigure suas credenciais em Config Empresa ou Meu Ramal.', duration: 7000 });
      } else if (tipo === 'numero_invalido' || erro.includes('inválido') || erro.includes('número')) {
        toast.error('Número de destino inválido: ' + erro);
      } else {
        toast.error('Erro ao realizar chamada: ' + erro);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-green-600" />
            Nova Chamada — NVOIP
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Status de configuração */}
          {loadingConfig ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-1">
              <Loader2 className="w-4 h-4 animate-spin" /> Verificando configuração...
            </div>
          ) : temConfiguracao ? (
            <div className="space-y-1.5">
              {/* Número de origem */}
              {temRamalPessoal && (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800">
                  <User className="w-4 h-4 flex-shrink-0 text-slate-600" />
                  <div className="flex-1">
                    <p className="font-semibold text-xs text-slate-500 uppercase tracking-wide mb-0.5">Ramal SIP (origem)</p>
                    <p className="font-mono font-bold">{configUsuario.numbersip}</p>
                  </div>
                  <Badge className="bg-slate-200 text-slate-700 text-xs border-0">caller</Badge>
                </div>
              )}
              {numeroDID && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-800">
                  <Phone className="w-4 h-4 flex-shrink-0 text-green-600" />
                  <div className="flex-1">
                    <p className="font-semibold text-xs text-green-600 uppercase tracking-wide mb-0.5">DID virtual (número de saída)</p>
                    <p className="font-mono font-bold">{numeroDID}</p>
                  </div>
                  <Badge className="bg-green-200 text-green-700 text-xs border-0">CallerId</Badge>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-sm text-orange-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Configuração incompleta</p>
                <p className="text-xs mt-0.5">Acesse <strong>Call Center → Meu Ramal</strong> para configurar seu ramal NVOIP antes de ligar.</p>
              </div>
            </div>
          )}


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

          {/* Resumo visual do payload */}
          {called.replace(/\D/g, '').length >= 8 && temConfiguracao && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs space-y-1">
              <p className="font-semibold text-slate-600 uppercase tracking-wide mb-1">Resumo da chamada</p>
              {temRamalPessoal && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Ramal:</span>
                  <span className="font-mono font-bold text-slate-800">{configUsuario?.numbersip}</span>
                </div>
              )}
              {numeroDID && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">DID de saída:</span>
                  <span className="font-mono font-bold text-green-700">{numeroDID}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                <span className="text-slate-500">Ligando para:</span>
                <span className="font-mono font-bold text-green-700">
                  {(() => { const n = called.replace(/\D/g,''); return n.startsWith('55') ? n : '55' + n; })()}
                </span>
              </div>
            </div>
          )}



          {/* Instruções sobre o fluxo */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-900 space-y-1">
            <p className="font-semibold">📞 Como funciona:</p>
            <p>A NVOIP disca diretamente para o cliente usando seu ramal SIP.</p>
            {numeroDID && <p className="text-blue-700 mt-1">O número <span className="font-mono font-bold">{numeroDID}</span> aparece como origem para o cliente.</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={handleLigar}
              disabled={loading || loadingConfig}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <Phone className="w-4 h-4 mr-2" />
              }
              Ligar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}