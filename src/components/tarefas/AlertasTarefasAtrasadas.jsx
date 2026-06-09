import React, { useEffect, useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, X, Clock, ChevronRight, Calendar } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import TarefaDetalhesModal from './TarefaDetalhesModal';

const INTERVALO_CICLO_MS = 3 * 60 * 60 * 1000; // 3 horas entre ciclos
const INTERVALO_ENTRE_TAREFAS_MS = 10 * 60 * 1000; // 10 minutos entre cada tarefa

function getChaveUltimoCiclo(userId) {
  return `tarefas_atrasadas_ultimo_ciclo_${userId}`;
}
function getChaveFilaExibida(userId) {
  return `tarefas_atrasadas_fila_${userId}`;
}
function getChaveProximaTarefa(userId) {
  return `tarefas_atrasadas_proxima_${userId}`;
}

export default function AlertasTarefasAtrasadas({ user }) {
  const [tarefaAtual, setTarefaAtual] = useState(null);
  const [totalAtrasadas, setTotalAtrasadas] = useState(0);
  const [modalAberto, setModalAberto] = useState(false);
  const [tarefaModal, setTarefaModal] = useState(null);
  const [statusList, setStatusList] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [subsetores, setSubsetores] = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!user?.colaborador_id) return;
    verificarEExibir();
    // Checar a cada minuto se é hora de exibir próxima tarefa
    const interval = setInterval(verificarEExibir, 60 * 1000);
    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user?.colaborador_id]);

  const verificarEExibir = async () => {
    if (!user?.colaborador_id) return;
    const userId = user.colaborador_id;
    const agora = Date.now();

    const chaveCiclo = getChaveUltimoCiclo(userId);
    const chaveFila = getChaveFilaExibida(userId);
    const chaveProxima = getChaveProximaTarefa(userId);

    let ultimoCiclo = parseInt(localStorage.getItem(chaveCiclo) || '0');
    let filaExibida = [];
    try { filaExibida = JSON.parse(localStorage.getItem(chaveFila) || '[]'); } catch {}
    let proximaTarefa = parseInt(localStorage.getItem(chaveProxima) || '0');

    const deveIniciarNovoCiclo = agora - ultimoCiclo >= INTERVALO_CICLO_MS;

    if (deveIniciarNovoCiclo) {
      // Iniciar novo ciclo: buscar todas as tarefas atrasadas do colaborador
      const hoje = new Date().toLocaleDateString('fr-CA');
      const filtro = user.empresa_id ? { empresa_id: user.empresa_id } : {};
      const tarefas = await base44.entities.Tarefa.filter(filtro, '-created_date', 200).catch(() => []);

      const atrasadas = tarefas.filter(t => {
        if (!t.data_conclusao_prevista || t.data_conclusao_prevista >= hoje) return false;
        if (['concluido', 'arquivado'].includes(t.status)) return false;
        let responsaveisIds = [];
        try { responsaveisIds = t.responsaveis_ids ? JSON.parse(t.responsaveis_ids) : []; } catch {}
        return t.responsavel_principal_id === userId || responsaveisIds.includes(userId);
      });

      if (atrasadas.length === 0) return;

      // Salvar novo ciclo
      localStorage.setItem(chaveCiclo, String(agora));
      localStorage.setItem(chaveFila, JSON.stringify([]));
      localStorage.setItem(chaveProxima, String(agora));
      filaExibida = [];
      proximaTarefa = agora;

      setTotalAtrasadas(atrasadas.length);

      // Exibir a primeira tarefa imediatamente
      await exibirProximaTarefa(atrasadas, [], userId);
    } else {
      // Ciclo em andamento: verificar se é hora de exibir próxima tarefa
      if (agora < proximaTarefa) return; // Ainda não é hora

      const hoje = new Date().toLocaleDateString('fr-CA');
      const filtro = user.empresa_id ? { empresa_id: user.empresa_id } : {};
      const tarefas = await base44.entities.Tarefa.filter(filtro, '-created_date', 200).catch(() => []);

      const atrasadas = tarefas.filter(t => {
        if (!t.data_conclusao_prevista || t.data_conclusao_prevista >= hoje) return false;
        if (['concluido', 'arquivado'].includes(t.status)) return false;
        let responsaveisIds = [];
        try { responsaveisIds = t.responsaveis_ids ? JSON.parse(t.responsaveis_ids) : []; } catch {}
        return t.responsavel_principal_id === userId || responsaveisIds.includes(userId);
      });

      if (atrasadas.length === 0) return;
      setTotalAtrasadas(atrasadas.length);
      await exibirProximaTarefa(atrasadas, filaExibida, userId);
    }
  };

  const exibirProximaTarefa = async (atrasadas, filaJaExibida, userId) => {
    // Pegar próxima tarefa que ainda não foi exibida neste ciclo
    const pendente = atrasadas.find(t => !filaJaExibida.includes(t.id));
    if (!pendente) return; // Todas já foram exibidas neste ciclo

    setTarefaAtual(pendente);

    // Registrar como exibida e agendar próxima
    const novaFila = [...filaJaExibida, pendente.id];
    localStorage.setItem(getChaveFilaExibida(userId), JSON.stringify(novaFila));
    localStorage.setItem(getChaveProximaTarefa(userId), String(Date.now() + INTERVALO_ENTRE_TAREFAS_MS));
  };

  const handleFechar = () => {
    setTarefaAtual(null);
  };

  const handleVerTarefa = async (tarefa) => {
    setTarefaAtual(null);
    const filtroEmpresa = user.empresa_id ? { empresa_id: user.empresa_id } : {};
    const [statuses, colabs, subs] = await Promise.all([
      base44.entities.StatusTarefa.filter(filtroEmpresa, 'ordem', 100).catch(() => []),
      base44.entities.Colaborador.filter(filtroEmpresa, null, 200).catch(() => []),
      base44.entities.SubsetorTarefa.filter(filtroEmpresa, null, 200).catch(() => []),
    ]);
    setStatusList(statuses);
    setColaboradores(colabs);
    setSubsetores(subs);
    setTarefaModal(tarefa);
    setModalAberto(true);
  };

  const handleUpdate = async (id, data) => {
    await base44.entities.Tarefa.update(id, data);
    const updated = await base44.entities.Tarefa.filter({ id }).catch(() => []);
    if (updated[0]) setTarefaModal(updated[0]);
  };

  const diasAtraso = (tarefa) => {
    if (!tarefa?.data_conclusao_prevista) return 0;
    const prazo = new Date(tarefa.data_conclusao_prevista + 'T00:00:00');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Math.floor((hoje - prazo) / (1000 * 60 * 60 * 24));
  };

  if (!tarefaAtual) {
    return (
      <>
        {tarefaModal && (
          <TarefaDetalhesModal
            open={modalAberto}
            onOpenChange={setModalAberto}
            tarefa={tarefaModal}
            statusList={statusList}
            currentUser={user}
            onUpdate={handleUpdate}
            colaboradores={colaboradores}
            subsetoresList={subsetores}
            abaAtiva="detalhes"
          />
        )}
      </>
    );
  }

  const dias = diasAtraso(tarefaAtual);

  return (
    <>
      {/* Popup de tarefa atrasada */}
      <div className="fixed inset-0 z-[9998] flex items-start justify-center pt-16 px-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl border border-red-200 w-full max-w-md pointer-events-auto overflow-hidden animate-in slide-in-from-top-4 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-red-600 text-white">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-semibold">Tarefa em Atraso!</span>
              {totalAtrasadas > 1 && (
                <span className="bg-white/20 text-white text-xs font-bold rounded-full px-2 py-0.5">
                  {totalAtrasadas} atrasadas
                </span>
              )}
            </div>
            <button onClick={handleFechar} className="text-white/70 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Conteúdo */}
          <div className="px-5 py-4">
            <h3 className="font-semibold text-slate-800 text-base leading-snug mb-1">
              {tarefaAtual.titulo}
            </h3>

            {tarefaAtual.cliente_nome && (
              <p className="text-sm text-slate-500 mb-2">
                Cliente: <span className="font-medium text-slate-700">{tarefaAtual.cliente_nome}</span>
              </p>
            )}

            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">
                  Prazo: {tarefaAtual.data_conclusao_prevista
                    ? format(new Date(tarefaAtual.data_conclusao_prevista + 'T00:00:00'), 'dd/MM/yyyy')
                    : '—'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-3 py-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-xs font-bold">{dias}d de atraso</span>
              </div>
            </div>

            {tarefaAtual.descricao && (
              <p className="text-xs text-slate-500 mt-3 bg-slate-50 rounded-lg px-3 py-2 line-clamp-2">
                {tarefaAtual.descricao}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 pb-4 flex items-center justify-between gap-3">
            <button
              onClick={handleFechar}
              className="text-sm text-slate-400 hover:text-slate-600 font-medium"
            >
              Lembrar depois
            </button>
            <button
              onClick={() => handleVerTarefa(tarefaAtual)}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              Ver tarefa <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal da tarefa */}
      {tarefaModal && (
        <TarefaDetalhesModal
          open={modalAberto}
          onOpenChange={setModalAberto}
          tarefa={tarefaModal}
          statusList={statusList}
          currentUser={user}
          onUpdate={handleUpdate}
          colaboradores={colaboradores}
          subsetoresList={subsetores}
          abaAtiva="detalhes"
        />
      )}
    </>
  );
}