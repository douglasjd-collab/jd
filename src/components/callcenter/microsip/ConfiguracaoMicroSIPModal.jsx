import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, ExternalLink, Info } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const CHAVE = 'microsip_config_local';

export default function ConfiguracaoMicroSIPModal({ open, onOpenChange, empresaId, onSalvo }) {
  const [form, setForm] = useState({
    sip_user: '',
    sip_password: '',
    sip_domain: 'sip.nvoip.com.br',
    numero_did: '',
  });
  const [saving, setSaving] = useState(false);

  // Carregar config salva (localStorage + entidade empresa)
  useEffect(() => {
    if (!open) return;
    const local = localStorage.getItem(CHAVE);
    if (local) {
      try { setForm(prev => ({ ...prev, ...JSON.parse(local) })); } catch {}
    }
    // Tenta carregar da entidade ConfiguracaoNvoip (campos sip_*)
    if (empresaId) {
      base44.entities.ConfiguracaoNvoip.filter({ empresa_id: empresaId }).then(configs => {
        if (configs.length > 0) {
          const c = configs[0];
          setForm(prev => ({
            ...prev,
            sip_user: c.numbersip || prev.sip_user,
            sip_password: c.sip_password || prev.sip_password,
            numero_did: c.numero_did || prev.numero_did,
          }));
        }
      }).catch(() => {});
    }
  }, [open, empresaId]);

  const handleSalvar = async () => {
    if (!form.sip_user || !form.sip_password || !form.sip_domain) {
      toast.error('Preencha SIP User, SIP Password e SIP Domain');
      return;
    }
    setSaving(true);
    // Salva no localStorage para uso imediato no browser
    localStorage.setItem(CHAVE, JSON.stringify(form));

    // Também atualiza ConfiguracaoNvoip da empresa se existir
    if (empresaId) {
      const configs = await base44.entities.ConfiguracaoNvoip.filter({ empresa_id: empresaId });
      if (configs.length > 0) {
        await base44.entities.ConfiguracaoNvoip.update(configs[0].id, {
          numbersip: form.sip_user,
          sip_password: form.sip_password,
          numero_did: form.numero_did,
        });
      }
    }
    setSaving(false);
    toast.success('Configuração MicroSIP salva!');
    onSalvo?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📞 Configuração MicroSIP Local
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Guia rápido */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <Info className="w-4 h-4" /> Como configurar o MicroSIP:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-blue-700 text-xs">
              <li>Baixe e instale o MicroSIP em <a href="https://www.microsip.org/downloads" target="_blank" rel="noopener noreferrer" className="underline">microsip.org</a></li>
              <li>Em <strong>Menu → Adicionar Conta</strong>, preencha com os dados abaixo</li>
              <li>Ative <strong>"Auto Resposta"</strong> ou configure conforme preferir</li>
              <li>Para o CRM receber chamadas, configure em MicroSIP: <strong>Menu → Configurações → Avançado → "Incoming call URL"</strong>:<br/>
                <code className="bg-blue-100 px-1 rounded text-xs break-all select-all">{window.location.origin}/CallCenter?incoming=%CallerID%</code>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/CallCenter?incoming=%CallerID%`); }}
                  className="ml-1 text-blue-600 underline text-xs"
                >copiar</button>
              </li>
            </ol>
            <a
              href="https://suporte.nvoip.com.br/portal/pt/kb/articles/como-configurar-o-microsip"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
            >
              <ExternalLink className="w-3 h-3" /> Guia completo NVOIP + MicroSIP
            </a>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>SIP User (NumberSIP) *</Label>
              <Input
                placeholder="Ex: 142502001"
                value={form.sip_user}
                onChange={e => setForm(f => ({ ...f, sip_user: e.target.value }))}
              />
              <p className="text-xs text-slate-400">Número do ramal SIP no painel NVOIP</p>
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label>SIP Password *</Label>
              <Input
                type="password"
                placeholder="Senha SIP (não confundir com senha da conta)"
                value={form.sip_password}
                onChange={e => setForm(f => ({ ...f, sip_password: e.target.value }))}
              />
              <p className="text-xs text-slate-400">Painel NVOIP → Ramais → seu ramal → Senha SIP</p>
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label>SIP Domain *</Label>
              <Input
                placeholder="sip.nvoip.com.br"
                value={form.sip_domain}
                onChange={e => setForm(f => ({ ...f, sip_domain: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label>Número DID <span className="text-slate-400 font-normal">(número externo)</span></Label>
              <Input
                placeholder="Ex: 558132998470"
                value={form.numero_did}
                onChange={e => setForm(f => ({ ...f, numero_did: e.target.value.replace(/\D/g, '') }))}
              />
              <p className="text-xs text-slate-400">Número que os clientes discam para te ligar</p>
            </div>
          </div>

          {/* Instrução URI */}
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 space-y-1">
            <p className="font-semibold">📲 Como funciona a discagem:</p>
            <p>Ao clicar em "Ligar" no CRM, o browser executa:</p>
            <code className="bg-green-100 px-2 py-1 rounded block font-mono">microsip:&lt;numero&gt;</code>
            <p className="mt-1">O MicroSIP intercepta o protocolo e discou automaticamente. Certifique-se de que o MicroSIP está aberto e registrado.</p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={saving} className="bg-[#10353C] hover:bg-[#10353C]/90 text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <CheckCircle className="w-4 h-4 mr-1.5" />
              Salvar Configuração
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}