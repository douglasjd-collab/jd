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
    user_token: config?.user_token || '',
    napikey: config?.napikey || '',
  });

  useEffect(() => {
    if (config) {
      setForm({
        numbersip: config.numbersip || '',
        sip_password: config.sip_password || '',
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
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
            <p className="font-semibold mb-1">Como obter as credenciais:</p>
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
            <Label>Senha SIP <span className="text-blue-600 font-semibold">(para chamadas de voz)</span></Label>
            <Input
              type="password"
              placeholder="Senha SIP do ramal (painel NVOIP → Ramais)"
              value={form.sip_password}
              onChange={e => setForm({ ...form, sip_password: e.target.value })}
            />
            <p className="text-xs text-slate-400">No painel NVOIP: <strong>Ramais → seu ramal → Senha SIP</strong>. Necessária para fazer/receber ligações com áudio.</p>
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