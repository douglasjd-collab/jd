import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TrendingUp, ChevronDown, ChevronUp, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import OportunidadeAcaoRapida from './OportunidadeAcaoRapida';
import CriarProximaAcaoBar from './CriarProximaAcaoBar';
import MicrotarefasConversa from './MicrotarefasConversa';

const produtoTexto = (produto) => ({
  consorcio: 'Consórcio', emprestimo: 'Empréstimo', financiamento: 'Financiamento',
  protecao_veicular: 'Proteção veicular', credisol: 'Credisol',
}[produto] || produto || 'Funil de vendas');

export default function AcompanhamentoConversa({ oportunidades = [], onAdicionarFunil, ...tarefaProps }) {
  const [expandido, setExpandido] = useState(null);
  const [acaoRapida, setAcaoRapida] = useState(null);
  const temTarefa = tarefaProps.tarefas?.length > 0;
  const temOportunidade = oportunidades.length > 0;
  const oportunidadeAberta = expandido === 'oportunidade' && temOportunidade;
  const tarefaAberta = expandido === 'tarefa' && temTarefa;
  const { data: etapas = [] } = useQuery({
    queryKey: ['etapas-funil'],
    queryFn: () => base44.entities.EtapaFunil.list('ordem', 500),
    enabled: oportunidades.some(o => o.etapa_id && !o.etapa_nome),
    staleTime: 60000,
  });
  const etapaTexto = (o) => etapas.find(e => e.id === o.etapa_id)?.nome || o.etapa_nome || 'Consultar no funil';
  const primeira = oportunidades[0];
  const resumo = primeira ? [produtoTexto(primeira.produto), etapaTexto(primeira)].join(' · ') : '';

  return (
    <>
    <div className="flex shrink-0 items-stretch gap-2 border-b border-slate-100 bg-white px-3 py-2">
      {!oportunidadeAberta && !tarefaAberta && (
        <CriarProximaAcaoBar
          className={temTarefa || temOportunidade ? 'min-w-0 shrink-0 max-w-[38%]' : 'flex-1'}
          oportunidadeAtual={primeira}
          onAdicionarFunil={onAdicionarFunil}
          onCriarTarefa={() => tarefaProps.novaAcaoRef.current?.()}
        />
      )}
      {/* Manter montado: o botão de criar ação usa a referência do formulário de tarefa. */}
      <div className={oportunidadeAberta || !temTarefa ? 'hidden' : 'flex min-w-0 flex-1'}>
        <MicrotarefasConversa
          {...tarefaProps}
          abertoControlado={tarefaAberta}
          onAbertoChange={(aberto) => setExpandido(aberto ? 'tarefa' : null)}
        />
      </div>
      {temOportunidade && !tarefaAberta && (
        <section className="min-w-0 flex-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 shadow-sm" aria-label="Oportunidades no funil">
          <button type="button" aria-expanded={oportunidadeAberta} onClick={() => setExpandido(oportunidadeAberta ? null : 'oportunidade')} className="flex w-full items-center gap-2 text-left">
            <TrendingUp className="h-4 w-4 shrink-0 text-blue-600" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wide text-blue-700">
                {oportunidades.length > 1 ? 'Oportunidades · ' + oportunidades.length : 'Oportunidade'}
              </div>
              <p className="truncate text-sm font-semibold text-slate-800" title={resumo}>{resumo}</p>
            </div>
            {oportunidadeAberta ? <ChevronUp className="h-4 w-4 shrink-0 text-blue-600" /> : <ChevronDown className="h-4 w-4 shrink-0 text-blue-600" />}
          </button>
          {oportunidadeAberta && (
            <div className="mt-2 max-h-60 space-y-2 overflow-y-auto border-t border-blue-200 pt-2">
              {oportunidades.map(o => (
                <div key={o.id} className="rounded-lg bg-white/80 p-3">
                  <p className="text-sm font-semibold text-slate-800">{o.titulo || produtoTexto(o.produto)}</p>
                  <p className="mt-1 text-xs text-slate-600">Funil: {produtoTexto(o.produto)} · Etapa: {etapaTexto(o)}</p>
                  <p className="mt-1 text-xs text-slate-600">Responsável: {o.vendedor_nome || 'Consultar no funil'}</p>
                  {o.status && <p className="mt-1 text-xs text-slate-600">Situação: {({ aberta: 'Em andamento', ganha: 'Ganha', perdida: 'Perdida' })[o.status] || o.status}</p>}
                  {o.observacoes && <div className="mt-2 rounded-md border border-blue-100 bg-blue-50/60 p-2"><p className="text-[11px] font-semibold text-blue-800">Informações importantes</p><p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-700">{o.observacoes}</p></div>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAcaoRapida({ id: o.id, tipo: 'mover' })}>Mover etapa</Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAcaoRapida({ id: o.id, tipo: 'editar' })}>Editar negociação</Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAcaoRapida({ id: o.id, tipo: 'anotar' })}>Adicionar anotação</Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setAcaoRapida({ id: o.id, tipo: 'historico' })}>Histórico</Button>
                  </div>
                  <Link to={'/FunilVendas?oportunidade_id=' + encodeURIComponent(o.id)} className="mt-2 inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                    Ver no funil <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
    {acaoRapida && <OportunidadeAcaoRapida key={acaoRapida.id + acaoRapida.tipo} oportunidadeId={acaoRapida.id} acao={acaoRapida.tipo} currentUser={tarefaProps.user} onClose={() => setAcaoRapida(null)} />}
    </>
  );
}
