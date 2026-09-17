import React, { useMemo, useState } from 'react';
import { ClipboardList, Plus, Check, Clock, ChevronDown, ChevronUp, Loader2, Pencil, User, Users, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useTarefaFormData } from '@/hooks/useTarefaFormData';
import TarefaFormModal from '@/components/tarefas/TarefaFormModal';
import { format } from 'date-fns';
import MicrotarefaChecklistComentarios from '@/components/chat/MicrotarefaChecklistComentarios';

const ACOES_RAPIDAS = [
  'Solicitar boleto',
  'Abrir solicitação',
  'Retornar ao cliente',
  'Consultar proposta',
  'Conferir documentos',
  'Confirmar pagamento',
  'Enviar simulação',
  'Fazer pós-venda',
];

const prazoTexto = (iso) => {
  if (!iso) return 'Sem horário definido';
  const data = new Date(iso);
  const hoje = new Date();
  const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (data.toDateString() === hoje.toDateString()) return `Hoje, ${hora}`;
  if (data.toDateString() === amanha.toDateString()) return `Amanhã, ${hora}`;
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + `, ${hora}`;
};

export default function MicrotarefasConversa({ tarefas = [], onCriar, onConcluir, onAdiar, onEditar, salvando = false, user, empresaId, conversa }) {
  const [aberto, setAberto] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(false);
  const [tituloInicial, setTituloInicial] = useState('');
  const [respOpen, setRespOpen] = useState(false);
  const { colaboradores, clientes, statusList, setores, subsetores } = useTarefaFormData(empresaId);

  const ordenadas = useMemo(() => [...tarefas].sort((a, b) =>
    new Date(a.vencimento_em || a.data_conclusao_prevista || 0) - new Date(b.vencimento_em || b.data_conclusao_prevista || 0)
  ), [tarefas]);
  const proxima = ordenadas[0];
  const vencida = proxima?.vencimento_em && new Date(proxima.vencimento_em) < new Date();

  const abrirNova = (acao = '') => {
    setEditando(false);
    setTituloInicial(acao);
    setModal(true);
  };

  const abrirEdicao = () => {
    setEditando(true);
    setModal(true);
  };

  const tarefaPreenchida = useMemo(() => {
    if (!modal) return null;
    if (editando) return proxima;
    const nomeCliente = conversa?.cliente_nome || conversa?.cliente_telefone || '';
    return {
      titulo: tituloInicial,
      cliente_id: conversa?.cliente_id || '',
      cliente_nome: nomeCliente,
      cliente_telefone: conversa?.cliente_telefone || '',
      data_cadastro: format(new Date(), 'yyyy-MM-dd'),
      prioridade: 'media',
      responsavel_principal_id: user?.colaborador_id || user?.id || '',
    };
  }, [modal, editando, tituloInicial, conversa, user, proxima]);

  const handleSave = (data) => {
    if (editando && onEditar) {
      onEditar({ ...proxima, ...data });
    } else {
      onCriar(data);
    }
    setModal(false);
    setEditando(false);
  };

  const nomeColaborador = (id) => {
    if (!id) return null;
    const colab = colaboradores.find(c => c.id === id);
    return colab?.nome || null;
  };

  const obterResponsaveis = (tarefa) => {
    if (!tarefa) return [];
    const result = [];
    if (tarefa.responsavel_principal_id) {
      result.push({
        id: tarefa.responsavel_principal_id,
        nome: tarefa.responsavel_principal_nome || nomeColaborador(tarefa.responsavel_principal_id) || 'Responsável',
        principal: true,
      });
    }
    let outrosIds = [];
    try {
      outrosIds = tarefa.responsaveis_ids ? JSON.parse(tarefa.responsaveis_ids) : [];
    } catch {}
    outrosIds.forEach(id => {
      if (id && !result.find(r => r.id === id)) {
        result.push({ id, nome: nomeColaborador(id) || 'Responsável', principal: false });
      }
    });
    return result;
  };

  const responsaveis = obterResponsaveis(proxima);
  const respPrincipal = responsaveis.find(r => r.principal) || responsaveis[0];

  if (!proxima) {
    return (
      <>
        <button onClick={() => abrirNova()} className="mx-3 mt-2 mb-1 flex items-center justify-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100">
          <Plus className="h-4 w-4" /> Criar próxima ação
        </button>
        <TarefaFormModal
          open={modal}
          onOpenChange={(v) => { setModal(v); if (!v) setEditando(false); }}
          tarefa={tarefaPreenchida}
          onSave={handleSave}
          colaboradores={colaboradores}
          clientes={clientes}
          statusList={statusList}
          templates={[]}
          tiposList={[]}
          setoresList={setores}
          subsetoresList={subsetores}
          currentUser={user}
          empresaId={empresaId}
        />
      </>
    );
  }

  return (
    <>
      <div className={`mx-3 mt-2 mb-1 rounded-xl border px-3 py-2 shadow-sm ${vencida ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
        <div className="flex items-center gap-2">
          <ClipboardList className={`h-4 w-4 shrink-0 ${vencida ? 'text-red-600' : 'text-amber-700'}`} />
          <button onClick={() => setAberto(v => !v)} className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wide ${vencida ? 'text-red-700' : 'text-amber-800'}`}>Próxima ação</span>
              {ordenadas.length > 1 && <span className="rounded-full bg-white/80 px-1.5 text-[10px] font-bold">+{ordenadas.length - 1}</span>}
            </div>
            <p className="truncate text-sm font-semibold text-slate-800">{proxima.titulo}</p>
          </button>
          <button onClick={() => setAberto(v => !v)} className="rounded p-1 text-slate-500">{aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
        </div>
        {aberto && (
          <div className="mt-2 border-t border-black/5 pt-2">
            {proxima.descricao && <p className="mb-2 text-xs text-slate-600">{proxima.descricao}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[11px] font-semibold ${vencida ? 'text-red-600' : 'text-amber-700'}`}><Clock className="mr-1 inline h-3 w-3" />{vencida ? 'Vencida · ' : ''}{prazoTexto(proxima.vencimento_em)}</span>
              {respPrincipal && (
                <button
                  onClick={() => setRespOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-white"
                  title="Ver responsáveis"
                >
                  <User className="h-3 w-3" />
                  <span className="max-w-[100px] truncate">{respPrincipal.nome}</span>
                  {responsaveis.length > 1 && <span className="text-slate-400">+{responsaveis.length - 1}</span>}
                </button>
              )}
              <div className="ml-auto flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={abrirEdicao} title="Editar tarefa"><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={salvando} onClick={() => onAdiar(proxima)}><Clock className="mr-1 h-3 w-3" />Adiar</Button>
                <Button size="sm" className="h-7 bg-emerald-600 px-2 text-[11px] hover:bg-emerald-700" disabled={salvando} onClick={() => onConcluir(proxima)}>{salvando ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}Concluir</Button>
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => abrirNova()} title="Nova tarefa"><Plus className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <MicrotarefaChecklistComentarios tarefa={proxima} empresaId={empresaId} user={user} />
          </div>
        )}
      </div>
      <TarefaFormModal
        open={modal}
        onOpenChange={(v) => { setModal(v); if (!v) setEditando(false); }}
        tarefa={tarefaPreenchida}
        onSave={handleSave}
        colaboradores={colaboradores}
        clientes={clientes}
        statusList={statusList}
        templates={[]}
        tiposList={[]}
        setoresList={setores}
        subsetoresList={subsetores}
        currentUser={user}
        empresaId={empresaId}
      />

      {/* Dialog - Ver responsáveis */}
      <Dialog open={respOpen} onOpenChange={setRespOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-amber-700" />
              Responsáveis pela tarefa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm font-medium text-slate-800">{proxima.titulo}</p>
            {responsaveis.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Nenhum responsável atribuído.</p>
            ) : (
              <div className="space-y-1.5">
                {responsaveis.map(r => (
                  <div key={r.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-bold text-white">
                      {r.nome?.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{r.nome}</p>
                      {r.principal && <span className="text-[10px] font-semibold text-amber-700">Responsável principal</span>}
                    </div>
                    {r.principal && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRespOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}