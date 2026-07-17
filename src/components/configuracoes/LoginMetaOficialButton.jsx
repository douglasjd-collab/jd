import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const APP_ID = '1574136874002258';
const CONFIG_ID = '1355211576800271';

/**
 * Botão de login com a Meta (Embedded Signup) via janela direta da Meta — URL
 * oficial de onboarding do WhatsApp Business. Mais confiável que window.FB.login
 * (que em muitos ambientes tem o popup bloqueado/interrompido, ficando travado em
 * "Conectando..."). Ao concluir, a Meta redireciona de volta para /meta-login
 * (página MetaLogin) que processa o código, salva as credenciais e envia um
 * postMessage { type: 'META_LOGIN_SUCESSO' } para esta janela do CRM.
 */
export default function LoginMetaOficialButton({ empresaId, onSuccess }) {
  const [carregando, setCarregando] = useState(false);
  const popupRef = useRef(null);
  const closedTimerRef = useRef(null);

  // Cancela o polling e limpa ref do popup
  const limparPopupWatch = () => {
    if (closedTimerRef.current) {
      clearInterval(closedTimerRef.current);
      closedTimerRef.current = null;
    }
    popupRef.current = null;
  };

  useEffect(() => {
    const handleMessage = (event) => {
      // Aceitar apenas mensagens da nossa própria origem (página /meta-login)
      if (!event.origin || event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'META_LOGIN_SUCESSO') {
        setCarregando(false);
        limparPopupWatch();
        try { popupRef.current?.close(); } catch (_) {}
        toast.success(`✅ WhatsApp Oficial conectado! Agora clique em "Salvar" para registrar a conexão.`);
        onSuccess?.();
      } else if (data.type === 'META_LOGIN_ERRO') {
        setCarregando(false);
        limparPopupWatch();
        toast.error('Erro ao salvar credenciais: ' + (data.error || 'Falha na conexão'));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      limparPopupWatch();
    };
  }, [onSuccess]);

  const iniciarLogin = () => {
    if (!empresaId) {
      toast.error('Empresa não identificada. Recarregue a página e tente novamente.');
      return;
    }

    // URL oficial do Embedded Signup da Meta (mesma que aparece no onboarding).
    const redirectUri = `${window.location.origin}/meta-login?empresa_id=${empresaId}`;
    const url =
      `https://business.facebook.com/messaging/whatsapp/onboard/` +
      `?app_id=${APP_ID}` +
      `&config_id=${CONFIG_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;

    setCarregando(true);

    // Tentativa 1: abrir como popup. Se o navegador bloquear (retornar null),
    // fazemos fallback redirecionando a própria aba — garante que a janela da
    // Meta sempre abra.
    let popup = null;
    try {
      popup = window.open(url, 'meta_embedded_signup',
        'noopener=no,width=620,height=750,scrollbars=yes,toolbar=no,menubar=no');
    } catch (_) {
      popup = null;
    }

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      toast.info('Abrindo a página da Meta nesta aba. Após autorizar, você voltará automaticamente ao CRM.');
      limparPopupWatch();
      setCarregando(false);
      window.location.href = url;
      return;
    }

    popupRef.current = popup;
    popup.focus?.();

    // Monitora se o usuário fecha o popup sem concluir — só reseta o estado,
    // sem erro (cancelamento manual).
    closedTimerRef.current = setInterval(() => {
      const p = popupRef.current;
      if (!p || p.closed) {
        setCarregando(false);
        limparPopupWatch();
      }
    }, 600);
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800 text-white h-12 text-base font-semibold"
        onClick={iniciarLogin}
        disabled={carregando}
      >
        {carregando ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Conectando...</>
        ) : (
          <><MessageSquare className="w-5 h-5" /> Fazer Login com a Meta</>
        )}
      </Button>
      <p className="text-xs text-slate-500 text-center">
        Ao clicar, abre a janela do Facebook para autorizar a conexão. As credenciais são salvas automaticamente no CRM.
      </p>
    </div>
  );
}