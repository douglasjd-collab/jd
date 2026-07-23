import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, Shield } from 'lucide-react';
import { toast } from 'sonner';

const CONNECT_ORIGIN = 'https://connect.d-api.cloud';

/**
 * ConectarDapiCloudModal — abre o popup hospedado da D-API (connect.d-api.cloud/connect),
 * faz o handshake postMessage com a publishable key (buscada no backend), e ao receber o
 * {connectionId, phoneNumber, status} salva e registra o webhook na sessão.
 * Implementa o protocolo descrito em: https://github.com/d-api/exemplo-api-oficial-saas
 */
function connectViaDApi(publishableKey, options) {
  options = options || {};
  const popup = window.open(CONNECT_ORIGIN + '/connect', 'dapi-connect', 'width=600,height=760');
  if (!popup) return Promise.reject(new Error('Popup bloqueado — permita popups neste site.'));

  return new Promise((resolve, reject) => {
    let settled = false;

    function finish(fn) {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
      try { popup.close(); } catch (e) {}
      fn();
    }

    function onMessage(e) {
      if (e.origin !== CONNECT_ORIGIN || e.source !== popup) return;
      const msg = e.data || {};
      if (msg.type === 'dapi-connect-ready') {
        popup.postMessage({
          type: 'dapi-connect-init',
          pk: publishableKey,
          mode: options.mode || 'standard',
          webhookUrl: options.webhookUrl,
          webhookMode: options.webhookMode || 'normalized'
        }, CONNECT_ORIGIN);
      } else if (msg.type === 'dapi-connect-result') {
        finish(() =>
          msg.ok && msg.data
            ? resolve(msg.data)
            : reject(new Error(msg.error || 'Onboarding falhou na D-API'))
        );
      }
    }

    const poll = setInterval(() => {
      if (popup.closed && !settled) finish(() => reject(new Error('Conexão cancelada (popup fechado).')));
    }, 500);

    window.addEventListener('message', onMessage);
  });
}

function buildWebhookUrl() {
  const origin = (window.location.origin || 'https://app.jdpromotora.com.br')
    .replace('https://preview-sandbox--6950a9860c8af0e2ff10fc9e.base44.app', 'https://app.jdpromotora.com.br');
  return `${origin}/functions/webhookDapi`;
}

export default function ConectarDapiCloudModal({ open, onOpenChange, empresaId, onSuccess }) {
  const [mode, setMode] = useState('coexistence'); // 'standard' | 'coexistence'
  const [step, setStep] = useState('idle'); // idle | opening | awaiting_popup | saving | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const resetState = () => { setStep('idle'); setResult(null); setError(null); };

  const handleConnect = async () => {
    setStep('opening');
    setError(null);
    try {
      // 1. Buscar a publishable key no backend (com cache em ConfiguracaoSistema)
      const pkResp = await base44.functions.invoke('dapiCloudConnect', { action: 'get_publishable_key' });
      const pkData = pkResp?.data || pkResp;
      if (!pkData?.success || !pkData.publishable_key) {
        throw new Error(pkData?.error || 'Não foi possível obter a publishable key');
      }
      const pk = pkData.publishable_key;

      setStep('awaiting_popup');

      // 2. Abrir o popup da D-API e fazer o handshake postMessage
      const webhookUrl = buildWebhookUrl();
      const onboardingResult = await connectViaDApi(pk, {
        mode,
        webhookUrl,
        webhookMode: 'normalized'
      });
      setResult(onboardingResult);

      // 3. Salvar a conexão (verifica sessão + registra webhook-config)
      setStep('saving');
      const saveResp = await base44.functions.invoke('dapiCloudConnect', {
        action: 'save_connection',
        connectionId: onboardingResult.connectionId,
        phoneNumber: onboardingResult.phoneNumber,
        status: onboardingResult.status,
        mode,
        webhookUrl,
        empresa_id: empresaId,
        nome: onboardingResult.phoneNumber
          ? `D-API Cloud ${onboardingResult.phoneNumber}`
          : `D-API Cloud ${String(onboardingResult.connectionId).slice(0, 8)}`
      });
      const saveData = saveResp?.data || saveResp;
      if (!saveData?.success) {
        throw new Error(saveData?.error || 'Falha ao salvar a conexão');
      }

      setStep('done');
      toast.success(`WhatsApp Oficial conectado: ${onboardingResult.phoneNumber || onboardingResult.connectionId}`);
      if (onSuccess) setTimeout(onSuccess, 200);
      setTimeout(() => { onOpenChange(false); resetState(); }, 2500);
    } catch (e) {
      console.error('[ConectarDapiCloudModal] erro:', e);
      setError(e.message || String(e));
      setStep('error');
      toast.error(e.message || 'Erro ao conectar');
    }
  };

  const isBusy = step === 'opening' || step === 'awaiting_popup' || step === 'saving';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetState(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600" />
            Conectar WhatsApp Oficial via D-API
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-700">
            Conecta o número oficial do WhatsApp (Cloud API da Meta) usando a D-API como
            provedor. Abre um popup hospedado na D-API que faz todo o Embedded Signup —
            você não precisa cadastrar seu domínio na Meta.
          </p>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Modo de conexão</p>
            <div className="space-y-2">
              <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="dapi-mode"
                  checked={mode === 'standard'}
                  onChange={() => setMode('standard')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <p className="font-medium text-sm">Padrão</p>
                  <p className="text-xs text-slate-500">
                    Habilita o número para enviar e receber via Cloud API.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="dapi-mode"
                  checked={mode === 'coexistence'}
                  onChange={() => setMode('coexistence')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <p className="font-medium text-sm">
                    Coexistência <span className="text-xs text-slate-400">(recomendado)</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Mantém o app WhatsApp Business no mesmo número. O cliente escaneia um QR
                    para vincular o aparelho — útil quando quer usar a API Oficial sem
                    desconectar o celular.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {step === 'opening' && (
            <p className="text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Preparando a publishable key…
            </p>
          )}
          {step === 'awaiting_popup' && (
            <p className="text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Conclua o login no popup da D-API…
            </p>
          )}
          {step === 'saving' && (
            <p className="text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Verificando sessão e configurando webhook…
            </p>
          )}
          {step === 'done' && result && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <p className="flex items-center gap-2 font-semibold text-emerald-900 text-sm">
                <CheckCircle2 className="w-4 h-4" /> Conectado com sucesso!
              </p>
              <p className="text-xs text-emerald-800 mt-1">Número: {result.phoneNumber || '—'}</p>
              <p className="text-xs text-emerald-800 break-all">connectionId: {result.connectionId}</p>
              <p className="text-xs text-emerald-800">status: {result.status}</p>
            </div>
          )}
          {step === 'error' && error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="flex items-center gap-2 text-red-900 text-sm">
                <XCircle className="w-4 h-4" /> Erro
              </p>
              <p className="text-xs text-red-700 mt-1 break-all">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetState(); onOpenChange(false); }} disabled={isBusy}>
            Cancelar
          </Button>
          <Button onClick={handleConnect} disabled={isBusy || step === 'done'}>
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
            Conectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}