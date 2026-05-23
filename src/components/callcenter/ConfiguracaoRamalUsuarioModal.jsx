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
    if (!form.numbersip || !form.user_token) {
      toast.error('Preencha o Ramal SIP e o User Token');
      return;
    }
    setTestando(true);
    setTesteOk(null);
    const res = await base44.functions.invoke('nvoipCallCenter', {
      action: 'testarConexao',
      numbersip: form.numbersip,
      user_token: form.user_token,
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
    if (!form.numbersip || !form.user_token) {
      toast.error('Ramal SIP e User Token são obrigatórios');
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

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <p className="font-semibold mb-1">⚙️ Configuração individual do ramal</p>
              <p>Cada vendedor/colaborador pode ter seu próprio ramal NVOIP. Ao realizar chamadas, o sistema usará <strong>seu ramal pessoal</strong> como origem.</p>
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
              <Label>User Token *</Label>
              <Input
                type="password"
                placeholder="Cole seu User Token do painel NVOIP"
                value={form.user_token}
                onChange={e => setForm({ ...form, user_token: e.target.value.trim() })}
              />
              <p className="text-xs text-slate-400">NVOIP → API → Nvoip API v2 → User Token</p>
            </div>

            <div className="space-y-2 p-3 bg-green-50 border-2 border-green-300 rounded-lg">
              <Label className="text-green-800 font-bold">📱 Número do Chip/Celular</Label>
              <Input
                placeholder="Ex: 87991234567 (DDD + número)"
                value={form.numero_chip}
                onChange={e => setForm({ ...form, numero_chip: e.target.value.replace(/\D/g, '') })}
                className="border-green-300"
              />
              <p className="text-xs text-green-700">Ao ligar, o sistema encaminhará a chamada para este celular automaticamente.</p>
            </div>

            <div className="space-y-2">
              <Label>Número DID de saída <span className="text-slate-400 text-xs font-normal">(opcional)</span></Label>
              <Input
                placeholder="Ex: 558132998470"
                value={form.numero_did}
                onChange={e => setForm({ ...form, numero_did: e.target.value.trim() })}
              />
              <p className="text-xs text-slate-400">Aparecerá como identificador de chamada para o cliente</p>
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