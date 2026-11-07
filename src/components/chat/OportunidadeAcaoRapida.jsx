import React, { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { moverOportunidade } from '@/components/funil/moverOportunidade';
import { ModalVenda } from '@/components/funil/FunilModais';
import OportunidadeAbaHistorico from '@/components/oportunidade/OportunidadeAbaHistorico';
import { formatDateTimeBR } from '@/components/utils/dateHelpers';

const titulos = { mover: 'Mover etapa', editar: 'Editar negociação', anotar: 'Adicionar anotação', historico: 'Histórico da negociação' };
const datas = ['data_fechamento_prevista', 'data_pre_fechamento', 'data_proximo_contato'];
const campos = ['titulo', 'valor_estimado', 'origem', 'telefone_lead', ...datas, 'motivo_proximo_contato', 'observacoes'];

export default function OportunidadeAcaoRapida({ oportunidadeId, acao, onClose, currentUser }) {
  const queryClient = useQueryClient();
  const [venda, setVenda] = useState(null);
  const { data: oportunidade, isPending, isError, refetch } = useQuery({
    queryKey: ['oportunidade', oportunidadeId],
    queryFn: () => base44.entities.Oportunidade.get(oportunidadeId),
    enabled: !!oportunidadeId,
    staleTime: 0,
  });
  const atualizar = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['oportunidade', oportunidadeId] }),
      queryClient.invalidateQueries({ queryKey: ['oportunidades-conversa'] }),
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] }),
      queryClient.invalidateQueries({ queryKey: ['comentarios-oportunidade', oportunidadeId] }),
      queryClient.invalidateQueries({ queryKey: ['movimentacoes-oportunidade', oportunidadeId] }),
    ]);
  };
  const salvo = async (resultado) => {
    await atualizar();
    if (resultado?.abrirFormVenda) setVenda(resultado.oportunidade);
    else onClose();
  };
  return (
    <>
      <Dialog open={!venda} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{titulos[acao]}</DialogTitle>
            <p className="text-sm text-slate-500">{oportunidade?.titulo || 'Carregando oportunidade…'}</p>
          </DialogHeader>
          {isPending ? <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin" /> :
            isError || !oportunidade ? <div className="space-y-3 text-sm"><p>Não foi possível carregar a oportunidade.</p><Button onClick={() => refetch()}>Tentar novamente</Button></div> :
              <FormularioAcao key={oportunidadeId + acao} oportunidade={oportunidade} acao={acao} currentUser={currentUser} onClose={onClose} onSave={salvo} />}
        </DialogContent>
      </Dialog>
      {venda && <ModalVenda open={true} onOpenChange={(v) => { if (!v) onClose(); }} oportunidade={venda} currentUser={currentUser} onSuccess={async () => { await atualizar(); onClose(); }} />}
    </>
  );
}

function FormularioAcao({ oportunidade, acao, currentUser, onClose, onSave }) {
  const [form, setForm] = useState(() => Object.fromEntries(campos.map(c => [c, oportunidade[c] ?? ''])));
  const versaoInicial = useRef(oportunidade.updated_date);
  const [etapaId, setEtapaId] = useState(oportunidade.etapa_id || '');
  const [texto, setTexto] = useState('');
  const bloqueio = useRef(false);
  const { data: etapas = [], isPending: carregandoEtapas, isError: erroEtapas } = useQuery({
    queryKey: ['etapas-funil', oportunidade.empresa_id],
    queryFn: () => base44.entities.EtapaFunil.filter({ empresa_id: oportunidade.empresa_id }, 'ordem', 500),
    enabled: acao === 'mover',
    staleTime: 30000,
  });
  const { data: comentarios = [], isError: erroComentarios } = useQuery({
    queryKey: ['comentarios-oportunidade', oportunidade.id],
    queryFn: () => base44.entities.ComentarioOportunidade.filter({ oportunidade_id: oportunidade.id }, '-created_date', 100),
    enabled: acao === 'anotar' || acao === 'historico',
  });
  const { data: movimentacoes = [] } = useQuery({
    queryKey: ['movimentacoes-oportunidade', oportunidade.id],
    queryFn: () => base44.entities.MovimentacaoFunil.filter({ oportunidade_id: oportunidade.id }, '-created_date', 100),
    enabled: acao === 'historico',
  });
  const destino = etapas.find(e => e.id === etapaId);
  const etapasDisponiveis = etapas.filter(e => e.produto === oportunidade.produto && e.status !== 'inativa');
  const precisaCliente = destino?.requer_cliente && !oportunidade.cliente_id;
  const exigeMotivo = destino?.tipo === 'perdida';
  const salvar = useMutation({
    mutationFn: async () => {
      const usuario = await base44.auth.me();
      if (!usuario?.id) throw new Error('Faça login novamente para salvar.');
      if (acao === 'mover') {
        if (!destino || destino.produto !== oportunidade.produto) throw new Error('Selecione uma etapa deste funil.');
        if (precisaCliente) throw new Error('Vincule o cliente à oportunidade antes de avançar para esta etapa.');
        if (exigeMotivo && !texto.trim()) throw new Error('Informe o motivo da perda.');
        return moverOportunidade({
          oportunidadeId: oportunidade.id, novaEtapaId: etapaId, etapas, currentUser,
          observacao: texto.trim(),
        });
      }
      if (acao === 'editar') {
        if (!form.titulo.trim()) throw new Error('Informe o título da negociação.');
        const valor = Number(form.valor_estimado || 0);
        if (!Number.isFinite(valor) || valor < 0) throw new Error('Informe um valor estimado válido.');
        const atual = await base44.entities.Oportunidade.get(oportunidade.id);
        if (versaoInicial.current && atual.updated_date !== versaoInicial.current) throw new Error('A negociação foi atualizada por outra pessoa. Feche e abra a edição para carregar os dados atuais.');
        const alteracoes = {};
        for (const campo of campos) {
          const valorCampo = campo === 'valor_estimado' ? valor : datas.includes(campo) ? (form[campo] || null) : form[campo];
          if (String(valorCampo ?? '') !== String(oportunidade[campo] ?? '')) alteracoes[campo] = valorCampo;
        }
        if (!Object.keys(alteracoes).length) return;
        await base44.entities.Oportunidade.update(oportunidade.id, alteracoes);
        await base44.entities.LogAuditoria.create({
          usuario_id: usuario.id, usuario_nome: usuario.full_name,
          acao: 'Editou negociação pelo bate-papo: ' + oportunidade.titulo,
          entidade: 'Oportunidade', entidade_id: oportunidade.id, tipo: 'edicao',
        });
        return;
      }
      if (acao === 'anotar') {
        if (!texto.trim()) throw new Error('Digite a anotação.');
        await base44.entities.ComentarioOportunidade.create({
          oportunidade_id: oportunidade.id, empresa_id: oportunidade.empresa_id,
          usuario_id: usuario.id, usuario_nome: usuario.nome_perfil || usuario.full_name || '',
          mensagem: texto.trim(), tipo: 'comentario',
        });
        await base44.entities.Oportunidade.update(oportunidade.id, { data_ultima_movimentacao: new Date().toISOString() });
      }
    },
    onSuccess: async (resultado) => {
      toast.success(acao === 'mover' ? 'Etapa atualizada!' : acao === 'editar' ? 'Negociação salva!' : 'Anotação registrada!');
      await onSave(resultado);
    },
    onError: (erro) => toast.error(erro.message || 'Não foi possível salvar.'),
    onSettled: () => { bloqueio.current = false; },
  });
  const enviar = (e) => {
    e.preventDefault();
    if (bloqueio.current) return;
    bloqueio.current = true;
    salvar.mutate();
  };
  const campo = (chave, valor) => setForm(f => ({ ...f, [chave]: valor }));
  if (acao === 'historico') return <OportunidadeAbaHistorico oportunidade={oportunidade} movimentacoes={movimentacoes} comentarios={comentarios} />;
  return (
    <form onSubmit={enviar} className="space-y-4">
      {acao === 'mover' && <>
        <div className="space-y-1">
          <Label htmlFor="etapa-rapida">Nova etapa</Label>
          <select id="etapa-rapida" className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={etapaId} onChange={e => setEtapaId(e.target.value)} disabled={carregandoEtapas || salvar.isPending}>
            <option value="">Selecione a etapa</option>
            {etapasDisponiveis.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          {erroEtapas && <p className="text-xs text-red-600">Não foi possível carregar as etapas. Feche e tente novamente.</p>}
          {precisaCliente && <p className="text-xs text-amber-700">Esta etapa exige cliente vinculado. Faça o vínculo em “Editar negociação” no funil completo.</p>}
          {destino?.requer_documentos && <p className="text-xs text-amber-700">Esta etapa exige documentos. Confira os anexos no card antes de avançar.</p>}
          {destino?.tipo === 'ganho' && !oportunidade.venda_id && <p className="text-xs text-blue-700">Após salvar, será aberto o formulário de registro da venda.</p>}
        </div>
        <div className="space-y-1"><Label htmlFor="motivo-movimento">{exigeMotivo ? 'Motivo da perda *' : 'Observação da movimentação (opcional)'}</Label><Textarea id="motivo-movimento" value={texto} onChange={e => setTexto(e.target.value)} required={exigeMotivo} maxLength={5000} /></div>
      </>}
      {acao === 'editar' && <>
        <div className="space-y-1"><Label htmlFor="negociacao-titulo">Título *</Label><Input id="negociacao-titulo" value={form.titulo} onChange={e => campo('titulo', e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="negociacao-valor">Valor estimado (R$)</Label><Input id="negociacao-valor" type="number" min="0" step="0.01" value={form.valor_estimado} onChange={e => campo('valor_estimado', e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="negociacao-origem">Origem</Label><Input id="negociacao-origem" value={form.origem} onChange={e => campo('origem', e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="negociacao-fechamento">Previsão de fechamento</Label><Input id="negociacao-fechamento" type="date" value={form.data_fechamento_prevista} onChange={e => campo('data_fechamento_prevista', e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="negociacao-pre">Pré-fechamento</Label><Input id="negociacao-pre" type="date" value={form.data_pre_fechamento} onChange={e => campo('data_pre_fechamento', e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="negociacao-retorno">Próximo contato</Label><Input id="negociacao-retorno" type="date" value={form.data_proximo_contato} onChange={e => campo('data_proximo_contato', e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="negociacao-telefone">Telefone do lead</Label><Input id="negociacao-telefone" value={form.telefone_lead} onChange={e => campo('telefone_lead', e.target.value)} /></div>
        </div>
        <div className="space-y-1"><Label htmlFor="negociacao-motivo">Assunto do próximo contato</Label><Input id="negociacao-motivo" value={form.motivo_proximo_contato} onChange={e => campo('motivo_proximo_contato', e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="negociacao-resumo">Informações importantes da negociação</Label><Textarea id="negociacao-resumo" rows={4} value={form.observacoes} onChange={e => campo('observacoes', e.target.value)} placeholder="Necessidade do cliente, condições combinadas e pontos importantes…" /></div>
      </>}
      {acao === 'anotar' && <>
        <div className="space-y-1"><Label htmlFor="anotacao-negociacao">Nova anotação</Label><Textarea id="anotacao-negociacao" autoFocus rows={4} value={texto} onChange={e => setTexto(e.target.value)} required maxLength={10000} placeholder="Registre o que foi conversado com o cliente…" /><p className="text-xs text-slate-500">Registro interno da negociação, com seu nome, data e horário.</p></div>
        <details className="rounded-md border p-3 text-sm"><summary className="cursor-pointer font-medium">Anotações anteriores</summary><div className="mt-2 max-h-48 space-y-3 overflow-y-auto">{erroComentarios ? <p>Não foi possível carregar as anotações.</p> : comentarios.length === 0 ? <p className="text-slate-500">Nenhuma anotação registrada.</p> : comentarios.map(c => <div key={c.id}><p className="text-xs text-slate-500">{c.usuario_nome} · {formatDateTimeBR(c.created_date)}</p><p className="whitespace-pre-wrap break-words">{c.mensagem}</p></div>)}</div></details>
      </>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={salvar.isPending} onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={!currentUser || salvar.isPending || (acao === 'mover' && (carregandoEtapas || erroEtapas || !destino || etapaId === oportunidade.etapa_id || precisaCliente)) || (acao === 'anotar' && !texto.trim())}>
          {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {acao === 'mover' ? 'Salvar etapa' : acao === 'anotar' ? 'Salvar anotação' : 'Salvar negociação'}
        </Button>
      </DialogFooter>
    </form>
  );
}
