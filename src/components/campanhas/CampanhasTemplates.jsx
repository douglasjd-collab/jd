import React from 'react';
import TemplateManagerContent from '@/components/templates/TemplateManagerContent';

/**
 * Versão embedded do gerenciador de Templates, usada na aba "Templates"
 * do módulo Campanhas. Renderiza o mesmo conteúdo que antes ficava no sheet
 * do Bate-Papo — criação/edição/sincronização/exclusão de templates da API
 * Oficial continuam funcionando da mesma forma.
 */
export default function CampanhasTemplates({ empresaId, user }) {
  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
      <TemplateManagerContent
        empresaId={empresaId}
        user={user}
        defaultTab="meus"
      />
    </div>
  );
}