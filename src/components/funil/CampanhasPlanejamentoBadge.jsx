import React from 'react';

const CAMPANHAS = [
  { num: 1, label: 'C1', dias: '15d', descricao: 'Campanha 1 — Vídeo explicativo (15 dias)' },
  { num: 2, label: 'C2', dias: '30d', descricao: 'Campanha 2 — Vantagens (30 dias)' },
  { num: 3, label: 'C3', dias: '45d', descricao: 'Campanha 3 — Conteúdo de planejamento (45 dias)' },
  { num: 4, label: 'C4', dias: '60d', descricao: 'Campanha 4 — Oferta de fechamento (60 dias)' },
];

export default function CampanhasPlanejamentoBadge({ ultimaCampanha = 0, dataEntrada = null, compact = false }) {
  const agora = new Date();

  const getStatus = (num) => {
    if (ultimaCampanha >= num) return 'enviada';
    if (!dataEntrada) return 'aguardando';
    const diasNoPlano = Math.floor((agora - new Date(dataEntrada)) / (1000 * 60 * 60 * 24));
    const diasNecessarios = num * 15;
    if (diasNoPlano >= diasNecessarios) return 'pronta';
    return 'aguardando';
  };

  if (compact) {
    // Versão compacta: só bolinhas
    return (
      <div className="flex items-center gap-1">
        {CAMPANHAS.map(c => {
          const status = getStatus(c.num);
          return (
            <div
              key={c.num}
              title={c.descricao + (status === 'enviada' ? ' ✓ Enviada' : status === 'pronta' ? ' ⏳ Pronta p/ envio' : ' 🔒 Aguardando')}
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                status === 'enviada'
                  ? 'bg-emerald-500 border-emerald-600'
                  : status === 'pronta'
                  ? 'bg-amber-400 border-amber-500 animate-pulse'
                  : 'bg-slate-100 border-slate-300'
              }`}
            >
              {status === 'enviada' && (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Versão expandida: bolinhas com label e linha conectora
  return (
    <div className="flex items-center gap-1">
      {CAMPANHAS.map((c, idx) => {
        const status = getStatus(c.num);
        return (
          <React.Fragment key={c.num}>
            <div className="flex flex-col items-center gap-0.5" title={c.descricao}>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[9px] font-bold transition-all ${
                status === 'enviada'
                  ? 'bg-emerald-500 border-emerald-600 text-white'
                  : status === 'pronta'
                  ? 'bg-amber-400 border-amber-500 text-white animate-pulse'
                  : 'bg-slate-100 border-slate-300 text-slate-400'
              }`}>
                {status === 'enviada' ? '✓' : c.num}
              </div>
              <span className={`text-[9px] font-medium ${
                status === 'enviada' ? 'text-emerald-600' : status === 'pronta' ? 'text-amber-500' : 'text-slate-400'
              }`}>
                {c.dias}
              </span>
            </div>
            {idx < CAMPANHAS.length - 1 && (
              <div className={`h-0.5 w-3 mb-3 ${ultimaCampanha > idx ? 'bg-emerald-400' : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}