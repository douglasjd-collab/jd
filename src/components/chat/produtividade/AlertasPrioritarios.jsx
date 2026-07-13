import React, { useMemo } from 'react';

// Seção "Atenção necessária" — combina as urgências mais relevantes do período atual em uma lista clicável.
export default function AlertasPrioritarios({ aguardandoVendedor, naoFinalizadas, semResponsavel, deramVacuo, onAbrirConversa }) {
  const alertas = useMemo(() => {
    const lista = [];
    aguardandoVendedor.filter(c => (c.tempoEsperaMin || 0) > 30).forEach(c => {
      lista.push({ id: c.id, gravidade: 'alta', texto: `${c.cliente_nome || c.cliente_telefone} aguardando resposta há ${c.tempoEsperaMin} min` });
    });
    naoFinalizadas.filter(c => c.data_ultima_mensagem && (new Date() - new Date(c.data_ultima_mensagem)) / 3600000 > 24).forEach(c => {
      lista.push({ id: c.id, gravidade: 'media', texto: `Conversa com ${c.cliente_nome || c.cliente_telefone} aberta há mais de 24h` });
    });
    semResponsavel.forEach(c => {
      lista.push({ id: c.id, gravidade: 'alta', texto: `${c.cliente_nome || c.cliente_telefone} sem responsável atribuído` });
    });
    deramVacuo.forEach(c => {
      lista.push({ id: c.id, gravidade: 'media', texto: `${c.cliente_nome || c.cliente_telefone} deu vácuo (sem responder há ${c.tempoEsperaMin} min)` });
    });
    return lista.slice(0, 12);
  }, [aguardandoVendedor, naoFinalizadas, semResponsavel, deramVacuo]);

  if (alertas.length === 0) return null;

  return (
    <div className="rounded-xl p-5" style={{ background: '#161d28', border: '1px solid #1e2a38' }}>
      <h3 className="text-sm font-bold mb-3">🚨 Atenção necessária</h3>
      <div className="space-y-2">
        {alertas.map((a, i) => (
          <button
            key={`${a.id}-${i}`}
            onClick={() => onAbrirConversa(a.id)}
            className="w-full flex items-center gap-3 rounded-lg px-4 py-2.5 text-left"
            style={{ background: a.gravidade === 'alta' ? 'rgba(239,68,68,.08)' : 'rgba(245,166,35,.08)', border: `1px solid ${a.gravidade === 'alta' ? 'rgba(239,68,68,.2)' : 'rgba(245,166,35,.2)'}` }}
          >
            <span className="text-sm flex-1" style={{ color: '#e2eaf4' }}>{a.texto}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0" style={{ background: a.gravidade === 'alta' ? 'rgba(239,68,68,.15)' : 'rgba(245,166,35,.15)', color: a.gravidade === 'alta' ? '#ef4444' : '#f5a623' }}>
              {a.gravidade === 'alta' ? 'URGENTE' : 'ATENÇÃO'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}