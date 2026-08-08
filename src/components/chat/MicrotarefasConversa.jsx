import React, { useMemo, useState } from 'react';
import { ClipboardList, Plus, Check, Clock, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

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

const dataLocalInput = (dias = 0) => {
  const d = new Date(Date.now() + dias * 86400000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

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

export default function MicrotarefasConversa({ tarefas = [], onCriar, onConcluir, onAdiar, salvando = false }) {
  const [aberto, setAberto] = useState(true);
  const [modal, setModal] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [vencimento, setVencimento] = useState(dataLocalInput(0));
  const [prioridade, setPrioridade] = useState('media');

  const ordenadas = useMemo(() => [...tarefas].sort((a, b) =>
    new Date(a.vencimento_em || a.data_conclusao_prevista || 0) - new Date(b.vencimento_em || b.data_conclusao_prevista || 0)
  ), [tarefas]);
  const proxima = ordenadas[0];
  const vencida = proxima?.vencimento_em && new Date(proxima.vencimento_em) < new Date();

  const abrirNova = (acao = '') => {
    setTitulo(acao);
    setDescricao('');
    setVencimento(dataLocalInput(0));
    setPrioridade('media');
    setModal(true);
  };

  const salvar = async () => {
    if (!titulo.trim() || !vencimento) return;
    await onCriar({ titulo: titulo.trim(), descricao: descricao.trim(), vencimento_em: new Date(vencimento).toISOString(), prioridade });
    setModal(false);
  };

  if (!proxima) {
    return (
      <>
        <button onClick={() => abrirNova()} className="mx-3 mt-2 mb-1 flex items-center justify-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100">
          <Plus className="h-4 w-4" /> Criar próxima ação
        </button>
        <Dialog open={modal} onOpenChange={setModal}>
          <Formulario titulo={titulo} setTitulo={setTitulo} descricao={descricao} setDescricao={setDescricao} vencimento={vencimento} setVencimento={setVencimento} prioridade={prioridade} setPrioridade={setPrioridade} salvar={salvar} salvando={salvando} abrirNova={abrirNova} />
        </Dialog>
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
              <div className="ml-auto flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={salvando} onClick={() => onAdiar(proxima)}><Clock className="mr-1 h-3 w-3" />Adiar</Button>
                <Button size="sm" className="h-7 bg-emerald-600 px-2 text-[11px] hover:bg-emerald-700" disabled={salvando} onClick={() => onConcluir(proxima)}>{salvando ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}Concluir</Button>
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => abrirNova()} title="Nova microtarefa"><Plus className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </div>
        )}
      </div>
      <Dialog open={modal} onOpenChange={setModal}>
        <Formulario titulo={titulo} setTitulo={setTitulo} descricao={descricao} setDescricao={setDescricao} vencimento={vencimento} setVencimento={setVencimento} prioridade={prioridade} setPrioridade={setPrioridade} salvar={salvar} salvando={salvando} abrirNova={abrirNova} />
      </Dialog>
    </>
  );
}

function Formulario({ titulo, setTitulo, descricao, setDescricao, vencimento, setVencimento, prioridade, setPrioridade, salvar, salvando, abrirNova }) {
  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Nova microtarefa</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Ação rápida</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">{ACOES_RAPIDAS.map(a => <button key={a} onClick={() => setTitulo(a)} className={`rounded-full border px-2.5 py-1 text-[11px] ${titulo === a ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{a}</button>)}</div>
        </div>
        <div><Label>O que precisa ser feito?</Label><Input className="mt-1" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex.: Solicitar boleto atualizado" autoFocus /></div>
        <div><Label>Observação (opcional)</Label><Textarea className="mt-1" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Informações importantes para executar a tarefa" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Prazo</Label><Input className="mt-1" type="datetime-local" value={vencimento} onChange={e => setVencimento(e.target.value)} /></div>
          <div><Label>Prioridade</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={prioridade} onChange={e => setPrioridade(e.target.value)}><option value="baixa">Baixa</option><option value="media">Normal</option><option value="alta">Importante</option><option value="urgente">Urgente</option></select></div>
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => abrirNova('')}>Limpar</Button><Button onClick={salvar} disabled={salvando || !titulo.trim() || !vencimento} className="bg-amber-500 text-amber-950 hover:bg-amber-600">{salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar microtarefa</Button></DialogFooter>
    </DialogContent>
  );
}
