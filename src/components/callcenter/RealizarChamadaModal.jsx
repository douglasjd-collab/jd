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

  const temRamalPessoal = configUsuario && configUsuario.numbersip && configUsuario.user_token;
  const temChip = configUsuario && configUsuario.numero_chip;
  const numeroEmpresa = configUsuario?.numero_did || configUsuario?.numbersip || '';
  const celularFisico = configUsuario?.numero_chip || '';
  
  // Validação: celular físico não pode ser igual ao número da empresa/DID
  const celularFisicoInvalido = celularFisico && numeroEmpresa && celularFisico.replace(/\D/g,'') === numeroEmpresa.replace(/\D/g,'');

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
    // Validação local antes de chamar a API
    if (temRamalPessoal && !temChip) {
      toast.error('Celular físico não configurado.', {
        description: 'Acesse Call Center → Meu Ramal e informe um CELULAR FÍSICO (ex: 87991426333). Este número irá tocar primeiro.',
        duration: 8000,
      });
      return;
    }
    if (celularFisicoInvalido) {
      toast.error('Celular físico inválido.', {
        description: `O número ${celularFisico} é igual ao DID da empresa. Informe um celular físico diferente em Meu Ramal.`,
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
      const chip = res.data?._chip || configUsuario?.numero_chip || 'seu celular';
      const clienteFormatado = numero.startsWith('55') ? numero : '55' + numero;
      toast.success('Chamada iniciada!', {
        description: `1️⃣ NVOIP ligará para ${chip}. 2️⃣ Atenda! 3️⃣ NVOIP discará para ${clienteFormatado}.`,
        duration: 8000,
      });
      onChamadaIniciada?.(res.data.callId, called, res.data._chip || configUsuario?.numero_chip);
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
            Nova Chamada — Callback NVOIP
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Status do ramal de origem */}
          {loadingConfig ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-1">
              <Loader2 className="w-4 h-4 animate-spin" /> Verificando ramal...
            </div>
          ) : temRamalPessoal && temChip ? (
            <div className="space-y-1.5">
              {/* Número da empresa/origem (Ramal SIP) */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800">
                <User className="w-4 h-4 flex-shrink-0 text-slate-600" />
                <div className="flex-1">
                  <p className="font-semibold text-xs text-slate-500 uppercase tracking-wide mb-0.5">Ramal SIP (caller)</p>
                  <p className="font-mono font-bold">{configUsuario.numbersip}</p>
                  {numeroEmpresa && numeroEmpresa !== configUsuario.numbersip && (
                    <p className="text-xs text-slate-500 mt-0.5">DID virtual NVOIP: {numeroEmpresa}</p>
                  )}
                </div>
                <Badge className="bg-slate-200 text-slate-700 text-xs border-0">origem</Badge>
              </div>
              
              {/* Celular físico (1ª perna do callback) */}
              <div className={`${celularFisicoInvalido ? "bg-red-50 border-red-300" : "bg-blue-50 border-blue-200"} border rounded-lg px-3 py-2 text-sm`}>
                <div className="flex items-start gap-2">
                  <Smartphone className={`w-4 h-4 flex-shrink-0 mt-0.5 ${celularFisicoInvalido ? "text-red-600" : "text-blue-600"}`} />
                  <div className="flex-1">
                    <p className={`font-semibold text-xs uppercase tracking-wide mb-0.5 ${celularFisicoInvalido ? "text-red-600" : "text-blue-600"}`}>
                      Celular físico para callback (1ª perna)
                    </p>
                    <p className="font-mono font-bold">{celularFisico}</p>
                    {celularFisicoInvalido && (
                      <p className="text-xs text-red-600 mt-1 font-semibold">
                        ⚠️ Este número não pode ser igual ao DID. Use seu celular físico real.
                      </p>
                    )}
                  </div>
                  <Badge className={`${celularFisicoInvalido ? "bg-red-200 text-red-700" : "bg-blue-200 text-blue-700"} text-xs border-0`}>
                    callForward
                  </Badge>
                </div>
              </div>
            </div>
          ) : temRamalPessoal && !temChip ? (
            <div className="flex items-start gap-2 bg-red-50 border border-red-300 rounded-lg px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">📱 Celular físico não configurado</p>
                <p className="text-xs mt-0.5">
                  O <strong>callForward</strong> é o celular que atende a 1ª perna da chamada callback. 
                  Acesse <strong>Call Center → Meu Ramal</strong> e informe um <strong>Número do CHIP/Celular</strong> (ex: 87991426333).
                </p>
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

          {/* Resumo visual do payload que será enviado */}
          {called.replace(/\D/g, '').length >= 8 && temRamalPessoal && temChip && (
            <div className={`${celularFisicoInvalido ? "bg-red-50 border-red-300" : "bg-slate-50 border-slate-200"} border rounded-lg px-3 py-2 text-xs space-y-1`}>
              <p className="font-semibold text-slate-600 uppercase tracking-wide mb-1">Fluxo de callback</p>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">1. Ramal de origem:</span>
                <span className="font-mono font-bold text-slate-800">{configUsuario?.numbersip}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">2. NVOIP liga primeiro para:</span>
                <span className={`font-mono font-bold ${celularFisicoInvalido ? "text-red-700" : "text-blue-700"}`}>{celularFisico}</span>
              </div>
              {celularFisicoInvalido && (
                <p className="text-xs text-red-600 font-semibold mt-1">
                  ⚠️ Este celular não pode ser igual ao DID. Configure um celular físico diferente.
                </p>
              )}
              <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                <span className="text-slate-500">3. Depois disca para:</span>
                <span className="font-mono font-bold text-green-700">
                  {(() => { const n = called.replace(/\D/g,''); return n.startsWith('55') ? n : '55' + n; })()}
                </span>
              </div>
            </div>
          )}

          {/* Alerta quando celular físico estiver vazio ou inválido */}
          {temRamalPessoal && !temChip && (
            <div className="bg-red-50 border border-red-300 rounded-lg px-3 py-2 text-xs text-red-800">
              <p className="font-semibold mb-1">❌ Celular físico obrigatório</p>
              <p>Informe um número de celular físico (ex: 87991426333) em <strong>Meu Ramal</strong>. Este número irá tocar primeiro quando você clicar em "Ligar".</p>
            </div>
          )}
          {temRamalPessoal && temChip && celularFisicoInvalido && (
            <div className="bg-red-50 border border-red-300 rounded-lg px-3 py-2 text-xs text-red-800">
              <p className="font-semibold mb-1">❌ Celular físico inválido</p>
              <p>O número {celularFisico} é igual ao DID da empresa. Informe um celular físico diferente em <strong>Meu Ramal</strong>.</p>
            </div>
          )}

          {/* Instruções sobre o fluxo callback */}
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-900 space-y-2">
            <p className="font-semibold">✓ Callback NVOIP (2 pernas):</p>
            <p><strong>1ª perna:</strong> NVOIP liga para seu <strong>celular físico</strong> {celularFisico ? <span className="font-mono">({celularFisico})</span> : <span className="text-red-600 font-bold">(não configurado!)</span>}</p>
            <p><strong>2ª perna:</strong> Você atende → NVOIP disca para o <strong>cliente</strong></p>
            <p className="text-xs text-green-700 mt-1">O DID virtual {numeroEmpresa ? <span className="font-mono">({numeroEmpresa})</span> : '(não configurado)'} aparece como número de origem.</p>
            {temChip && !celularFisicoInvalido && (
              <button
                type="button"
                onClick={handleTestarChip}
                disabled={testandoChip}
                className="flex items-center gap-1.5 mt-2 text-green-700 border border-green-400 rounded px-2 py-1 hover:bg-green-100 disabled:opacity-50 font-medium text-xs"
              >
                {testandoChip
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Smartphone className="w-3 h-3" />
                }
                Testar celular ({celularFisico})
              </button>
            )}
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