import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

const APP_ID = '1574136874002258';
const CONFIG_ID = '1355211576800271';

export default function LoginMetaOficialButton({ empresaId, onSuccess }) {
  const [conectando, setConectando] = useState(false);

  useEffect(() => {
    if (window.FB) return;
    window.fbAsyncInit = function () {
      window.FB.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: true, version: 'v21.0' });
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  const iniciarLogin = () => {
    if (!window.FB) {
      toast.error('SDK do Facebook ainda não carregou. Aguarde alguns segundos e tente novamente.');
      return;
    }
    if (!empresaId) {
      toast.error('Empresa não identificada.');
      return;
    }
    setConectando(true);
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
        setConectando(false);
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
    <Button
      type="button"
      className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold"
      onClick={iniciarLogin}
      disabled={conectando}
    >
      {conectando
        ? <><Loader2 className="w-5 h-5 animate-spin" /> Aguardando autorização...</>
        : <><MessageSquare className="w-5 h-5" /> Fazer Login com a Meta (preenche automaticamente)</>}
    </Button>
  );
}