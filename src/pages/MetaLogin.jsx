import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, MessageSquare, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

/**
 * Página alvo do redirect_uri do Embedded Signup da Meta.
 * Quando a Meta redireciona de volta com ?empresa_id=X&code=Y, esta página
 * processa o código automaticamente: troca pelas credenciais, salva e avisa o CRM.
 * Se aberta direto (sem código), instrui o usuário a iniciar pelo CRM.
 */
export default function MetaLogin() {
  const [status, setStatus] = useState('processando'); // processando | sucesso | erro
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const empresaId = params.get('empresa_id');
      const code = params.get('code');
      const erro = params.get('error') || params.get('error_message');

      if (erro) {
        setStatus('erro');
        setMensagem('A Meta retornou um erro: ' + erro);
        try { window.opener?.postMessage({ type: 'META_LOGIN_ERRO', error: erro }, '*'); } catch (_) {}
        return;
      }

      if (!code) {
        setStatus('erro');
        setMensagem('Esta página deve ser aberta pelo botão "Fazer Login com a Meta" dentro do CRM.');
        return;
      }

      // A Meta às vezes devolve só o `code` e descarta parâmetros custom da
      // redirect_uri (empresa_id). Nesse caso, recupera do usuário logado.
      let empresaFinalId = empresaId;
      if (!empresaFinalId) {
        try {
          const me = await base44.auth.me();
          empresaFinalId = me?.empresa_id || null;
        } catch (_) {}
      }

      if (!empresaFinalId) {
        setStatus('erro');
        setMensagem('Empresa não identificada no retorno. Feche e tente novamente pelo CRM.');
        return;
      }
      const empresaIdFinal = empresaFinalId;

      setMensagem('Conexão autorizada! Salvando credenciais...');
      try {
        const resp = await base44.functions.invoke('metaEmbeddedSignup', {
          action: 'exchange_code',
          empresa_id: empresaIdFinal,
          code,
        });
        if (resp.data?.ok) {
          setStatus('sucesso');
          setMensagem(`${resp.data.display_phone_number || ''} ${resp.data.verified_name || ''}`.trim());
          try { window.opener?.postMessage({ type: 'META_LOGIN_SUCESSO', empresa_id: empresaIdFinal }, '*'); } catch (_) {}
          // Fechar janela automaticamente após 2s
          setTimeout(() => { try { window.close(); } catch (_) {} }, 2000);
        } else {
          setStatus('erro');
          setMensagem('Erro ao salvar credenciais: ' + (resp.data?.error || 'Falha na conexão'));
          try { window.opener?.postMessage({ type: 'META_LOGIN_ERRO', error: resp.data?.error || 'Falha' }, '*'); } catch (_) {}
        }
      } catch (e) {
        setStatus('erro');
        setMensagem('Erro ao processar conexão: ' + e.message);
        try { window.opener?.postMessage({ type: 'META_LOGIN_ERRO', error: e.message }, '*'); } catch (_) {}
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-emerald-600" />
          <h1 className="text-lg font-semibold text-slate-800">Login com a Meta — WhatsApp Oficial</h1>
        </div>

        <div className="p-6 flex flex-col items-center gap-3 py-8 text-center">
          {status === 'processando' && (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-sm font-medium text-slate-700">{mensagem}</p>
            </>
          )}
          {status === 'sucesso' && (
            <>
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <p className="text-base font-semibold text-emerald-800">Conectado com sucesso!</p>
              <p className="text-sm text-slate-600">{mensagem}</p>
              <p className="text-xs text-slate-500">Esta janela vai fechar sozinha. Você já pode voltar ao CRM.</p>
            </>
          )}
          {status === 'erro' && (
            <>
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 text-left">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{mensagem}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}