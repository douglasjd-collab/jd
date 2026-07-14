import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

const APP_ID = '1574136874002258';
const CONFIG_ID = '1355211576800271';

/**
 * Botão que abre DIRETAMENTE um POPUP com a URL do onboarding da Meta.
 * Após o login e a conexão do WhatsApp, a Meta redireciona o popup de volta
 * para /meta-login?empresa_id=X&code=Y. Aqui detectamos essa URL e trocamos o
 * code pelas credenciais (via função metaEmbeddedSignup), salvando no CRM.
 */
export default function LoginMetaOficialButton({ empresaId, onSuccess }) {
  const [carregando, setCarregando] = useState(false);
  const pollRef = useRef(null);

  React.useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const abrirPopup = () => {
    if (!empresaId) {
      toast.error('Empresa não identificada. Recarregue a página e tente novamente.');
      return;
    }

    setCarregando(true);
    const redirectUri = `${window.location.origin}/meta-login?empresa_id=${empresaId}`;
    const metaUrl = `https://business.facebook.com/messaging/whatsapp/onboard/?app_id=${APP_ID}&config_id=${CONFIG_ID}&redirect_uri=${encodeURIComponent(redirectUri)}`;

    const popup = window.open(metaUrl, 'meta_login_popup', 'width=520,height=720,scrollbars=yes');

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      setCarregando(false);
      toast.error('O navegador bloqueou o pop-up. Autorize pop-ups para este site e tente novamente.');
      return;
    }
    popup.focus();

    // Monitorar o popup: quando a Meta redirecionar para nossa origem, parsear ?code=
    let finalizado = false;
    pollRef.current = setInterval(async () => {
      try {
        if (popup.closed) {
          if (!finalizado) {
            clearInterval(pollRef.current);
            setCarregando(false);
            toast.info('Janela de login fechada. Se você não concluiu, tente novamente.');
            pollRef.current = null;
          }
          return;
        }
        let href = '';
        try { href = popup.location.href; } catch (_) { /* cross-origin até redirecionar pra gente */ }

        if (href && href.startsWith(window.location.origin)) {
          finalizado = true;
          clearInterval(pollRef.current);
          pollRef.current = null;
          setCarregando(false);
          const params = new URLSearchParams(popup.location.search);
          const code = params.get('code');
          const estado = params.get('state');
          try { popup.close(); } catch (_) {}
          if (code) {
            toast.info('Conexão autorizada! Salvando credenciais...');
            // /meta-login também processa, mas garantimos aqui
            try {
              const resp = await base44.functions.invoke('metaEmbeddedSignup', {
                action: 'exchange_code',
                empresa_id: empresaId,
                code,
              });
              if (resp.data?.ok) {
                toast.success(`✅ WhatsApp Oficial conectado${resp.data.display_phone_number ? ': ' + resp.data.display_phone_number : ''}`);
                onSuccess?.();
              } else {
                toast.error('Erro ao salvar credenciais: ' + (resp.data?.error || 'Falha na conexão'));
              }
            } catch (e) {
              toast.error('Erro ao processar conexão: ' + e.message);
            }
          } else {
            toast.error('A Meta não retornou o código de autorização. Verifique no painel da Meta se a URL de redirecionamento está cadastrada: ' + redirectUri);
          }
        }
      } catch (_) {
        // ignora erros de cross-origin durante o fluxo
      }
    }, 800);
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800 text-white h-12 text-base font-semibold"
        onClick={abrirPopup}
        disabled={carregando}
      >
        {carregando ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Conectando...</>
        ) : (
          <> <MessageSquare className="w-5 h-5" /> Fazer Login com a Meta<ExternalLink className="w-4 h-4 ml-1" /></>
        )}
      </Button>
      <p className="text-xs text-slate-500 text-center">
        Ao clicar, abre uma janela da Meta para autorizar a conexão do seu WhatsApp Business. Ao concluir, a janela volta automaticamente para o CRM e salva as credenciais.
      </p>
    </div>
  );
}