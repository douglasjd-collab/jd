import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ConfiguracaoNvoipModal({ open, onOpenChange, config, onSalvo }) {
  const [form, setForm] = useState({
    numbersip: config?.numbersip || '',
    sip_password: config?.sip_password || '',
    numero_did: config?.numero_did || '',
    numero_chip: config?.numero_chip || '',
    user_token: config?.user_token || '',
    napikey: config?.napikey || '',
  });

  useEffect(() => {
    if (config) {
      setForm({
        numbersip: config.numbersip || '',
        sip_password: config.sip_password || '',
        numero_did: config.numero_did || '',
        numero_chip: config.numero_chip || '',
        user_token: config.user_token || '',
        napikey: config.napikey || '',
      });
    }
  }, [config]);
  const [loading, setLoading] = useState(false);
  const [testando, setTestando] = useState(false);
  const [testeOk, setTesteOk] = useState(null);

  const handleTestar = async () => {
    if (!form.numbersip || !form.user_token) {
      toast.error('Preencha o NumberSIP e o User Token');
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
      toast.success('Conexão com NVOIP bem-sucedida!');
    } else {
      setTesteOk(false);
      toast.error('Falha na conexão. Verifique as credenciais.');
    }
  };

  const handleSalvar = async () => {
    if (!form.numbersip || !form.user_token) {
      toast.error('NumberSIP e User Token são obrigatórios');
      return;
    }
    setLoading(true);
    const res = await base44.functions.invoke('nvoipCallCenter', {
      action: 'salvarConfig',
      ...form,
    });
    setLoading(false);
    if (res.data?.success) {
      toast.success('Configuração salva com sucesso!');
      onSalvo?.();
      onOpenChange(false);
    } else {
      toast.error('Erro ao salvar configuração');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configuração NVOIP</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 space-y-2">
            <p className="font-semibold">⚙️ Configuração necessária no painel NVOIP:</p>
            <p>Para as chamadas irem direto para o chip, acesse:<br/>
            <strong>nvoip.com.br → Ramais → clique no ramal → Encaminhamento de Chamadas → informe o número do seu chip/celular</strong></p>
            <p className="text-xs text-blue-600">Após configurar o encaminhamento, ao clicar em "Ligar" o chip irá tocar automaticamente.</p>
          </div>
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
            <p className="font-semibold mb-1">Como obter as credenciais de API:</p>
            <p>Acesse <strong>nvoip.com.br → Painel → API → Nvoip API v2 (legado)</strong> para copiar a <strong>Napikey</strong> e o <strong>User Token</strong>.</p>
          </div>

          <div className="space-y-2">
            <Label>NumberSIP *</Label>
            <Input
              placeholder="Ex: 142502001 (número do ramal SIP)"
              value={form.numbersip}
              onChange={e => setForm({ ...form, numbersip: e.target.value })}
            />
            <p className="text-xs text-slate-400">Número do seu ramal SIP no painel NVOIP</p>
          </div>

          <div className="space-y-2">
            <Label>Número DID <span className="text-slate-500 text-xs">(número externo para saída)</span></Label>
            <Input
              placeholder="Ex: 558132998470 (DDI+DDD+número)"
              value={form.numero_did}
              onChange={e => setForm({ ...form, numero_did: e.target.value })}
            />
            <p className="text-xs text-slate-400">Número DID externo da NVOIP — aparecerá no identificador de chamadas. No painel NVOIP: <strong>Números → seu DID</strong>.</p>
          </div>

          <div className="space-y-2 p-3 bg-green-50 border-2 border-green-400 rounded-lg">
            <Label className="text-green-800 font-bold">📱 Número do Chip/Celular — para receber a ligação</Label>
            <Input
              placeholder="Ex: 87991234567 (DDD + número)"
              value={form.numero_chip}
              onChange={e => setForm({ ...form, numero_chip: e.target.value.replace(/\D/g, '') })}
              className="border-green-300 focus:border-green-500"
            />
            <p className="text-xs text-green-700">
              Número do celular físico com o chip. Ao clicar em "Ligar", o sistema configurará o encaminhamento do ramal para este número automaticamente, e a chamada irá diretamente para o chip.
            </p>
          </div>

          <div className="space-y-2 p-3 bg-blue-50 border border-blue-300 rounded-lg">
            <Label className="text-blue-800 font-bold">🔵 Senha SIP — para receber chamadas no CRM (WebRTC)</Label>
            <Input
              type="password"
              placeholder="Senha SIP do ramal (encontrada no painel NVOIP → Ramais)"
              value={form.sip_password}
              onChange={e => setForm({ ...form, sip_password: e.target.value })}
              className="border-blue-300"
            />
            <p className="text-xs text-blue-700">
              Com a senha SIP, o CRM conecta diretamente via WebRTC e você recebe chamadas entrantes aqui, sem precisar do MicroSIP.
            </p>
          </div>

          <div className="space-y-2">
            <Label>User Token *</Label>
            <Input
              type="password"
              placeholder="Cole o User Token do painel NVOIP"
              value={form.user_token}
              onChange={e => setForm({ ...form, user_token: e.target.value })}
            />
            <p className="text-xs text-slate-400">Ex: 84682144-1804-11f1-a3b7-027e3c96bf59</p>
          </div>

          <div className="space-y-2">
            <Label>Napikey</Label>
            <Input
              type="password"
              placeholder="Cole a Napikey do painel NVOIP"
              value={form.napikey}
              onChange={e => setForm({ ...form, napikey: e.target.value })}
            />
            <p className="text-xs text-slate-400">Chave de API encontrada na seção API v2 (legado)</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleTestar} disabled={testando} className="flex-1">
              {testando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Testar Conexão
            </Button>
            {testeOk === true && <CheckCircle className="w-5 h-5 text-green-500" />}
            {testeOk === false && <XCircle className="w-5 h-5 text-red-500" />}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}