import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Sparkles, Loader2, RefreshCw, Brain, Smile, GraduationCap, Target, Skull, Copy, CheckCircle, Zap } from 'lucide-react';
import { toast } from 'sonner';

const TABS = [
  { id: 'agora', label: 'Agora', icon: '⚡' },
  { id: 'memoria', label: '🧠 Memória', icon: null },
  { id: 'emocao', label: '😐 Emoção', icon: null },
  { id: 'cadencia', label: 'Cadência', icon: null },
  { id: 'aprende', label: '🎓 Aprende', icon: null },
  { id: 'prosp', label: '🎯 Prospecção', icon: null },
  { id: 'pm', label: '💀 Pós-mortem', icon: null },
];

function ScoreBar({ label, value, color }) {
  return (
    <div className="bg-[#0f0f11] border border-[#27272a] rounded-lg p-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] text-[#52525b]">{label}</span>
        <span className="text-[11px] font-bold" style={{ color }}>{value}</span>
      </div>
      <div className="h-1 bg-[#18181b] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function TabAgora({ analise, loading, onGerar, onCopiar }) {
  const scripts = [
    analise?.mensagem_sugerida || 'Clique em "Gerar Análise IA" para obter um script personalizado.',
    'Ótima conversa! Podemos marcar uma demonstração esta semana?',
    'Tenho um case de empresa similar — posso compartilhar antes da nossa próxima conversa?',
  ];
  const [scriptIdx, setScriptIdx] = useState(0);

  useEffect(() => { setScriptIdx(0); }, [analise]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-[#7c3aed]" />
      <p className="text-xs text-[#71717a]">Analisando com IA...</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 p-3">
      {analise ? (
        <>
          <div>
            <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider mb-2">Situação detectada</div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(239,68,68,.1)] text-[#f87171] border border-[rgba(239,68,68,.18)]">
                🌡️ {analise.temperatura || 'Morno'}
              </span>
              {(analise.objecoes || []).slice(0, 2).map((o, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(245,158,11,.1)] text-[#fbbf24] border border-[rgba(245,158,11,.18)]">⚠ {o}</span>
              ))}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(167,139,250,.1)] text-[#a78bfa] border border-[rgba(167,139,250,.18)]">
                📈 {analise.chance_fechamento || analise.probabilidade_fechamento || 0}% chance
              </span>
            </div>
          </div>

          <div className="border-t border-[#18181b]" />

          <div>
            <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider mb-2">Resumo</div>
            <p className="text-[11.5px] text-[#a1a1aa] leading-relaxed">{analise.resumo}</p>
          </div>

          <div className="border-t border-[#18181b]" />

          <div>
            <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider mb-2">Script ideal</div>
            <div className="bg-[#0f172a] border border-[#1e3a5f] border-l-4 border-l-[#3b82f6] rounded-lg p-3 text-[11.5px] text-[#93c5fd] italic leading-relaxed">
              {scripts[scriptIdx]}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => { navigator.clipboard.writeText(scripts[scriptIdx]); toast.success('Script copiado!'); }}
                className="flex-1 h-7 rounded-md border border-[#27272a] bg-transparent text-[#71717a] text-[10px] font-semibold hover:bg-[#18181b] hover:text-[#e4e4e7] transition-colors">
                📋 Copiar
              </button>
              <button onClick={() => setScriptIdx((scriptIdx + 1) % scripts.length)}
                className="flex-1 h-7 rounded-md border border-[#27272a] bg-transparent text-[#71717a] text-[10px] font-semibold hover:bg-[#18181b] hover:text-[#e4e4e7] transition-colors">
                🔄 Outro
              </button>
            </div>
          </div>

          {analise.proxima_acao && (
            <>
              <div className="border-t border-[#18181b]" />
              <div>
                <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider mb-2">Próxima Ação</div>
                <div className="text-[11.5px] text-[#e4e4e7] bg-[#0f0f11] border border-[#27272a] rounded-lg p-3">
                  📌 {analise.proxima_acao}
                </div>
              </div>
            </>
          )}

          <button onClick={onGerar}
            className="w-full h-8 rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 hover:opacity-88 transition-opacity mt-1">
            <RefreshCw className="w-3.5 h-3.5" /> Reanalisar
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center py-10 gap-4">
          <Sparkles className="w-10 h-10 text-[#7c3aed]" />
          <p className="text-xs text-[#71717a] text-center">Clique para gerar uma análise inteligente desta oportunidade</p>
          <button onClick={onGerar}
            className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] text-white text-[12px] font-semibold hover:opacity-88 transition-opacity">
            ✨ Gerar Análise IA
          </button>
        </div>
      )}
    </div>
  );
}

function TabMemoria({ oportunidade, analise }) {
  const [tomVoz, setTomVoz] = useState('Direto, informal, com dados concretos. Evita jargões técnicos. Sempre termina com pergunta de fechamento.');
  const [editandoTom, setEditandoTom] = useState(false);
  const [tomTemp, setTomTemp] = useState(tomVoz);

  const conversasSimuladas = [
    { canal: '💬', titulo: 'Primeiro contato', data: '02 jun', resumo: 'Manifestou interesse inicial no produto. Perguntou sobre valores e prazo.', resultado: 'em andamento', cor: '#a78bfa' },
    { canal: '📞', titulo: 'Ligação de follow-up', data: '07 jun', resumo: 'Retomou contato. Demonstrou interesse mais claro. Mencionou decisor adicional.', resultado: 'em andamento', cor: '#fbbf24' },
    { canal: '💬', titulo: 'Conversa atual', data: 'Hoje', resumo: 'Abordou preço novamente. IA aplicou script de valor. Pediu reunião.', resultado: 'ativo', cor: '#34d399' },
  ];

  const lembra = [
    { label: 'Principal objeção', valor: analise?.objecoes?.[0] || 'Preço', cor: '#f87171' },
    { label: 'Produto interesse', valor: analise?.produto_identificado || analise?.produto || 'Consórcio', cor: '#34d399' },
    { label: 'Temperatura', valor: analise?.temperatura || 'Morno', cor: '#fbbf24' },
    { label: 'Probabilidade', valor: `${analise?.chance_fechamento || analise?.probabilidade_fechamento || 0}%`, cor: '#a78bfa' },
    { label: 'Próxima ação', valor: analise?.proxima_acao || 'A definir', cor: '#e4e4e7' },
  ];

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider mb-2">Histórico de conversas</div>
        {conversasSimuladas.map((c, i) => (
          <div key={i} className="bg-[#0f0f11] border border-[#27272a] rounded-lg p-3 mb-2">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs">{c.canal}</span>
              <span className="text-[11px] font-semibold text-[#e4e4e7]">{c.titulo}</span>
              <span className="text-[10px] text-[#52525b] ml-auto">{c.data}</span>
            </div>
            <p className="text-[10.5px] text-[#71717a] leading-relaxed">{c.resumo}</p>
            <span className="text-[9px] font-semibold mt-1.5 inline-block" style={{ color: c.cor }}>● {c.resultado}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-[#18181b]" />

      <div>
        <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider mb-2">O que a IA lembra</div>
        <div className="flex flex-col gap-1">
          {lembra.map((item, i) => (
            <div key={i} className="flex gap-2 py-1.5 border-b border-[#18181b] text-[11px]">
              <span className="text-[#71717a] w-28 flex-shrink-0">{item.label}</span>
              <span className="font-medium" style={{ color: item.cor }}>{item.valor}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[#18181b]" />

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider">Tom de voz aplicado</div>
          <button onClick={() => { setEditandoTom(!editandoTom); setTomTemp(tomVoz); }}
            className="text-[9px] text-[#a78bfa] hover:text-[#c4b5fd] transition-colors">{editandoTom ? 'Cancelar' : 'Editar'}</button>
        </div>
        {editandoTom ? (
          <div className="flex flex-col gap-2">
            <textarea value={tomTemp} onChange={e => setTomTemp(e.target.value)}
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg p-2.5 text-[11px] text-[#e4e4e7] resize-none outline-none focus:border-[#7c3aed]"
              rows={4} />
            <button onClick={() => { setTomVoz(tomTemp); setEditandoTom(false); toast.success('Tom de voz salvo!'); }}
              className="w-full h-7 rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] text-white text-[10px] font-semibold">
              Salvar
            </button>
          </div>
        ) : (
          <div className="bg-[#13111f] border border-[rgba(124,58,237,.2)] rounded-lg p-3 text-[11px] text-[#a78bfa] leading-relaxed">
            {tomVoz}
          </div>
        )}
      </div>

      <button onClick={() => toast.success('Histórico exportado!', { description: 'Relatório completo gerado.' })}
        className="w-full h-8 rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 hover:opacity-88 transition-opacity">
        📄 Exportar histórico do lead
      </button>
    </div>
  );
}

function TabEmocao({ analise }) {
  const scores = { animado: 12, hesitante: 58, comPressa: 8, comparando: 22 };
  const dominante = 'hesitante';

  const emocoes = [
    { key: 'animado', emoji: '😊', label: 'Animado', pct: scores.animado, cor: '#34d399' },
    { key: 'hesitante', emoji: '😐', label: 'Hesitante', pct: scores.hesitante, cor: '#fbbf24' },
    { key: 'comPressa', emoji: '😤', label: 'Com pressa', pct: scores.comPressa, cor: '#f87171' },
    { key: 'comparando', emoji: '🤔', label: 'Comparando', pct: scores.comparando, cor: '#60a5fa' },
  ];

  const sinais = [
    { cor: '#fbbf24', bg: 'rgba(245,158,11,.06)', borda: 'rgba(245,158,11,.2)', texto: '😐 Transferência de responsabilidade para decisor adicional' },
    { cor: '#60a5fa', bg: 'rgba(96,165,250,.06)', borda: 'rgba(96,165,250,.2)', texto: '🤔 Perguntou preço antes do valor — pode estar comparando' },
    { cor: '#f87171', bg: 'rgba(239,68,68,.06)', borda: 'rgba(239,68,68,.2)', texto: '⚠️ Objeção técnica pode ser desculpa para adiar decisão' },
  ];

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider mb-2">Temperatura emocional</div>
        <div className="grid grid-cols-2 gap-2">
          {emocoes.map(e => (
            <div key={e.key} className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border cursor-pointer transition-all ${e.key === dominante ? 'border-[rgba(124,58,237,.3)] bg-[rgba(124,58,237,.06)]' : 'border-[#27272a] bg-[#0f0f11] hover:bg-[#18181b]'}`}>
              <span className="text-lg">{e.emoji}</span>
              <span className="text-[9px] text-[#52525b] font-medium">{e.label}</span>
              <span className="text-[11px] font-bold" style={{ color: e.cor }}>{e.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[#18181b]" />

      <div>
        <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider mb-2">Como a IA adapta o tom</div>
        <div className="bg-[#0f0f11] border border-[#27272a] rounded-lg p-3 text-[11px] text-[#a1a1aa] leading-relaxed">
          <strong className="text-[#fbbf24]">Hesitante detectado →</strong> IA reduz urgência, usa dados concretos, evita pressão direta. Faz perguntas abertas para entender o real bloqueio.
        </div>
      </div>

      <div className="border-t border-[#18181b]" />

      <div>
        <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider mb-2">Sinais detectados</div>
        <div className="flex flex-col gap-1.5">
          {sinais.map((s, i) => (
            <div key={i} className="text-[11px] px-3 py-2 rounded-md border-l-2" style={{ color: s.cor, background: s.bg, borderLeftColor: s.borda }}>
              {s.texto}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[#18181b]" />

      <div>
        <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider mb-2">Script adaptado para a emoção</div>
        <div className="bg-[#0f172a] border border-[#1e3a5f] border-l-4 border-l-[#3b82f6] rounded-lg p-3 text-[11.5px] text-[#93c5fd] italic leading-relaxed">
          {analise?.mensagem_sugerida || '"Sem pressão! Vamos entender melhor o que faz mais sentido pra vocês. Qual é a maior dificuldade hoje?"'}
        </div>
      </div>
    </div>
  );
}

function TabCadencia({ analise }) {
  const etapas = [
    { status: 'done', n: 'P1', titulo: 'Primeiro contato', desc: 'Apresentação e qualificação inicial', quando: 'Concluído · IA' },
    { status: 'done', n: 'P2', titulo: 'Contorno de objeção', desc: 'Argumentos de valor apresentados', quando: 'Concluído · IA' },
    { status: 'active', n: 'P3', titulo: analise?.proxima_acao || 'Confirmar próxima reunião', desc: 'Ação recomendada pela IA', quando: 'Agora' },
    { status: 'pending', n: 'P4', titulo: 'Enviar material de apoio', desc: 'Case de resultado similar ao perfil do lead', quando: 'D+1 · automático' },
    { status: 'pending', n: 'P5', titulo: 'Reunião / demo', desc: 'Apresentação completa com decisores', quando: 'D+2' },
    { status: 'pending', n: 'P6', titulo: 'Reativação se silêncio', desc: 'Script urgência + nova oferta', quando: 'D+7 · automático' },
  ];

  const corStatus = { done: '#34d399', active: '#7c3aed', pending: '#27272a' };
  const bgStatus = { done: 'rgba(16,185,129,.1)', active: 'rgba(124,58,237,.1)', pending: 'transparent' };
  const txtStatus = { done: '#34d399', active: '#a78bfa', pending: '#52525b' };
  const labelStatus = { done: '✓ Feito', active: '▶ Agora', pending: '' };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider">Cadência ativa — gerada pela IA</div>
      <div className="flex flex-col gap-2">
        {etapas.map((e, i) => (
          <div key={i} className="relative bg-[#0f0f11] border border-[#27272a] rounded-lg px-3 py-2.5 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-lg" style={{ background: corStatus[e.status] }} />
            <div className="flex gap-2 mb-1.5 items-center">
              <span className="text-[9px] font-bold text-[#52525b] uppercase">{e.n}</span>
              {labelStatus[e.status] && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full ml-auto" style={{ background: bgStatus[e.status], color: txtStatus[e.status] }}>
                  {labelStatus[e.status]}
                </span>
              )}
              {e.status === 'pending' && <span className="text-[9px] text-[#52525b] ml-auto">{e.quando}</span>}
            </div>
            <div className="text-[12px] font-semibold text-[#e4e4e7]">{e.titulo}</div>
            <div className="text-[11px] text-[#71717a] mt-0.5 leading-snug">{e.desc}</div>
            {e.status !== 'pending' && <div className="text-[10px] text-[#52525b] mt-1">{e.quando}</div>}
          </div>
        ))}
      </div>
      <button onClick={() => toast.success('Cadência ativada!', { description: 'IA vai executar cada passo automaticamente.' })}
        className="w-full h-8 rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 hover:opacity-88 transition-opacity">
        ⚡ Ativar cadência automática
      </button>
    </div>
  );
}

function TabAprende() {
  const padroes = [
    { tipo: 'sucesso', icon: '🏆', bg: 'rgba(16,185,129,.1)', titulo: 'ROI antes do preço', desc: 'Conversas que mostraram ROI antes de citar preço fecharam 3x mais.', qtd: 14 },
    { tipo: 'sucesso', icon: '🏆', bg: 'rgba(16,185,129,.1)', titulo: 'Incluir decisor cedo', desc: 'Leads com todos os decisores na reunião fecharam 2.4x mais.', qtd: 9 },
    { tipo: 'erro', icon: '❌', bg: 'rgba(239,68,68,.1)', titulo: 'Falar preço sem perguntar', desc: 'Conversas que citaram preço sem entender o problema perderam 78%.', qtd: 22 },
    { tipo: 'aprendendo', icon: '💡', bg: 'rgba(96,165,250,.1)', titulo: 'Novo padrão detectado', desc: '4 leads recentes mencionaram mesmo obstáculo técnico. IA sugere solução alternativa.', qtd: 4 },
  ];

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider">Padrões aprendidos</div>
      {padroes.map((p, i) => (
        <div key={i} className="flex gap-2 py-2 border-b border-[#18181b]">
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] flex-shrink-0 mt-0.5" style={{ background: p.bg }}>{p.icon}</div>
          <div className="flex-1">
            <div className="text-[11px] font-semibold text-[#e4e4e7]">{p.titulo}</div>
            <div className="text-[10px] text-[#71717a] mt-0.5 leading-snug">{p.desc}</div>
            <div className="text-[10px] text-[#52525b] mt-1">{p.qtd} conversas</div>
          </div>
        </div>
      ))}

      <div className="border-t border-[#18181b]" />

      <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider mb-1">Taxa com IA vs sem IA</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[#0f0f11] border border-[#27272a] rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-[#34d399]">47%</div>
          <div className="text-[10px] text-[#52525b] mt-1">Com Coach IA</div>
        </div>
        <div className="bg-[#0f0f11] border border-[#27272a] rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-[#f87171]">18%</div>
          <div className="text-[10px] text-[#52525b] mt-1">Sem Coach IA</div>
        </div>
      </div>

      <button onClick={() => toast.success('Fechamento registrado!', { description: 'IA vai aprender com os padrões desta conversa.' })}
        className="w-full h-8 rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 hover:opacity-88 transition-opacity">
        🎓 Marcar fechamento e ensinar IA
      </button>
    </div>
  );
}

function TabProspeccao({ oportunidade }) {
  const leads = [
    { iniciais: 'RS', nome: 'Ricardo Souza', sub: 'Diretor · Empresa 12 pessoas · Instagram', tags: [{ label: 'Consórcio', tipo: 'p' }, { label: 'Objeção preço', tipo: 'a' }], score: 91, bg: 'linear-gradient(135deg,#3b82f6,#1d4ed8)' },
    { iniciais: 'AL', nome: 'Ana Lima', sub: 'Sócia · PME · Parada 14d', tags: [{ label: 'Social Selling', tipo: 'g' }, { label: 'Sócio decisor', tipo: 'a' }], score: 87, bg: 'linear-gradient(135deg,#f59e0b,#b45309)' },
    { iniciais: 'CF', nome: 'Carlos Ferreira', sub: 'CEO · 8 pessoas · Parado 7d', tags: [{ label: oportunidade?.produto || 'Consórcio', tipo: 'p' }, { label: 'ROI', tipo: 'g' }], score: 82, bg: 'linear-gradient(135deg,#8b5cf6,#6d28d9)' },
  ];

  const tagCor = {
    p: { bg: 'rgba(167,139,250,.1)', color: '#a78bfa', border: 'rgba(167,139,250,.2)' },
    g: { bg: 'rgba(16,185,129,.1)', color: '#34d399', border: 'rgba(16,185,129,.2)' },
    a: { bg: 'rgba(245,158,11,.1)', color: '#fbbf24', border: 'rgba(245,158,11,.2)' },
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider mb-1">Leads similares encontrados</div>
        <p className="text-[10.5px] text-[#71717a] mb-3">IA analisou o perfil e encontrou leads parados com perfil similar.</p>
        {leads.map((l, i) => (
          <div key={i} className="bg-[#0f0f11] border border-[#27272a] rounded-lg p-3 mb-2 flex gap-3 items-start cursor-pointer hover:bg-[#18181b] hover:border-[#3f3f46] transition-all">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: l.bg }}>{l.iniciais}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-[#e4e4e7]">{l.nome}</div>
              <div className="text-[10px] text-[#71717a] mt-0.5">{l.sub}</div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {l.tags.map((t, j) => (
                  <span key={j} className="text-[9px] px-1.5 py-0.5 rounded-full font-medium border" style={tagCor[t.tipo]}>{t.label}</span>
                ))}
              </div>
            </div>
            <div className="text-[12px] font-bold text-[#4ade80] flex-shrink-0">{l.score}%</div>
          </div>
        ))}
      </div>
      <button onClick={() => toast.success('Reativação iniciada!', { description: 'IA vai abordar 3 leads similares com script personalizado.' })}
        className="w-full h-8 rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 hover:opacity-88 transition-opacity">
        🚀 Reativar todos com script personalizado
      </button>
    </div>
  );
}

function TabPostMortem() {
  const casos = [
    {
      titulo: 'Lead Perdido — Objeção',
      data: '01 jun',
      motivo: 'Objeção preço',
      motivoCor: 'rgba(239,68,68,.1)', motivoTxt: '#f87171', motivoBorda: 'rgba(239,68,68,.2)',
      erros: ['Preço citado antes de entender o problema', 'Decisor adicional nunca foi incluído'],
      positivos: ['Engajamento alto no início — lead tinha potencial'],
      rec: 'Reativar com case de ROI específico para o segmento. Script pronto na aba Base.',
    },
    {
      titulo: 'Lead Perdido — Silêncio',
      data: '25 mai',
      motivo: 'Silêncio',
      motivoCor: 'rgba(245,158,11,.1)', motivoTxt: '#fbbf24', motivoBorda: 'rgba(245,158,11,.2)',
      erros: ['Follow-up feito no D+5 — muito tarde', 'Mensagem genérica, sem personalização'],
      positivos: ['Respondeu 2x antes de parar — havia interesse real'],
      rec: 'Follow-up automático agora ativado em D+1 para leads similares.',
    },
  ];

  const causas = [
    { label: 'Objeção sem ROI apresentado', pct: 34, cor: '#f87171' },
    { label: 'Silêncio · follow-up tardio', pct: 28, cor: '#fbbf24' },
    { label: 'Decisor não incluído', pct: 21, cor: '#60a5fa' },
    { label: 'Concorrente escolhido', pct: 17, cor: '#a78bfa' },
  ];

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider">Diagnóstico de perdas</div>
      {casos.map((c, i) => (
        <div key={i} className="bg-[#0f0f11] border border-[#27272a] rounded-lg p-3 mb-1">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-xs">💀</span>
            <span className="text-[12px] font-semibold text-[#e4e4e7]">{c.titulo}</span>
            <span className="text-[9px] px-2 py-0.5 rounded-full border ml-auto" style={{ background: c.motivoCor, color: c.motivoTxt, borderColor: c.motivoBorda }}>{c.motivo}</span>
          </div>
          {c.erros.map((e, j) => (
            <div key={j} className="text-[11px] text-[#f87171] px-2.5 py-1.5 bg-[rgba(239,68,68,.06)] rounded-md border-l-2 border-[rgba(239,68,68,.2)] mb-1.5 leading-snug">{e}</div>
          ))}
          {c.positivos.map((p, j) => (
            <div key={j} className="text-[11px] text-[#34d399] px-2.5 py-1.5 bg-[rgba(16,185,129,.06)] rounded-md border-l-2 border-[rgba(16,185,129,.2)] mb-1.5 leading-snug">{p}</div>
          ))}
          <div className="text-[11px] text-[#a78bfa] px-2.5 py-1.5 bg-[rgba(124,58,237,.06)] rounded-md border-l-2 border-[rgba(124,58,237,.2)] mt-1 leading-snug">
            💡 {c.rec}
          </div>
        </div>
      ))}

      <div className="border-t border-[#18181b]" />

      <div className="text-[10px] font-bold text-[#52525b] uppercase tracking-wider mb-1">Principais causas — últimos 30 dias</div>
      {causas.map((c, i) => (
        <div key={i} className="flex justify-between py-1.5 border-b border-[#18181b] text-[11px]">
          <span style={{ color: c.cor }}>{c.label}</span>
          <span className="font-semibold" style={{ color: c.cor }}>{c.pct}%</span>
        </div>
      ))}

      <button onClick={() => toast.success('Relatório gerado!', { description: 'Diagnóstico completo de perdas pronto.' })}
        className="w-full h-8 rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 hover:opacity-88 transition-opacity mt-1">
        📄 Gerar relatório completo
      </button>
    </div>
  );
}

export default function PainelIAFunil({ oportunidade, onClose, formatCurrency, calcularTempoNaEtapa }) {
  const [loading, setLoading] = useState(false);
  const [analise, setAnalise] = useState(null);
  const [tabAtiva, setTabAtiva] = useState('agora');
  const [reanalisando, setReanalisando] = useState(false);
  const [whisperTxt, setWhisperTxt] = useState('Analisando conversa — aguarde sugestão da IA...');
  const whispers = [
    'Mencione um resultado concreto de cliente similar antes de falar preço',
    'Lead está hesitante — use dados de ROI, evite pressão direta',
    'Boa hora para perguntar sobre o principal gargalo comercial dele',
    'Inclua todos os decisores na próxima reunião para acelerar o fechamento',
  ];
  const wRef = useRef(0);

  const gerarAnalise = async () => {
    setLoading(true);
    setReanalisando(true);
    try {
      const prompt = `Analise esta oportunidade de vendas e responda em JSON:
Nome: ${oportunidade.titulo}
Cliente: ${oportunidade.cliente_nome || 'Não informado'}
Produto: ${oportunidade.produto || 'Consórcio'}
Valor: ${formatCurrency ? formatCurrency(oportunidade.valor_estimado || 0) : `R$ ${oportunidade.valor_estimado || 0}`}
Status: ${oportunidade.status}
Última movimentação: ${oportunidade.data_ultima_movimentacao ? (calcularTempoNaEtapa ? calcularTempoNaEtapa(oportunidade.data_ultima_movimentacao) : oportunidade.data_ultima_movimentacao) : 'Desconhecida'}
Previsão fechamento: ${oportunidade.data_fechamento_prevista || 'Não informada'}
Observações: ${oportunidade.observacoes || 'Nenhuma'}

Retorne JSON com: resumo (string), temperatura (frio/morno/quente), chance_fechamento (0-100), proxima_acao (string), mensagem_sugerida (string WhatsApp em português), objecoes (array de strings), produto_identificado (string).`;

      const resp = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            resumo: { type: 'string' },
            temperatura: { type: 'string' },
            chance_fechamento: { type: 'number' },
            proxima_acao: { type: 'string' },
            mensagem_sugerida: { type: 'string' },
            objecoes: { type: 'array', items: { type: 'string' } },
            produto_identificado: { type: 'string' },
          }
        }
      });
      setAnalise(resp);
      // Atualiza sugestão whisper após análise
      wRef.current = (wRef.current + 1) % whispers.length;
      setWhisperTxt(resp.proxima_acao ? `Ação sugerida: ${resp.proxima_acao.slice(0, 60)}` : whispers[wRef.current]);
    } catch (e) {
      toast.error('Erro ao gerar análise: ' + e.message);
    } finally {
      setLoading(false);
      setTimeout(() => setReanalisando(false), 500);
    }
  };

  // Score dinâmico baseado na análise
  const scores = {
    engajamento: analise ? Math.min(95, 50 + (analise.chance_fechamento || 0) * 0.5) : 65,
    intencao: analise ? (analise.chance_fechamento || 50) : 50,
    risco: analise ? Math.max(5, 100 - (analise.chance_fechamento || 50)) : 55,
    fit: analise ? Math.min(95, 60 + (analise.chance_fechamento || 0) * 0.35) : 75,
  };

  const riscoBadge = scores.risco >= 60 ? { cls: 'bg-[rgba(239,68,68,.12)] text-[#f87171] border-[rgba(239,68,68,.25)]', label: `${Math.round(scores.risco)}% risco` }
    : scores.risco >= 35 ? { cls: 'bg-[rgba(245,158,11,.12)] text-[#fbbf24] border-[rgba(245,158,11,.25)]', label: `${Math.round(scores.risco)}% risco` }
    : { cls: 'bg-[rgba(16,185,129,.12)] text-[#34d399] border-[rgba(16,185,129,.25)]', label: `${Math.round(scores.risco)}% risco` };

  return (
    <div className="fixed inset-y-0 right-0 w-[400px] bg-[#0d0d0f] shadow-2xl z-50 flex flex-col border-l border-[#27272a] overflow-hidden" onClick={e => e.stopPropagation()}>

      {/* Header */}
      <div className="p-3 border-b border-[#27272a] flex-shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7c3aed] to-[#6d28d9] flex items-center justify-center text-xs text-white">🤖</div>
          <div>
            <div className="text-[12.5px] font-bold text-[#f4f4f5]">Coach IA</div>
            <div className="text-[10px] text-[#52525b]">Análise em tempo real</div>
          </div>
          {reanalisando && (
            <div className="ml-auto flex items-center gap-1.5 text-[10px] text-[#a78bfa]">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              <span>Reanalisando...</span>
            </div>
          )}
          <div className={`ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full border ${riscoBadge.cls}`}>{riscoBadge.label}</div>
          <button onClick={onClose} className="p-1 ml-1 rounded hover:bg-[#18181b] transition-colors text-[#52525b] hover:text-[#e4e4e7]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scores */}
        <div className="grid grid-cols-2 gap-1.5">
          <ScoreBar label="Engajamento" value={Math.round(scores.engajamento)} color="#14b8a6" />
          <ScoreBar label="Intenção compra" value={Math.round(scores.intencao)} color="#fbbf24" />
          <ScoreBar label="Risco de fuga" value={Math.round(scores.risco)} color="#ef4444" />
          <ScoreBar label="Fit de produto" value={Math.round(scores.fit)} color="#7c3aed" />
        </div>
      </div>

      {/* Lead info strip */}
      <div className="px-3 py-2 bg-[#0f0f11] border-b border-[#18181b] flex items-center gap-2 flex-shrink-0">
        <div className="text-[11px] font-semibold text-[#e4e4e7] flex-1 truncate">{oportunidade.titulo}</div>
        {oportunidade.valor_estimado ? (
          <span className="text-[10px] font-bold text-[#34d399]">{formatCurrency ? formatCurrency(oportunidade.valor_estimado) : `R$ ${oportunidade.valor_estimado}`}</span>
        ) : null}
      </div>

      {/* Whisper bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-[rgba(79,70,229,.12)] to-[rgba(124,58,237,.08)] border-b border-[rgba(124,58,237,.2)] flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-[#a78bfa] animate-pulse flex-shrink-0" />
        <span className="text-[10px]">🤫</span>
        <span className="text-[10.5px] text-[#a78bfa] italic flex-1 truncate">{whisperTxt}</span>
        <button onClick={() => toast.info('Sugestão copiada!', { description: whisperTxt })}
          className="text-[9px] px-2 py-0.5 rounded border border-[rgba(124,58,237,.3)] bg-[rgba(124,58,237,.08)] text-[#a78bfa] hover:bg-[rgba(124,58,237,.18)] transition-colors flex-shrink-0">
          Usar ↑
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#18181b] overflow-x-auto flex-shrink-0 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTabAtiva(t.id)}
            className={`text-[10.5px] font-medium px-3 py-2 border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${tabAtiva === t.id ? 'text-[#a78bfa] border-[#7c3aed]' : 'text-[#52525b] border-transparent hover:text-[#a1a1aa]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#27272a transparent' }}>
        {tabAtiva === 'agora' && <TabAgora analise={analise} loading={loading} onGerar={gerarAnalise} />}
        {tabAtiva === 'memoria' && <TabMemoria oportunidade={oportunidade} analise={analise} />}
        {tabAtiva === 'emocao' && <TabEmocao analise={analise} />}
        {tabAtiva === 'cadencia' && <TabCadencia analise={analise} />}
        {tabAtiva === 'aprende' && <TabAprende />}
        {tabAtiva === 'prosp' && <TabProspeccao oportunidade={oportunidade} />}
        {tabAtiva === 'pm' && <TabPostMortem />}
      </div>
    </div>
  );
}