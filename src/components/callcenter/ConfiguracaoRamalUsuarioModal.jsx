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
    if (!form.napikey && !form.user_token) {
      toast.error('Informe a Napikey ou o User Token');
      return;
    }
    if (!form.sip_password) {
      toast.error('Senha SIP é obrigatória para o Webphone funcionar');
      return;
    }
    setLoading(true);
    const res = await base44.functions.invoke('nvoipCallCenter', {
      action: 'salvarConfigUsuario',
      ...form,
    });
    setLoading(false);
    if (res.data?.success) {
      toast.success('Ramal pessoal configurado! Suas chamadas usarão este ramal.');
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
                placeholder="Ex: 142502001"
                value={form.numbersip}
                onChange={e => setForm({ ...form, numbersip: e.target.value.trim() })}
              />
              <p className="text-xs text-slate-400">Número do seu ramal SIP no painel NVOIP</p>
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

            {/* CHIP - ATENÇÃO: desvia chamadas para fora do Webphone */}
            <div className={`space-y-2 p-3 rounded-lg border-2 ${form.numero_chip ? 'bg-amber-50 border-amber-400' : 'bg-slate-50 border-slate-200'}`}>
              <Label className={form.numero_chip ? 'text-amber-800 font-bold' : 'text-slate-700'}>
                📱 Número Chip (encaminhamento para celular físico)
                {form.numero_chip && <span className="ml-2 text-xs font-normal text-amber-700">— chamadas serão desviadas para este celular!</span>}
              </Label>
              <Input
                placeholder="Deixe vazio para receber no Webphone (navegador)"
                value={form.numero_chip}
                onChange={e => setForm({ ...form, numero_chip: e.target.value.replace(/\D/g, '') })}
                className={form.numero_chip ? 'border-amber-300 bg-white' : 'bg-white'}
              />
              {form.numero_chip ? (
                <div className="text-xs text-amber-800 space-y-0.5">
                  <p className="font-semibold">⚠️ Com este campo preenchido, o NVOIP vai desviar TODAS as chamadas entrantes para o celular {form.numero_chip}.</p>
                  <p>Para receber chamadas no Webphone (navegador), <strong>deixe este campo vazio</strong>.</p>
                  <button type="button" onClick={() => setForm({ ...form, numero_chip: '' })} className="text-red-600 hover:underline font-semibold mt-1 block">
                    🗑️ Limpar — quero receber no Webphone
                  </button>
                </div>
              ) : (
                <p className="text-xs text-green-700 font-medium">✅ Vazio = chamadas chegam direto no Webphone (navegador)</p>
              )}
              {chipIgualDid && (
                <p className="text-xs font-semibold text-red-800">❌ Este número é igual ao DID. Use um celular físico diferente!</p>
              )}
            </div>

            {/* DID - para SAIR */}
            <div className="space-y-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Label className="text-blue-800 font-semibold">☎️ Número DID (CallerID de saída) <span className="text-xs font-normal">(opcional)</span></Label>
              <Input
                placeholder="Ex: 5581329984700"
                value={form.numero_did}
                onChange={e => setForm({ ...form, numero_did: e.target.value.trim() })}
                className="border-blue-300 bg-white"
              />
              <p className="text-xs text-blue-700">Quem receber sua ligação verá este número. Se vazio, aparecerá o ramal SIP.</p>
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