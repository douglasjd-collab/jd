import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Loader2, Phone } from 'lucide-react';
import { toast } from 'sonner';

const isEnabled = (data, connectionId) => (data?.configs || []).some(
  config => config.user_id === data.userId && config.connection_id === connectionId && config.ativo
);
const formatNumber = value => {
  const digits = String(value || '').replace(/\D/g, '');
  return /^55\d{11}$/.test(digits)
    ? '+' + digits.slice(0, 2) + ' ' + digits.slice(2, 4) + ' ' + digits.slice(4, 9) + '-' + digits.slice(9)
    : value || '';
};

// Controlado pelo Layout: a abertura vem do menu do perfil.
export default function ConfiguracaoRecebimentoLigacoes({ user, open = false, onOpenChange }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [draft, setDraft] = useState({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setData(null);
    setDraft({});
    setConnectionId('');
    setError('');
    if (!user.empresa_id) {
      setBusy(false);
      setError('Selecione uma empresa para configurar o recebimento de ligações.');
      return;
    }
    setBusy(true);
    base44.functions.invoke('preferenciasRecebimentoLigacoes', { empresaId: user.empresa_id })
      .then(({ data: result }) => {
        if (result.error || result.success === false) throw new Error(result.error || 'Não foi possível carregar as configurações.');
        if (cancelled) return;
        setData(result);
        setConnectionId(result.connections[0]?.id || '');
      })
      .catch(e => {
        if (!cancelled) setError(e.response?.data?.error || e.message || 'Não foi possível carregar as configurações.');
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [open, user.id, user.empresa_id]);

  const selected = data?.connections.find(connection => connection.id === connectionId);
  const enabled = draft[connectionId] ?? isEnabled(data, connectionId);
  const changes = Object.entries(draft).filter(([id, active]) => active !== isEnabled(data, id));
  const save = async () => {
    if (busy || !selected || !changes.length) return;
    setBusy(true);
    setError('');
    try {
      for (const [id, active] of changes) {
        const { data: result } = await base44.functions.invoke('preferenciasRecebimentoLigacoes', {
          empresaId: user.empresa_id,
          acao: 'salvar',
          connectionId: id,
          ativo: active,
        });
        if (result.error || result.success === false) throw new Error(result.error || 'Não foi possível salvar as configurações.');
        setData(result);
      }
      setDraft({});
      toast.success('Configuração de ligações salva.');
      onOpenChange(false);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Não foi possível salvar as configurações.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configuração de ligações</DialogTitle>
          <DialogDescription>Escolha o número e ative o recebimento de ligações neste CRM.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {busy && !data && <div role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Carregando números...</div>}
        {data?.connections.length === 0 && <p className="text-sm text-slate-500">Nenhum número D-API compatível encontrado.</p>}
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="numero-recebimento-ligacoes" className="text-sm font-medium">Número</label>
            <select
              id="numero-recebimento-ligacoes"
              className="w-full min-w-0 rounded-lg border border-slate-200 bg-background px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              value={connectionId}
              onChange={event => setConnectionId(event.target.value)}
              disabled={busy || !data?.connections.length}
            >
              {!connectionId && <option value="">Selecione o número</option>}
              {data?.connections.map(connection => (
                <option key={connection.id} value={connection.id}>
                  {[connection.nome, formatNumber(connection.numero)].filter(Boolean).join(' — ') || 'Número conectado'}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-4">
            <Phone aria-hidden="true" className="h-6 w-6 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <label htmlFor="receber-ligacoes" className="cursor-pointer text-sm font-semibold">Receber ligações</label>
              <p id="receber-ligacoes-descricao" className="mt-1 text-xs text-slate-500">Receber chamadas deste número neste CRM.</p>
            </div>
            <Switch
              id="receber-ligacoes"
              aria-describedby="receber-ligacoes-descricao"
              className="data-[state=checked]:bg-emerald-600"
              checked={enabled}
              disabled={busy || !selected}
              onCheckedChange={active => setDraft(current => ({ ...current, [connectionId]: active }))}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={busy || !selected || !changes.length} onClick={save}>
            {busy && data && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {busy && data ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
