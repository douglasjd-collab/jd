import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, MessageSquare, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

const APP_ID = '1574136874002258';
const CONFIG_ID = '1355211576800271';
const META_ONBOARD_URL = `https://business.facebook.com/messaging/whatsapp/onboard/?app_id=${APP_ID}&config_id=${CONFIG_ID}`;

export default function MetaLogin() {
  const [empresaId, setEmpresaId] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | processando | sucesso | erro
  const [mensagem, setMensagem] = useState('');
  const processadoRef = useRef(false);

  // Capturar empresa_id da URL (direto ou vindo do redirect da Meta)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmpresaId(params.get('empresa_id') || params.get('state'));

    // Se a Meta redirecionou de volta com ?code=..., trocar o code pelas credenciais
    const code = params.get('code');
    if (code && !processadoRef.current) {
      processadoRef.current = true;
      const empId = params.get('empresa_id') || params.get('state');
      trocarCodePorCredenciais(code, empId);
    }
  }, []);

  const trocarCodePorCredenciais = async (code, empId) => {
    if (!empId) {
      setStatus('erro');
      setMensagem('Empresa não identificada no retorno da Meta. Volte ao CRM e tente novamente.');
      return;
    }
    setStatus('processando');
    setMensagem('Autorização recebida. Salvando credenciais...');
    try {
      const resp = await base44.functions.invoke('metaEmbeddedSignup', {
        action: 'exchange_code',
        empresa_id: empId,
        code,
      });
      if (resp.data?.ok) {
        setStatus('sucesso');
        setMensagem(`Conectado! ${resp.data.display_phone_number || ''} ${resp.data.verified_name || ''}`.trim());
        try { window.opener?.postMessage({ type: 'META_LOGIN_SUCESSO', empresa_id: empId }, '*'); } catch (_) {}
      } else {
        setStatus('erro');
        setMensagem('Erro: ' + (resp.data?.error || 'Falha na conexão'));
      }
    } catch (e) {
      setStatus('erro');
      setMensagem('Erro ao processar conexão: ' + e.message);
    }
  };

  const iniciarLogin = () => {
    if (!empresaId) {
      setStatus('erro');
      setMensagem('Empresa não identificada. Volte para o CRM e tente novamente.');
      return;
    }
    // Navega direto para o fluxo de Embedded Signup da Meta.
    // A Meta redireciona de volta para /meta-login?code=... (com mesma empresa_id no state),
    // e o useEffect acima captura o code e conclui a conexão.
    const redirectUri = `${window.location.origin}/meta-login`;
    const state = empresaId;
    const url = `${META_ONBOARD_URL}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
    setStatus('processando');
    setMensagem('Abrindo o login da Meta...');
    window.location.href = url;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-emerald-600" />
          <h1 className="text-lg font-semibold text-slate-800">Login com a Meta — WhatsApp Oficial</h1>
        </div>

        <div className="p-6 space-y-4">
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
                className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-base font-semibold transition-colors"
              >
                <MessageSquare className="w-5 h-5" /> Fazer Login com a Meta
              </button>
              <p className="text-xs text-center text-slate-500">
                Uma janela da Meta vai abrir para você autorizar a conexão do seu WhatsApp Business.
              </p>
            </>
          )}

          {status === 'processando' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-sm font-medium text-slate-700">{mensagem}</p>
              <p className="text-xs text-slate-500 text-center">
                Aguarde — você será redirecionado de volta automaticamente após autorizar na Meta.
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