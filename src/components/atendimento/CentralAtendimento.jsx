import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { BellRing, ChevronDown, RefreshCw, Settings2, X, Clock, Hourglass } from 'lucide-react';
import { createPageUrl } from '@/utils';
import useAlertasAtendimento from './useAlertasAtendimento';
import ItemAguardando from './ItemAguardando';
import ItemRevisao from './ItemRevisao';
import FinalizarAtendimentoModal from './FinalizarAtendimentoModal';
import AgendarRetornoModal from './AgendarRetornoModal';
import ConfiguracaoHorarioModal from './ConfiguracaoHorarioModal';

const PERFIS_ADMIN = ['admin', 'master', 'super_admin'];

/**
 * Central compacta de atendimento: reúne clientes que aguardam resposta humana
 * há mais de 5 minutos e atendimentos que completaram 1 hora. Um único painel
 * agrupado (nunca vários popups), com adiamento curto e sem reabrir a cada
 * consulta — só reabre quando o conjunto pendente muda.
 */
export default function CentralAtendimento({ user }) {
  const empresaId = user?.empresa_id;
  const podeUsar = !!empresaId && user?.perfil !== 'parceiro';
  const { dados, atualizando, buscar } = useAlertasAtendimento({ empresaId, ativo: podeUsar });

  const [aberto, setAberto] = useState(false);
  const [mostrarAdiados, setMostrarAdiados] = useState(false);
  const [itemFinalizar, setItemFinalizar] = useState(null);
  const [itemAgendar, setItemAgendar] = useState(null);
  const [horarioOpen, setHorarioOpen] = useState(false);
  const [processando, setProcessando] = useState('');

  const aguardando = dados?.aguardando || [];
  const revisao = dados?.revisao || [];
  const adiados = dados?.adiados || [];
  const total = aguardando.length + revisao.length;
  const ehAdmin = PERFIS_ADMIN.includes(user?.perfil || '');

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
    window.location.href = createPageUrl(`BatePapo?conversa_id=${item.conversa_id}`);
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
        className="print:hidden fixed bottom-24 right-6 z-[9997] flex items-center gap-2 rounded-full bg-[#10353C] px-3.5 py-2 text-white shadow-lg transition-colors hover:bg-[#155059]"
        title="Atendimentos aguardando resposta"
      >
        <BellRing className="h-4 w-4" />
        <span className="text-xs font-semibold">Atendimento</span>
        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold leading-tight">
          {total + adiados.length}
        </span>
      </button>
    );
  }

  return (
    <>
      <div className="print:hidden fixed bottom-24 right-6 z-[9997] w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-[#10353C] px-3 py-2 text-white">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4" />
            <span className="text-sm font-semibold">Atendimento</span>
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[11px] font-bold">{total + adiados.length}</span>
          </div>
          <div className="flex items-center gap-1">
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

        <div className="max-h-[55vh] overflow-y-auto">
          {aguardando.length > 0 && (
            <div>
              <p className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-slate-100 bg-amber-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                <Clock className="h-3 w-3" />
                Aguardando resposta ({aguardando.length})
              </p>
              <div className="divide-y divide-slate-100">
                {aguardando.map((item) => (
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

          {revisao.length > 0 && (
            <div>
              <p className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-slate-100 bg-sky-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-sky-800">
                <Hourglass className="h-3 w-3" />
                Revisão de 1 hora ({revisao.length})
              </p>
              <div className="divide-y divide-slate-100">
                {revisao.map((item) => (
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

          {adiados.length > 0 && (
            <div className="border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMostrarAdiados((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-50"
              >
                <span>{adiados.length} adiado(s) — pendência mantida</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${mostrarAdiados ? 'rotate-180' : ''}`} />
              </button>
              {mostrarAdiados && (
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {adiados.map((item) => (
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

      <FinalizarAtendimentoModal
        open={!!itemFinalizar}
        item={itemFinalizar}
        empresaId={empresaId}
        onOpenChange={(v) => !v && setItemFinalizar(null)}
        onConcluido={buscar}
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