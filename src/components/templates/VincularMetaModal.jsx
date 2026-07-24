import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'react-hot-toast';
import { Loader2, Link2, ShieldCheck } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

export default function VincularMetaModal({ open, onOpenChange, onSuccess }) {
  const [connections, setConnections] = useState([]);
  const [loadingConns, setLoadingConns] = useState(false);
  const [connId, setConnId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [phoneId, setPhoneId] = useState('');
  const [metaToken, setMetaToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (!open) { setMetaToken(''); setTestResult(null); return; }
    (async () => {
      setLoadingConns(true);
      try {
        const res = await base44.functions.invoke('gerenciarTemplateMetaOficial', { action: 'list_connections' });
        const conns = res?.data?.connections || [];
        setConnections(conns);
        if (conns[0]?.id) setConnId(conns[0].id);
        if (conns[0]?.waba_id) setWabaId(conns[0].waba_id);
        if (conns[0]?.phone_number_id) setPhoneId(conns[0].phone_number_id);
      } catch (e) {
        toast.error('Erro ao carregar conexões.');
      } finally { setLoadingConns(false); }
    })();
  }, [open]);

  const handleTest = async () => {
    if (!connId) return toast.error('Selecione uma conexão.');
    setTesting(true); setTestResult(null);
    try {
      const res = await base44.functions.invoke('gerenciarTemplateMetaOficial', {
        action: 'test_template_access', connection_id: connId,
      });
      setTestResult(res?.data);
      if (res?.data?.success) toast.success('Acesso ao WABA confirmado.');
      else toast.error(res?.data?.error || 'Sem acesso ao WABA com os dados salvos.');
    } catch (e) {
      setTestResult(e?.response?.data || null);
      toast.error(e?.response?.data?.error || 'Erro ao testar acesso.');
    } finally { setTesting(false); }
  };

  const handleSave = async () => {
    if (!connId) return toast.error('Selecione uma conexão.');
    if (!/^\d+$/.test(wabaId)) return toast.error('WABA ID deve conter somente números.');
    if (!metaToken.trim()) return toast.error('Informe o Token da Meta.');
    setSaving(true);
    try {
      const res = await base44.functions.invoke('gerenciarTemplateMetaOficial', {
        action: 'vincular_dados_meta',
        connection_id: connId,
        waba_id: wabaId,
        phone_number_id: phoneId,
        meta_token: metaToken,
      });
      const data = res?.data;
      if (data?.success) {
        toast.success(data.message || 'Dados vinculados.');
        setMetaToken('');
        setTestResult(null);
        onSuccess && onSuccess();
        onOpenChange(false);
      } else {
        toast.error(data?.meta_message || data?.error || 'Falha ao vincular.');
      }
    } catch (e) {
      toast.error(e?.response?.data?.meta_message || e?.response?.data?.error || 'Falha ao vincular.');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="w-4 h-4 text-[#10353C]" /> Vincular dados da Meta
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-slate-500">
            Use quando a sessão D-API Cloud API não retornar WABA ID/Phone Number ID.
            O token é salvo no backend (criptografado em coluna) e nunca é exibido novamente.
          </p>
          <div>
            <Label>Conexão</Label>
            <Select value={connId} onValueChange={setConnId}>
              <SelectTrigger><SelectValue placeholder={loadingConns ? 'Carregando...' : 'Selecione a conexão'} /></SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome || c.id} {c.waba_id ? `· WABA ${c.waba_id}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>WABA ID (somente números)</Label>
            <Input value={wabaId} onChange={(e) => setWabaId(e.target.value.replace(/\D/g, ''))} placeholder="1763691181671244" />
          </div>
          <div>
            <Label>Phone Number ID (opcional — usado para enviar mensagens)</Label>
            <Input value={phoneId} onChange={(e) => setPhoneId(e.target.value.replace(/\D/g, ''))} placeholder="1109683608896328" />
          </div>
          <div>
            <Label>Token da Meta</Label>
            <Input type="password" value={metaToken} onChange={(e) => setMetaToken(e.target.value)} placeholder="EAAG..." />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !connId}>
              {testing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
              Testar acesso salvo
            </Button>
          </div>
          {testResult && (
            <div className={`text-xs rounded-md border p-2 ${testResult.success ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {testResult.success ? '✓ ' : '✗ '}
              {testResult.success
                ? 'WABA acessível e pode gerenciar templates.'
                : testResult.error || testResult.meta_message || 'Falha no acesso.'}
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
          <Button onClick={handleSave} disabled={saving} className="bg-[#10353C] text-white hover:bg-[#1a5060]">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
            Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}