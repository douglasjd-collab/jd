import React, { useState } from 'react';
import { Settings, Link as LinkIcon } from 'lucide-react';
import LoginMetaOficialButton from '@/components/configuracoes/LoginMetaOficialButton';
import ConfiguracaoWhatsAppConexoes from '@/components/configuracoes/ConfiguracaoWhatsAppConexoes';

export default function CredenciaisWhatsApp({ empresaId }) {
  const [aba, setAba] = useState('meta');

  return (
    <div className="space-y-4">
      {/* Cabeçalho da seção */}
      <div className="flex items-center gap-2">
        <Settings className="w-4 h-4 text-slate-600" />
        <h2 className="text-base font-bold text-slate-900">Credenciais WhatsApp</h2>
      </div>

      {/* Navegação de abas */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setAba('meta')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            aba === 'meta'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Meta Oficial
        </button>
        <button
          onClick={() => setAba('conexoes')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            aba === 'conexoes'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <LinkIcon className="w-3.5 h-3.5" />
          Conexões
        </button>
      </div>

      {/* Conteúdo da aba Meta Oficial */}
      {aba === 'meta' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-4">
          <div className="flex items-start gap-3">
            <span className="mt-1 w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-slate-900">
                API Oficial do WhatsApp (Meta)
              </p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Faça login com sua conta Meta Business — as credenciais abaixo são preenchidas
                automaticamente, sem precisar copiar nada manualmente.
              </p>
            </div>
          </div>

          <LoginMetaOficialButton empresaId={empresaId} onSuccess={() => {}} />
        </div>
      )}

      {/* Conteúdo da aba Conexões */}
      {aba === 'conexoes' && (
        <div className="rounded-xl border bg-white p-2">
          <ConfiguracaoWhatsAppConexoes />
        </div>
      )}
    </div>
  );
}