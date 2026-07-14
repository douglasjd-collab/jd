import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, MessageSquare, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

const APP_ID = '1574136874002258';
const CONFIG_ID = '1355211576800271';

export default function MetaLogin() {
  const [empresaId, setEmpresaId] = useState(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | conectando | sucesso | erro
  const [mensagem, setMensagem] = useState('');
  const sessionInfoRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmpresaId(params.get('empresa_id'));
  }, []);

  // Escutar mensagem do Facebook com sessionInfo (waba_id, phone_number_id)
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

  // Carregar SDK do Facebook
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
  }, []);

  const iniciarLogin = () => {
    if (!sdkReady || !window.FB) {
      setMensagem('O SDK do Facebook ainda está carregando. Aguarde alguns segundos...');
      return;
    }
    if (!empresaId) {
      setStatus('erro');
      setMensagem('Empresa não identificada. Volte para o CRM e tente novamente.');
      return;
    }

    setStatus('conectando');
    setMensagem('Abrindo janela de login da Meta...');

    window.FB.login(
      async (response) => {
        if (response.authResponse && response.authResponse.code) {
          setMensagem('Autorização recebida. Salvando credenciais...');
          try {
            const resp = await base44.functions.invoke('metaEmbeddedSignup', {
              action: 'exchange_code',
              empresa_id: empresaId,
              code: response.authResponse.code,
              waba_id: sessionInfoRef.current?.waba_id,
              phone_number_id: sessionInfoRef.current?.phone_number_id,
            });
            if (resp.data?.ok) {
              setStatus('sucesso');
              setMensagem(`Conectado! ${resp.data.display_phone_number || ''} ${resp.data.verified_name || ''}`.trim());
              // Avisar a janela que abriu esta aba para atualizar
              try {
                window.opener?.postMessage({ type: 'META_LOGIN_SUCESSO', empresa_id: empresaId }, '*');
              } catch (_) {}
            } else {
              setStatus('erro');
              setMensagem('Erro: ' + (resp.data?.error || 'Falha na conexão'));
            }
          } catch (e) {
            setStatus('erro');
            setMensagem('Erro ao processar conexão: ' + e.message);
          }
        } else if (response.status === 'not_authorized') {
          setStatus('erro');
          setMensagem('Você não autorizou o app. Pode fechar esta aba e tentar novamente no CRM.');
        } else {
          setStatus('idle');
          setMensagem('Conexão cancelada. Pode fechar esta aba.');
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-emerald-600" />
          <h1 className="text-lg font-semibold text-slate-800">Login com a Meta — WhatsApp Oficial</h1>
        </div>

        <div className="p-6 space-y-4">
          {/* Painel instrutivo */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-green-900 mb-1">API Oficial do WhatsApp (Meta)</p>
            <p className="text-sm text-green-800">
              Faça login com sua conta Meta Business — as credenciais serão preenchidas automaticamente e salvas no CRM.
            </p>
          </div>

          {status === 'idle' && (
            <>
              <button
                type="button"
                onClick={iniciarLogin}
                disabled={!sdkReady}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-base font-semibold transition-colors"
              >
                {!sdkReady ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Carregando SDK...</>
                ) : (
                  <><MessageSquare className="w-5 h-5" /> Fazer Login com a Meta</>
                )}
              </button>
              <p className="text-xs text-center text-slate-500">
                Uma janela da Meta vai abrir para você autorizar a conexão do seu WhatsApp Business.
              </p>
            </>
          )}

          {status === 'conectando' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-sm font-medium text-slate-700">{mensagem}</p>
              <p className="text-xs text-slate-500 text-center">
                Se a janela não abriu, verifique se o navegador não bloqueou pop-ups para este site.
              </p>
            </div>
          )}

          {status === 'sucesso' && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <p className="text-base font-semibold text-emerald-800">{mensagem}</p>
              <p className="text-sm text-slate-600">Você já pode fechar esta aba e voltar para o CRM.</p>
              <button
                type="button"
                onClick={() => window.close()}
                className="mt-2 px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium"
              >
                Fechar esta aba
              </button>
            </div>
          )}

          {status === 'erro' && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
              <p className="text-sm font-medium text-red-700">{mensagem}</p>
              <button
                type="button"
                onClick={() => { setStatus('idle'); setMensagem(''); }}
                className="mt-2 px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!empresaId && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Empresa não identificada. Abra esta página a partir do CRM (Configurações → WhatsApp).</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}