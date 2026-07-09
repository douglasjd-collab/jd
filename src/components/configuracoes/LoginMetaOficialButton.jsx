import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

const APP_ID = '1574136874002258';
const CONFIG_ID = '1355211576800271';
const TIMEOUT_MS = 45000;
const AVISO_BLOQUEIO_MS = 8000;

export default function LoginMetaOficialButton({ empresaId, onSuccess }) {
  const [sdkReady, setSdkReady] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [avisoBloqueio, setAvisoBloqueio] = useState(false);
  const timeoutRef = useRef(null);
  const avisoRef = useRef(null);
  const emIframe = typeof window !== 'undefined' && window.self !== window.top;

  useEffect(() => {
    if (window.FB) {
      setSdkReady(true);
      return;
    }
    window.fbAsyncInit = function () {
      window.FB.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: true, version: 'v21.0' });
      setSdkReady(true);
    };
    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const finalizar = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (avisoRef.current) clearTimeout(avisoRef.current);
    setConectando(false);
    setAvisoBloqueio(false);
  };

  const iniciarLogin = () => {
    if (!sdkReady || !window.FB) {
      toast.error('O SDK do Facebook ainda está carregando. Aguarde alguns segundos e tente novamente.');
      return;
    }
    if (!empresaId) {
      toast.error('Empresa não identificada.');
      return;
    }

    setConectando(true);
    setAvisoBloqueio(false);

    // Se em poucos segundos não houve resposta, provavelmente o navegador bloqueou o pop-up
    avisoRef.current = setTimeout(() => {
      setAvisoBloqueio(true);
    }, AVISO_BLOQUEIO_MS);

    // Failsafe: se o Facebook não responder em 45s, libera o botão e avisa o usuário
    timeoutRef.current = setTimeout(() => {
      toast.error('O login com o Facebook não respondeu. Verifique se a janela de login foi bloqueada pelo navegador, ou se o app da Meta está com o domínio autorizado corretamente, e tente novamente.');
      finalizar();
    }, TIMEOUT_MS);

    window.FB.login(
      async (response) => {
        if (response.authResponse && response.authResponse.code) {
          try {
            const resp = await base44.functions.invoke('metaEmbeddedSignup', {
              action: 'exchange_code',
              empresa_id: empresaId,
              code: response.authResponse.code,
            });
            if (resp.data?.ok) {
              toast.success('✅ WhatsApp conectado! Credenciais preenchidas automaticamente.');
              onSuccess?.();
            } else {
              toast.error('Erro: ' + (resp.data?.error || 'Falha na conexão'));
            }
          } catch (e) {
            toast.error('Erro ao processar conexão: ' + e.message);
          }
        } else if (response.status === 'not_authorized') {
          toast.error('Você não autorizou o app. Tente novamente.');
        } else {
          toast.info('Conexão cancelada.');
        }
        finalizar();
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          feature: 'whatsapp_embedded_signup',
          sessionInfoVersion: 3,
        },
      }
    );
  };

  if (emIframe) {
    return (
      <div className="space-y-2">
        <Button
          type="button"
          className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold"
          onClick={() => window.open(window.location.href, '_blank')}
        >
          <MessageSquare className="w-5 h-5" /> Abrir em nova aba para fazer Login com a Meta
        </Button>
        <p className="text-xs text-slate-500">
          Você está numa visualização em preview (dentro de um iframe), e o navegador bloqueia pop-ups nesse caso. Clique acima para abrir esta página em uma aba de verdade e fazer o login por lá.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold"
        onClick={iniciarLogin}
        disabled={conectando || !sdkReady}
      >
        {conectando
          ? <><Loader2 className="w-5 h-5 animate-spin" /> Aguardando autorização...</>
          : !sdkReady
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Carregando...</>
            : <><MessageSquare className="w-5 h-5" /> Fazer Login com a Meta (preenche automaticamente)</>}
      </Button>
      {conectando && avisoBloqueio && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
          <p className="text-xs text-amber-800">
            A janela de login não abriu ainda. Verifique se o navegador ou alguma extensão bloqueou o pop-up e libere para este site.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={finalizar}>
            Cancelar e tentar novamente
          </Button>
        </div>
      )}
    </div>
  );
}