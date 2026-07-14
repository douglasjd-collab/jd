import React from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Botão de login com a Meta (Embedded Signup).
 *
 * O fluxo de Embedded Signup usa window.FB.login(), que abre um POP-UP.
 * Em navegadores modernos, pop-ups são frequentemente bloqueados quando a
 * chamada parte de dentro de um iframe (preview do Base44) ou em situações
 * onde o gesto do usuário não é reconhecido como direto. Para zerar esses
 * bloqueios, este botão SEMPRE abre uma página dedicada (/meta-login) em
 * uma NOVA ABA. Numa aba de NÍVEL TOPO do navegador, pop-ups nunca são
 * bloqueados. A nova aba faz todo o fluxo FB.login → troca de código →
 * salvar credenciais, e avisa esta janela via postMessage quando dá certo.
 */
export default function LoginMetaOficialButton({ empresaId, onSuccess }) {
  const abrirNovaAba = () => {
    if (!empresaId) {
      toast.error('Empresa não identificada. Recarregue a página e tente novamente.');
      return;
    }
    const url = `${window.location.origin}/meta-login?empresa_id=${empresaId}`;
    const novaAba = window.open(url, '_blank');
    if (!novaAba) {
      toast.error('O navegador bloqueou a abertura da nova aba. Permita pop-ups para este site e tente novamente.');
      return;
    }
    novaAba.focus();
    toast.info('Abrimos uma nova aba para o login com a Meta. Conclua lá e volte para o CRM.');
  };

  React.useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'META_LOGIN_SUCESSO') {
        toast.success('✅ WhatsApp Oficial conectado com sucesso!');
        onSuccess?.();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSuccess]);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800 text-white h-12 text-base font-semibold"
        onClick={abrirNovaAba}
      >
        <MessageSquare className="w-5 h-5" /> Fazer Login com a Meta (abre em nova aba)
        <ExternalLink className="w-4 h-4 ml-1" />
      </Button>
      <p className="text-xs text-slate-500 text-center">
        O CRM abre uma aba separada para o login da Meta — assim o navegador nunca bloqueia o pop-up de autorização.
      </p>
    </div>
  );
}