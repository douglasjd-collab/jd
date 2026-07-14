import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

const APP_ID = '1574136874002258';
const CONFIG_ID = '1355211576800271';

let sdkPromise = null;

const carregarSdk = () => {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    if (window.FB) {
      resolve(true);
      return;
    }
    window.fbAsyncInit = function () {
      window.FB.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: true, version: 'v21.0' });
      resolve(true);
    };
    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  });
  return sdkPromise;
};

/**
 * Botão que abre DIRETAMENTE o popup do Facebook (Embedded Signup via FB.login).
 * Não usa aba intermediária: o clique dispara o popup da Meta onboarding.
 */
export default function LoginMetaOficialButton({ empresaId, onSuccess }) {
  const [sdkPronto, setSdkPronto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const sessionInfoRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    carregarSdk().then(() => { if (mounted) setSdkPronto(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const handleMessage = (event) => {
      if (!event.origin.endsWith('facebook.com')) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP' && data.event === 'FINISH') {
          sessionInfoRef.current = {
            waba_id: data.data?.waba_id,
            phone_number_id: data.data?.phone_number_id,
          };
        }
      } catch (_) {}
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const iniciarLogin = async () => {
    if (!empresaId) {
      toast.error('Empresa não identificada. Recarregue a página e tente novamente.');
      return;
    }
    if (!sdkPronto || !window.FB) {
      toast.info('Aguardando carregamento do SDK... tente novamente em alguns segundos.');
      return;
    }

    setCarregando(true);
    window.FB.login(
      async (response) => {
        if (response.authResponse && response.authResponse.code) {
          try {
            const resp = await base44.functions.invoke('metaEmbeddedSignup', {
              action: 'exchange_code',
              empresa_id: empresaId,
              code: response.authResponse.code,
              waba_id: sessionInfoRef.current?.waba_id,
              phone_number_id: sessionInfoRef.current?.phone_number_id,
            });
            if (resp.data?.ok) {
              toast.success(`✅ WhatsApp Oficial conectado${resp.data.display_phone_number ? ': ' + resp.data.display_phone_number : ''}`);
              onSuccess?.();
            } else {
              toast.error('Erro ao conectar: ' + (resp.data?.error || 'Falha na conexão'));
            }
          } catch (e) {
            toast.error('Erro ao processar conexão: ' + e.message);
          } finally {
            setCarregando(false);
          }
        } else {
          setCarregando(false);
          if (response.status === 'not_authorized') {
            toast.error('Você não autorizou o app. Pode tentar novamente.');
          } else {
            toast.info('Login cancelado.');
          }
        }
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: { feature: 'whatsapp_embedded_signup', sessionInfoVersion: 3 },
      }
    );
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800 text-white h-12 text-base font-semibold"
        onClick={iniciarLogin}
        disabled={!sdkPronto || carregando}
      >
        {carregando ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Conectando...</>
        ) : !sdkPronto ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Carregando SDK...</>
        ) : (
          <><MessageSquare className="w-5 h-5" /> Fazer Login com a Meta</>
        )}
      </Button>
      <p className="text-xs text-slate-500 text-center">
        Ao clicar, uma janela da Meta abre para você autorizar a conexão do seu WhatsApp Business. As credenciais são salvas automaticamente no CRM.
      </p>
    </div>
  );
}