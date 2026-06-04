import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, User, Phone } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ConfiguracaoRamalUsuarioModal({ open, onOpenChange, onSalvo }) {
  const [form, setForm] = useState({
    numbersip: '',
    numero_did: '',
    numero_chip: '',
    user_token: '',
    napikey: '',
    sip_password: '',
  });
  const [loading, setLoading] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [testeOk, setTesteOk] = useState(null);
  const [configAtual, setConfigAtual] = useState(null);
  
  // Validação: chip não pode ser igual ao DID
  const chipIgualDid = form.numero_chip && form.numero_did && 
    form.numero_chip.replace(/\D/g,'') === form.numero_did.replace(/\D/g,'');

  useEffect(() => {
    if (open) carregarConfigUsuario();
  }, [open]);

  const carregarConfigUsuario = async () => {
    setCarregando(true);
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', { action: 'buscarConfigUsuario' });
      const cfg = res.data?.config;
      setConfigAtual(cfg);
      if (cfg) {
        setForm({
          numbersip: cfg.numbersip || '',
          numero_did: cfg.numero_did || '',
          numero_chip: cfg.numero_chip || '',
          user_token: cfg.user_token || '',
          napikey: cfg.napikey || '',
          sip_password: cfg.sip_password || '',
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCarregando(false);
    }
  };

  const handleTestar = async () => {
    if (!form.napikey && (!form.numbersip || !form.user_token)) {
      toast.error('Preencha a Napikey ou o Ramal SIP + User Token');
      return;
    }
    setTestando(true);
    setTesteOk(null);
    const res = await base44.functions.invoke('nvoipCallCenter', {
      action: 'testarConexao',
      numbersip: form.numbersip,
      user_token: form.user_token,
      napikey: form.napikey,
    });
    setTestando(false);
    if (res.data?.success) {
      setTesteOk(true);
      toast.success('Ramal autenticado com sucesso!');
    } else {
      setTesteOk(false);
      toast.error(res.data?.error || 'Credenciais inválidas. Verifique Ramal SIP e User Token.');
    }
  };

  const handleSalvar = async () => {
    if (!form.numbersip) {
      toast.error('Ramal SIP é obrigatório');
      return;
    }
    // Bloquear se o numbersip parece um celular brasileiro (10-11 dígitos com DDD)
    const sipLimpo = form.numbersip.replace(/\D/g, '');
    if (sipLimpo.length >= 10 && sipLimpo.length <= 11 && /^[1-9]{2}[6-9]/.test(sipLimpo)) {
      toast.error('❌ O Ramal SIP parece ser um número de celular. O Ramal SIP deve ser o número interno do NVOIP (ex: 137715001), não o telefone do cliente ou seu celular pessoal.');
      return;
    }
    if (sipLimpo.length >= 10 && sipLimpo.length <= 11 && /^[1-9]{2}[2-5]/.test(sipLimpo)) {
      toast.error('❌ O Ramal SIP parece ser um número de telefone fixo. O Ramal SIP deve ser o número interno do NVOIP (ex: 137715001), não um número de linha externa.');
      return;
    }
    if (!form.napikey && !form.user_token) {
      toast.error('Informe a Napikey ou o User Token');
      return;
    }
    if (!form.sip_password) {
      toast.error('Senha SIP é obrigatória para o Webphone funcionar');
      return;
    }
    // Modo Webphone: garante que numero_chip seja salvo vazio
    const dadosSalvar = { ...form, numero_chip: '' };
    setLoading(true);
    const res = await base44.functions.invoke('nvoipCallCenter', {
      action: 'salvarConfigUsuario',
      ...dadosSalvar,
    });
    setLoading(false);
    if (res.data?.success) {
      toast.success('Ramal configurado! Chip removido — chamadas chegarão direto no Webphone.');
      onSalvo?.();
      onOpenChange(false);
    } else {
      toast.error(res.data?.error || 'Erro ao salvar configuração');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-[#23BE84]" />
            Meu Ramal NVOIP
          </DialogTitle>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {configAtual && (
              <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                <div className="text-sm text-green-700">
                  <span className="font-semibold">Ramal ativo:</span> {configAtual.numbersip}
                </div>
                <Badge className="ml-auto bg-green-100 text-green-700 text-xs">Pessoal</Badge>
              </div>
            )}

            {chipIgualDid && (
              <div className="p-3 bg-red-50 border-2 border-red-300 rounded-lg text-sm text-red-800">
                <p className="font-semibold mb-1">❌ Erro de configuração</p>
                <p>O <strong>Número do CHIP</strong> está igual ao <strong>DID</strong>. O chip deve ser um <strong>celular físico real</strong> que irá tocar primeiro. O DID é apenas o número de identificação da empresa.</p>
              </div>
            )}

            <div className="p-3 bg-green-50 border border-green-300 rounded-lg text-sm text-green-900">
              <p className="font-semibold mb-1">📡 Como funciona o Webphone:</p>
              <ol className="list-decimal list-inside space-y-0.5 text-xs">
                <li>O CRM registra seu ramal SIP via WebSocket seguro</li>
                <li>Chamadas de saída e entrada acontecem 100% no navegador</li>
                <li><strong>Nenhum celular físico necessário</strong> — deixe o Chip vazio</li>
                <li>Chamadas recebidas aparecem em popup dentro do CRM</li>
              </ol>
            </div>

            <div className="space-y-2">
              <Label>Ramal SIP (NumberSIP) *</Label>
              <Input
                placeholder="Ex: 137715001 (ramal interno NVOIP, NÃO o telefone do cliente)"
                value={form.numbersip}
                onChange={e => setForm({ ...form, numbersip: e.target.value.trim() })}
              />
              <p className="text-xs text-amber-600 font-medium">⚠️ Este é o ramal interno do NVOIP (ex: 137715001), NÃO o telefone do cliente nem seu celular pessoal.</p>
              <p className="text-xs text-slate-400">NVOIP → Ramais → selecione o ramal → campo "NumberSIP"</p>
            </div>

            <div className="space-y-2">
              <Label>Napikey (recomendado) <span className="text-xs font-normal text-slate-400">— NVOIP v2 legado</span></Label>
              <Input
                type="password"
                placeholder="Cole sua Napikey do painel NVOIP"
                value={form.napikey}
                onChange={e => setForm({ ...form, napikey: e.target.value.trim() })}
              />
              <p className="text-xs text-slate-400">NVOIP → API → Nvoip API v2 → Napikey</p>
            </div>

            <div className="space-y-2">
              <Label>User Token <span className="text-xs font-normal text-slate-400">(alternativo ao Napikey)</span></Label>
              <Input
                type="password"
                placeholder="Cole seu User Token do painel NVOIP"
                value={form.user_token}
                onChange={e => setForm({ ...form, user_token: e.target.value.trim() })}
              />
              <p className="text-xs text-slate-400">NVOIP → API → Nvoip API v2 → User Token</p>
            </div>

            <div className="space-y-2">
              <Label>Senha SIP <span className="text-red-500 font-semibold">*</span> <span className="text-xs font-normal text-slate-400">— obrigatória para o Webphone</span></Label>
              <Input
                type="password"
                placeholder="Senha SIP do ramal (painel NVOIP → Ramais → Editar)"
                value={form.sip_password}
                onChange={e => setForm({ ...form, sip_password: e.target.value })}
                className={!form.sip_password ? 'border-amber-400 focus:ring-amber-400' : ''}
              />
              <p className="text-xs text-slate-400">NVOIP → Ramais → selecione o ramal → campo "Senha SIP"</p>
            </div>

            {/* CHIP - sempre limpo no modo Webphone */}
            {form.numero_chip ? (
              <div className="p-3 bg-red-50 border-2 border-red-500 rounded-lg">
                <div className="flex items-start gap-2">
                  <span className="text-red-600 text-lg shrink-0">🚫</span>
                  <div className="flex-1 text-sm text-red-800 space-y-1">
                    <p className="font-bold text-red-700">Número Chip detectado: {form.numero_chip}</p>
                    <p>O NVOIP está desviando TODAS as chamadas entrantes para este celular físico. O Webphone <strong>não receberá nenhuma chamada</strong> enquanto este campo estiver preenchido.</p>
                    <p className="font-semibold">Para receber chamadas no CRM, remova o Chip e garanta que o DID aponte para o ramal SIP.</p>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, numero_chip: '' })}
                      className="mt-1 px-3 py-1 bg-red-600 text-white rounded-md text-xs font-bold hover:bg-red-700"
                    >
                      🗑️ Remover Chip — ativar recebimento no Webphone
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-2 bg-green-50 border border-green-300 rounded-lg text-xs text-green-700 font-medium">
                ✅ Sem chip — chamadas entrantes chegam direto no Webphone (navegador)
              </div>
            )}

            {/* DID - para SAIR e RECEBER */}
            <div className="space-y-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Label className="text-blue-800 font-semibold">☎️ Número DID <span className="text-xs font-normal">(CallerID de saída / entrada)</span></Label>
              <Input
                placeholder="Ex: 558132998470"
                value={form.numero_did}
                onChange={e => setForm({ ...form, numero_did: e.target.value.trim() })}
                className="border-blue-300 bg-white"
              />
              <div className="text-xs text-blue-700 space-y-1">
                <p>Quem receber sua ligação verá este número no identificador de chamadas.</p>
                <p className="font-semibold text-blue-800">⚠️ Para receber chamadas: certifique-se de que no painel NVOIP o DID está roteado para o ramal <strong>{form.numbersip || 'SIP'}</strong>. Caso contrário, chamadas não chegam no Webphone.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleTestar} disabled={testando} className="flex-1">
                {testando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Phone className="w-4 h-4 mr-2" />}
                Testar Ramal
              </Button>
              {testeOk === true && <CheckCircle className="w-5 h-5 text-green-500" />}
              {testeOk === false && <XCircle className="w-5 h-5 text-red-500" />}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleSalvar} disabled={loading} className="bg-[#10353C] hover:bg-[#1a5060] text-white">
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Salvar Meu Ramal
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}