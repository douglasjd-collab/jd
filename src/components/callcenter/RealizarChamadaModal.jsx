import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Phone, AlertTriangle, User, Building2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function RealizarChamadaModal({ open, onOpenChange, numeroInicial = '', onChamadaIniciada }) {
  const [called, setCalled] = useState(numeroInicial);
  const [loading, setLoading] = useState(false);
  const [configUsuario, setConfigUsuario] = useState(null); // ramal pessoal
  const [loadingConfig, setLoadingConfig] = useState(false);

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

  const temRamalPessoal = configUsuario && configUsuario.numbersip && configUsuario.user_token;
  const temChip = configUsuario && configUsuario.numero_chip;

  const handleLigar = async () => {
    const numero = called.replace(/\D/g, '');
    if (!numero || numero.length < 8) {
      toast.error('Número inválido. Informe DDD + número (mínimo 8 dígitos).');
      return;
    }
    // Validação local antes de chamar a API
    if (temRamalPessoal && !temChip) {
      toast.error('Número do chip não configurado.', {
        description: 'Acesse Call Center → Meu Ramal e informe o Número do Chip para encaminhamento.',
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
      const origem = res.data?._caller || configUsuario?.numbersip || 'ramal configurado';
      toast.success(`Chamada iniciada! Origem: ${origem}`);
      onChamadaIniciada?.(res.data.callId, called);
      onOpenChange(false);
      setCalled('');
    } else {
      const erro = res.data?.error || res.data?.message || 'Erro desconhecido';
      const tipo = res.data?._error_type;
      if (tipo === 'chip_nao_configurado') {
        toast.error('Número de encaminhamento (chip) não configurado.', {
          description: 'Acesse Call Center → Meu Ramal e informe o Número do Chip.',
          duration: 8000,
        });
      } else if (tipo === 'encaminhamento_falhou') {
        toast.error('Falha ao configurar encaminhamento no ramal NVOIP.', {
          description: erro,
          duration: 8000,
        });
      } else if (tipo === 'ramal_nao_configurado' || erro.includes('ramal') || erro.includes('configurad')) {
        toast.error(erro, { description: 'Acesse Call Center → Meu Ramal para configurar.', duration: 7000 });
      } else if (erro.includes('autenticaç') || erro.includes('token') || erro.includes('credenciai')) {
        toast.error('Falha de autenticação NVOIP. Verifique seu User Token.', { description: erro, duration: 7000 });
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
            Nova Chamada
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Status do ramal de origem */}
          {loadingConfig ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-1">
              <Loader2 className="w-4 h-4 animate-spin" /> Verificando ramal...
            </div>
          ) : temRamalPessoal && temChip ? (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
              <User className="w-4 h-4 flex-shrink-0" />
              <div>
                <span className="font-semibold">Ramal:</span> {configUsuario.numbersip}
                <span className="text-green-600 ml-2 text-xs">→ chip: {configUsuario.numero_chip}</span>
              </div>
              <Badge className="ml-auto bg-green-100 text-green-700 text-xs">Pronto</Badge>
            </div>
          ) : temRamalPessoal && !temChip ? (
            <div className="flex items-start gap-2 bg-red-50 border border-red-300 rounded-lg px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Número do chip não configurado</p>
                <p className="text-xs mt-0.5">Ramal <strong>{configUsuario.numbersip}</strong> sem encaminhamento. Acesse <strong>Call Center → Meu Ramal</strong> e informe o <strong>Número do Chip</strong>.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-sm text-orange-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Ramal pessoal não configurado</p>
                <p className="text-xs mt-0.5">Acesse <strong>Call Center → Meu Ramal</strong> para configurar seu ramal antes de ligar.</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Número de Destino *</Label>
            <Input
              placeholder="Ex: 87991426333 (DDD + número)"
              value={called}
              onChange={e => setCalled(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleLigar()}
              autoFocus
            />
            <p className="text-xs text-slate-400">DDD + número, sem 0 e sem +55</p>
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