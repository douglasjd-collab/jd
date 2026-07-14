import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

const APP_ID = '1574136874002258';
const CONFIG_ID = '1355211576800271';

let sdkPromise = null;
const carregarSdk = () => {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (window.FB) { resolve(true); return; }
    window.fbAsyncInit = function () {
      try {
        window.FB.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: true, version: 'v21.0' });
        resolve(true);
      } catch (e) { reject(e); }
    };
    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('Falha ao carregar SDK do Facebook'));
      document.body.appendChild(script);
    } else {
      // script já existe mas FB.init ainda não rodou — aguardar
      const check = setInterval(() => {
        if (window.FB) { clearInterval(check); resolve(true); }
      }, 200);
      setTimeout(() => { clearInterval(check); }, 5000);
    }
  });
  return sdkPromise;
};

/**
 * Botão de login com a Meta (Embedded Signup) via SDK FB.login.
 * O SDK é carregado ANTECIPADAMENTE (no mount), assim o clique do usuário
 * dispara window.FB.login() de forma síncrona (necessário para o popup abrir).
 */
export default function LoginMetaOficialButton({ empresaId, onSuccess }) {
  const [sdkPronto, setSdkPronto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erroSdk, setErroSdk] = useState('');
  const sessionInfoRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    carregarSdk()
      .then(() => { if (mounted) setSdkPronto(true); })
      .catch((e) => { if (mounted) setErroSdk(e.message); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const handleMessage = (event) => {
      if (!event.origin.includes('facebook.com')) return;
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

  const iniciarLogin = () => {
    if (!empresaId) {
      toast.error('Empresa não identificada. Recarregue a página e tente novamente.');
      return;
    }
    if (!sdkPronto || !window.FB) {
      toast.error('SDK do Facebook ainda carregando. Aguarde alguns segundos e tente novamente.');
      return;
    }

    setCarregando(true);
    // Chamar FB.login de forma síncrona dentro do gesto do clique — popup opens
    window.FB.login(
      async (response) => {
        try {
          if (response?.authResponse?.code) {
            toast.info('Autorização recebida. Salvando credenciais...');
            const resp = await base44.functions.invoke('metaEmbeddedSignup', {
              action: 'exchange_code',
              empresa_id: empresaId,
              code: response.authResponse.code,
              waba_id: sessionInfoRef.current?.waba_id,
              phone_number_id: sessionInfoRef.current?.phone_number_id,
            });
            if (resp.data?.ok) {
              toast.success(`✅ WhatsApp Oficial conectado${resp.data.display_phone_number ? ': ' + resp.data.display_phone_number : ''}`);
              sessionInfoRef.current = null;
              onSuccess?.();
            } else {
              toast.error('Erro ao salvar credenciais: ' + (resp.data?.error || 'Falha na conexão'));
            }
          } else if (response?.status === 'not_authorized') {
            toast.error('Você não autorizou o app. Pode tentar novamente.');
          } else {
            toast.info('Login cancelado.');
          }
        } catch (e) {
          toast.error('Erro ao processar conexão: ' + e.message);
        } finally {
          setCarregando(false);
        }
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
      {erroSdk ? (
        <p className="text-xs text-red-500 text-center">Erro ao carregar SDK: {erroSdk}</p>
      ) : (
        <p className="text-xs text-slate-500 text-center">
          Ao clicar, abre a janela do Facebook para autorizar a conexão. As credenciais são salvas automaticamente no CRM.
        </p>
      )}
    </div>
  );
}