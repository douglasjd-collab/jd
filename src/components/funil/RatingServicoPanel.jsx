import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';
const inicio = o => ({
  rating_valor_servico:o.rating_valor_servico ?? o.valor_estimado ?? 0,
  rating_instituicao:o.rating_instituicao||'',rating_data_contratacao:o.rating_data_contratacao||'',
  rating_documentacao:o.rating_documentacao||'pendente',rating_documentos_pendentes:o.rating_documentos_pendentes||'',
  rating_resultado:o.rating_resultado||'',rating_resultado_apresentado:o.rating_resultado_apresentado||false,
});
export function RatingFollowUpResumo({ oportunidade:o }) {
  if(o.produto!=='rating_bancrio') return null;
  const fechado=['ganha','perdida'].includes(o.status);
  return <div className="rounded-lg border border-violet-200 bg-violet-50 p-2 text-xs text-violet-800 my-2">
    <p className="font-semibold">{fechado?'Acompanhamento encerrado':o.rating_followup_pausado?'Follow-up pausado':'Follow-up do Rating'}</p>
    {!fechado && o.rating_followup_proximo_em && !o.rating_followup_pausado && <>
      <p>{o.rating_followup_acao||'Próxima ação'} · {new Date(o.rating_followup_proximo_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</p>
      <p>Tentativa {o.rating_followup_tentativa} de {o.rating_followup_total}</p>
    </>}
    {!fechado && <p>{o.rating_followup_motivo||(!o.rating_followup_proximo_em?'Aguardando programação da etapa':'')}</p>}
  </div>;
}
export default function RatingServicoPanel({ oportunidade:o }) {
  const queryClient=useQueryClient();
  const [dados,setDados]=useState(()=>inicio(o));
  const [receitaId,setReceitaId]=useState(o.rating_receita_id||'selecionar');
  const [pending,setPending]=useState('');
  const [planejamentoId,setPlanejamentoId]=useState(o.rating_planejamento_id||'');
  useEffect(()=>{setDados(inicio(o));setReceitaId(o.rating_receita_id||'selecionar');setPlanejamentoId(o.rating_planejamento_id||'');},[o.id]);
  const {data:receitas=[]}=useQuery({
    queryKey:['receitas-rating',o.empresa_id,o.cliente_id],
    queryFn:()=>base44.entities.Receita.filter({empresa_id:o.empresa_id},'-data',500),
    enabled:o.produto==='rating_bancrio',
  });
  if(o.produto!=='rating_bancrio') return null;
  const concluido=o.status==='ganha', encerrado=concluido||o.status==='perdida';
  const relacionadas=receitas.filter(r=>r.status!=='cancelada'&&(r.id===o.rating_receita_id||
    (o.cliente_id&&r.cliente_id===o.cliente_id)||/rating/i.test(r.descricao||r.categoria_nome||'')));
  const receita=receitas.find(r=>r.id===(o.rating_receita_id||receitaId));
  const campo=(key,value)=>setDados(prev=>({...prev,[key]:value}));
  const executar=async(acao)=>{
    if(acao==='concluir'&&receitaId==='selecionar'){toast.error('Escolha a receita já lançada ou confirme uma nova cobrança pendente');return;}
    setPending(acao);
    try{
      const resp=await base44.functions.invoke('gerenciarServicoRating',{oportunidade_id:o.id,acao,dados,
        receita_id:receitaId!=='selecionar'&&receitaId!=='nova'?receitaId:undefined,criar_cobranca:receitaId==='nova'});
      if(!resp.data?.success) throw new Error(resp.data?.error||'Não foi possível concluir a ação');
      if(resp.data.resultado?.planejamento_id)setPlanejamentoId(resp.data.resultado.planejamento_id);
      for(const key of ['oportunidade','oportunidades','movimentacoes-oportunidade','receitas-transacoes','receitas-rating','oportunidades-funil-chat'])queryClient.invalidateQueries({queryKey:[key]});
      toast.success(acao==='concluir'?'Rating concluído. Receita vinculada ao serviço.':acao==='planejar'?'Planejamento criado para o mesmo cliente.':'Atualizado!');
    }catch(e){toast.error(e.message);}finally{setPending('');}
  };
  return <section className="rounded-xl border border-violet-200 bg-white shadow-sm overflow-hidden md:col-span-2 xl:col-span-3">
    <div className="border-b border-violet-200 bg-violet-50 px-4 py-3"><h3 className="font-semibold text-violet-900">Serviço de Rating Bancário</h3>
      <p className="text-xs text-violet-700">Conclua o serviço após apresentar o resultado. O crédito será acompanhado em uma oportunidade separada.</p></div>
    <div className="p-4 space-y-4">
      <RatingFollowUpResumo oportunidade={o}/>
      {!encerrado && <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={!!pending} onClick={()=>executar(o.rating_followup_pausado?'retomar':'pausar')}>{o.rating_followup_pausado?'Retomar follow-up':'Pausar follow-up'}</Button>
        <span className="text-xs text-slate-500">Dias úteis, 08h às 18h · horários e mensagens editáveis em Automação de Funis.</span>
      </div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div><Label>Valor do serviço (R$)</Label><Input type="number" min="0" step="0.01" disabled={encerrado} value={dados.rating_valor_servico} onChange={e=>campo('rating_valor_servico',e.target.value)}/></div>
        <div><Label>Instituição financeira</Label><Input disabled={encerrado} value={dados.rating_instituicao} onChange={e=>campo('rating_instituicao',e.target.value)}/></div>
        <div><Label>Data da contratação</Label><Input type="date" disabled={encerrado} value={dados.rating_data_contratacao} onChange={e=>campo('rating_data_contratacao',e.target.value)}/></div>
        <div><Label>Documentação</Label><Select disabled={encerrado} value={dados.rating_documentacao} onValueChange={v=>campo('rating_documentacao',v)}>
          <SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="completa">Completa</SelectItem></SelectContent></Select></div>
        <div className="sm:col-span-2"><Label>Documentos ainda pendentes</Label><Input disabled={encerrado} value={dados.rating_documentos_pendentes} onChange={e=>campo('rating_documentos_pendentes',e.target.value)} placeholder="Informe somente o que falta para este cliente"/></div>
      </div>
      <div><Label>Resultado e orientações apresentadas</Label><Textarea disabled={encerrado} value={dados.rating_resultado} onChange={e=>campo('rating_resultado',e.target.value)} placeholder="Registre a conclusão da análise e as orientações para o cliente."/></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={encerrado} checked={dados.rating_resultado_apresentado} onChange={e=>campo('rating_resultado_apresentado',e.target.checked)}/>Resultado apresentado ao cliente</label>
      <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
        <Label>Receita do serviço</Label>
        {!encerrado&&<Select value={receitaId} onValueChange={setReceitaId}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
          <SelectItem value="selecionar">Escolha como registrar no financeiro</SelectItem>
          <SelectItem value="nova">Criar cobrança pendente ao concluir</SelectItem>
          {relacionadas.map(r=><SelectItem key={r.id} value={r.id}>{r.descricao||r.cliente_nome} — R$ {Number(r.valor).toFixed(2)} · {r.status}</SelectItem>)}
        </SelectContent></Select>}
        <p className="text-xs text-slate-600">{receita?.status==='recebida'?'Pagamento recebido e vinculado.':receita?'Pagamento pendente no financeiro.':receitaId==='nova'?'Será criada uma receita pendente. Registre o recebimento na Central Financeira.':'Se o pagamento já foi lançado, selecione a receita existente para evitar duplicidade.'}</p>
      </div>
      <div className="flex flex-wrap gap-2 justify-end">
        {!encerrado&&<><Button variant="outline" disabled={!!pending} onClick={()=>executar('salvar')}>Salvar dados</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!!pending||!dados.rating_resultado_apresentado} onClick={()=>executar('concluir')}>{pending==='concluir'?'Concluindo...':'Concluir Rating — Ganho'}</Button></>}
        {concluido&&(planejamentoId||o.rating_planejamento_id?<Button asChild><a href={createPageUrl('OportunidadeDetalhes?id='+(planejamentoId||o.rating_planejamento_id))}>Abrir Planejamento de Compra e Crédito</a></Button>:<Button disabled={!!pending} onClick={()=>executar('planejar')}>Iniciar Planejamento de Compra</Button>)}
      </div>
    </div>
  </section>;
}
