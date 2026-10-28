import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { BellRing, ChevronDown, RefreshCw, Settings2, X, Clock, Hourglass, Search } from 'lucide-react';
import { createPageUrl } from '@/utils';
import useAlertasAtendimento from './useAlertasAtendimento';
import ItemAguardando from './ItemAguardando';
import ItemRevisao from './ItemRevisao';
import ItemOutraConversa from './ItemOutraConversa';
import FinalizarAtendimentoDialog from '@/components/chat/FinalizarAtendimentoDialog';
import AgendarRetornoModal from './AgendarRetornoModal';
import ConfiguracaoHorarioModal from './ConfiguracaoHorarioModal';

const PERFIS_ADMIN = ['admin', 'master', 'super_admin'];

const semAcento = (valor = '') =>
  String(valor).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Central compacta de atendimento: reúne clientes que aguardam resposta humana
 * (inclusive os de menos de 5 minutos, apenas para localizar) e atendimentos
 * que completaram 1 hora. Um único painel
 * agrupado (nunca vários popups), com adiamento curto e sem reabrir a cada
 * consulta — só reabre quando o conjunto pendente muda.
 */
export default function CentralAtendimento({ user }) {
  const navigate = useNavigate();
  const empresaId = user?.empresa_id;
  const podeUsar = !!empresaId && user?.perfil !== 'parceiro';
  const { dados, atualizando, buscar } = useAlertasAtendimento({ empresaId, ativo: podeUsar });

  const [aberto, setAberto] = useState(false);
  const [mostrarAdiados, setMostrarAdiados] = useState(false);
  const [itemFinalizar, setItemFinalizar] = useState(null);
  const [itemAgendar, setItemAgendar] = useState(null);
  const [horarioOpen, setHorarioOpen] = useState(false);
  const [processando, setProcessando] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [outras, setOutras] = useState([]);

  const aguardando = dados?.aguardando || [];
  const recentes = dados?.recentes || [];
  const revisao = dados?.revisao || [];
  const adiados = dados?.adiados || [];
  // As listas são limitadas pelo servidor; o contador usa os totais completos.
  const contar = (valor, lista) => Number.isInteger(valor) && valor >= 0 ? valor : lista.length;
  const total = contar(dados?.total_aguardando, aguardando)
    + contar(dados?.total_recentes, recentes)
    + contar(dados?.total_revisao, revisao);
  const totalAdiados = contar(dados?.total_adiados, adiados);
  const totalNotificacoes = total + totalAdiados;

  // Busca por nome ou telefone dentro das pendências listadas.
  // Nome comparado sem acentos: "joao" encontra "João".
  const filtrarPorBusca = (lista) => {
    const termo = semAcento(busca.trim());
    if (!termo) return lista;
    const digitos = termo.replace(/\D/g, '');
    return lista.filter((i) => {
      if (semAcento(i.cliente_nome).includes(termo)) return true;
      if (!digitos) return false;
      return String(i.cliente_telefone || '').replace(/\D/g, '').includes(digitos);
    });
  };

  // Contatos que não estão pendentes (cliente já respondido, atendimento em
  // andamento ou conversa encerrada) só aparecem pela busca — é o caso de quem
  // procura um cliente específico e ele não está na fila de espera.
  const idsPendentes = useMemo(
    () => [...aguardando, ...recentes, ...revisao, ...adiados].map((i) => i.conversa_id).filter(Boolean),
    [aguardando, recentes, revisao, adiados]
  );
  const idsPendentesChave = idsPendentes.join('|');

  const aguardandoFiltrado = filtrarPorBusca(aguardando);
  const recentesFiltrado = filtrarPorBusca(recentes);
  const revisaoFiltrado = filtrarPorBusca(revisao);
  const adiadosFiltrado = filtrarPorBusca(adiados);
  const ehAdmin = PERFIS_ADMIN.includes(user?.perfil || '');
  const termoBusca = busca.trim();

  // Quem não está na fila de espera (já respondido ou em atendimento) é
  // localizado pela busca global de conversas, que já aplica as permissões
  // por conexão do WhatsApp.
  useEffect(() => {
    if (!podeUsar || termoBusca.length < 2) {
      setOutras([]);
      return;
    }
    let cancelado = false;
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await base44.functions.invoke('buscarConversasGlobal', {
          empresa_id: empresaId,
          q: termoBusca,
          limit: 30,
        });
        if (cancelado) return;
        const pendentes = new Set(idsPendentesChave.split('|'));
        const encontradas = (data?.conversas || []).filter((c) => !pendentes.has(c.id));
        setOutras(encontradas.slice(0, 10));
      } catch {
        if (!cancelado) setOutras([]);
      }
    }, 400);
    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [termoBusca, empresaId, podeUsar, idsPendentesChave]);

  // Chave do conjunto pendente: usada para abrir sozinho só quando algo novo
  // entra na fila (não a cada poll, render ou recarregamento).
  const chavePendente = useMemo(
    () =>
      [
        ...aguardando.map((i) => `a:${i.conversa_id}:${i.aguardando_desde}`),
        ...revisao.map((i) => `r:${i.conversa_id}:${i.atendimento_iniciado_em}`),
      ].join('|'),
    [aguardando, revisao]
  );

  useEffect(() => {
    if (!chavePendente || !dados) return;
    if (dados.horario?.configurado && !dados.horario.dentro) return;
    const chave = `atendimento_popup_${user?.colaborador_id || user?.id || 'user'}`;
    if (localStorage.getItem(chave) === chavePendente) return;
    localStorage.setItem(chave, chavePendente);
    setAberto(true);
  }, [chavePendente, dados, user]);

  if (!podeUsar || !dados) return null;
  if (!total && !adiados.length) return null;

  const abrirConversa = (item) => {
    setAberto(false);
    navigate(createPageUrl('BatePapo'), {
      state: { atendimentoConversaId: item.conversa_id },
    });
  };

  const executar = async (payload, mensagemSucesso) => {
    setProcessando(payload.conversa_id + payload.acao);
    try {
      const { data } = await base44.functions.invoke('alertasAtendimento', { empresa_id: empresaId, ...payload });
      if (data?.error) throw new Error(data.error);
      if (mensagemSucesso) toast.success(mensagemSucesso);
      await buscar();
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || 'Não foi possível concluir a ação');
    } finally {
      setProcessando('');
    }
  };

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="print:hidden fixed top-24 right-6 z-[9997] flex items-center gap-2 rounded-full bg-[#10353C] px-3.5 py-2 text-white shadow-lg transition-colors hover:bg-[#155059]"
        title="Atendimentos aguardando resposta"
      >
        <BellRing className="h-4 w-4" />
        <span className="text-xs font-semibold">Atendimento</span>
        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold leading-tight">
          {totalNotificacoes}
        </span>
      </button>
    );
  }

  return (
    <>
      <div className="print:hidden fixed top-24 right-6 z-[9997] w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-[#10353C] px-3 py-2 text-white">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4" />
            <span className="text-sm font-semibold">Atendimento</span>
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[11px] font-bold">{totalNotificacoes}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setBuscaAberta((v) => !v);
                setBusca('');
              }}
              className={`rounded p-1 hover:bg-white/10 hover:text-white ${buscaAberta ? 'bg-white/20 text-white' : 'text-white/80'}`}
              title="Pesquisar contato"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={buscar}
              className="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"
              title="Atualizar agora"
            >
              <RefreshCw className={`h-4 w-4 ${atualizando ? 'animate-spin' : ''}`} />
            </button>
            {ehAdmin && (
              <button
                type="button"
                onClick={() => setHorarioOpen(true)}
                className="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"
                title="Horário de atendimento"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"
              title="Minimizar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {buscaAberta && (
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou telefone"
                className="w-full bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
              />
              {busca && (
                <button type="button" onClick={() => setBusca('')} className="shrink-0 text-slate-400 hover:text-slate-600" title="Limpar busca">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="max-h-[55vh] overflow-y-auto">
          {termoBusca && !aguardandoFiltrado.length && !recentesFiltrado.length && !revisaoFiltrado.length && !adiadosFiltrado.length && !outras.length && (
            <p className="px-3 py-6 text-center text-xs text-slate-500">Nenhum contato encontrado nas pendências.</p>
          )}

          {aguardandoFiltrado.length > 0 && (
            <div>
              <p className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-slate-100 bg-amber-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                <Clock className="h-3 w-3" />
                Aguardando resposta ({aguardandoFiltrado.length})
              </p>
              <div className="divide-y divide-slate-100">
                {aguardandoFiltrado.map((item) => (
                  <ItemAguardando
                    key={item.conversa_id}
                    item={item}
                    processando={processando === item.conversa_id + 'adiar'}
                    onAtender={abrirConversa}
                    onAdiar={(i) => executar({ acao: 'adiar', conversa_id: i.conversa_id, minutos: 5 }, 'Alerta adiado por 5 minutos')}
                    onFinalizar={(i, opcoes) => (opcoes?.agendar ? setItemAgendar(i) : setItemFinalizar(i))}
                  />
                ))}
              </div>
            </div>
          )}

          {recentesFiltrado.length > 0 && (
            <div>
              <p className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                <Clock className="h-3 w-3" />
                Aguardando até 5 min ({recentesFiltrado.length})
              </p>
              <div className="divide-y divide-slate-100">
                {recentesFiltrado.map((item) => (
                  <ItemAguardando
                    key={item.conversa_id}
                    item={item}
                    semAdiar
                    processando={false}
                    onAtender={abrirConversa}
                    onFinalizar={(i, opcoes) => (opcoes?.agendar ? setItemAgendar(i) : setItemFinalizar(i))}
                  />
                ))}
              </div>
            </div>
          )}

          {revisaoFiltrado.length > 0 && (
            <div>
              <p className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-slate-100 bg-sky-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-sky-800">
                <Hourglass className="h-3 w-3" />
                Revisão de 1 hora ({revisaoFiltrado.length})
              </p>
              <div className="divide-y divide-slate-100">
                {revisaoFiltrado.map((item) => (
                  <ItemRevisao
                    key={item.conversa_id}
                    item={item}
                    processando={processando === item.conversa_id + 'continuar'}
                    onAtender={abrirConversa}
                    onContinuar={(i) => executar({ acao: 'continuar', conversa_id: i.conversa_id }, 'Revisão adiada por 30 minutos')}
                    onFinalizar={(i, opcoes) => (opcoes?.agendar ? setItemAgendar(i) : setItemFinalizar(i))}
                  />
                ))}
              </div>
            </div>
          )}

          {outras.length > 0 && (
            <div className="border-t border-slate-100">
              <p className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                <Search className="h-3 w-3" />
                Outras conversas ({outras.length})
              </p>
              <div className="divide-y divide-slate-100">
                {outras.map((conversa) => (
                  <ItemOutraConversa
                    key={conversa.id}
                    conversa={conversa}
                    onAbrir={() => abrirConversa({ conversa_id: conversa.id })}
                    onAgendar={() => setItemAgendar({ ...conversa, conversa_id: conversa.id })}
                  />
                ))}
              </div>
            </div>
          )}

          {adiadosFiltrado.length > 0 && (
            <div className="border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMostrarAdiados((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-50"
              >
                <span>{adiadosFiltrado.length} adiado(s) — pendência mantida</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${mostrarAdiados ? 'rotate-180' : ''}`} />
              </button>
              {(mostrarAdiados || !!busca.trim()) && (
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {adiadosFiltrado.map((item) => (
                    <ItemAguardando
                      key={item.conversa_id}
                      item={item}
                      adiado
                      processando={false}
                      onAtender={abrirConversa}
                      onAdiar={(i) => executar({ acao: 'adiar', conversa_id: i.conversa_id, minutos: 5 }, 'Alerta adiado por 5 minutos')}
                      onFinalizar={(i, opcoes) => (opcoes?.agendar ? setItemAgendar(i) : setItemFinalizar(i))}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5">
          <p className="text-[10px] leading-snug text-slate-500">{dados.horario?.descricao}</p>
        </div>
      </div>

      {/* Mesmo modal principal do Bate-papo: mensagem padrão editável e os três botões.
          O destino é resolvido pelo id da conversa (e pela conexão dela), não pela tela aberta. */}
      <FinalizarAtendimentoDialog
        open={!!itemFinalizar}
        conversaId={itemFinalizar?.conversa_id}
        empresaId={empresaId}
        user={user}
        descricaoExtra={
          itemFinalizar?.tipo === 'aguardando'
            ? `O cliente aguarda resposta há ${itemFinalizar.minutos} min. "Enviar e finalizar" responde e encerra; "Finalizar sem enviar" encerra sem responder.`
            : ''
        }
        onOpenChange={(v) => !v && setItemFinalizar(null)}
        onConcluida={async () => {
          setItemFinalizar(null);
          await buscar();
        }}
      />
      <AgendarRetornoModal
        open={!!itemAgendar}
        item={itemAgendar}
        empresaId={empresaId}
        usuario={user}
        onOpenChange={(v) => !v && setItemAgendar(null)}
        onConcluido={buscar}
      />
      <ConfiguracaoHorarioModal
        open={horarioOpen}
        empresaId={empresaId}
        configAtual={dados.horario_config || null}
        onOpenChange={setHorarioOpen}
        onConcluido={buscar}
      />
    </>
  );
}