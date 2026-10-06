import React from 'react';

// Usa a mesma página e o mesmo gate de autenticação do CRM.
// Somente o modo explícito da extensão remove a navegação geral.
export default function CompactChatShell({ children }) {
  return (
    <div className="jd-compact-chat">
      <style>{`
        .jd-compact-chat { width: 100%; height: 100dvh; overflow: hidden; }
        .jd-compact-chat #batepapo-root {
          top: 0 !important; left: 0 !important; right: 0 !important;
          bottom: 0 !important; width: 100% !important;
          height: 100dvh !important; padding: 0 !important;
        }
      `}</style>
      {children}
    </div>
  );
}
