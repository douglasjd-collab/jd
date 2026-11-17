import { createClientFromRequest } from 'npm:@base44/sdk@0.8.62';
import { RATING, EMPRESA_RATING, AGENTE_RATING, cicloRating, millis, proximaAcaoRating, motivoPausaRating, resolverTextoRating } from '../../shared/ratingShared.ts';

const telefone = (t: any) => { const n = String(t || '').replace(/\D/g,''); return n.length >= 10 && n.length <= 11 ? '55'+n : n; };
export async function reservarRating(db: any, dados: any) {
  if ((await db.HistoricoAutomacao.filter({ chave_execucao:dados.chave_execucao }, 'created_date', 10)).length) return null;
  const reserva = await db.HistoricoAutomacao.create({...dados,status:'processando'});
  const concorrentes = await db.HistoricoAutomacao.filter({ chave_execucao:dados.chave_execucao }, 'created_date', 100);
  concorrentes.sort((a:any,b:any) => String(a.created_date || '').localeCompare(String(b.created_date || '')) || String(a.id).localeCompare(String(b.id)));
  if (concorrentes[0]?.id !== reserva.id) {
    await db.HistoricoAutomacao.update(reserva.id,{status:'cancelado',motivo_ignorado:'Outra execução já reservou este acompanhamento'});
    return null;
  }
  return reserva;
}
async function alertaRating(db: any, o: any, mensagem: string, agora: Date, conversa: any = null) {
  const data = agora.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
  const existentes = await db.AlertaFunilContato.filter({empresa_id:o.empresa_id,oportunidade_id:o.id,data_alerta:data,motivo:mensagem},null,1);
  if (!existentes.length) await db.AlertaFunilContato.create({
    empresa_id:o.empresa_id,oportunidade_id:o.id,oportunidade_titulo:o.titulo,cliente_nome:o.cliente_nome||o.titulo,
    cliente_telefone:o.telefone_lead||o.cliente_telefone||'',conversa_id:conversa?.id||'',
    responsavel_id:o.vendedor_id||'',responsavel_nome:o.vendedor_nome||'',data_alerta:data,
    motivo:mensagem,tipo_alerta:'proximo_contato',status:'ativo',lido:false,whatsapp_enviado:false,
  });
}
export async function processarRating(api: any, agora = new Date(), dryRun = false) {
  const db = api.asServiceRole.entities;
  const autos = await db.AutomacaoFunil.filter({empresa_id:EMPRESA_RATING,motor:'rating_v1',funil:RATING,ativo:true},'ordem',100);
  if (!autos.length) return {success:true,processados:0,simulacao:dryRun};
  const oportunidades = await db.Oportunidade.filter({empresa_id:EMPRESA_RATING,produto:RATING,status:'aberta'},'created_date',1000);
  const etapas = await db.EtapaFunil.filter({empresa_id:EMPRESA_RATING,produto:RATING,status:'ativa'},'ordem',100);
  const resultados:any[]=[];
  for (const inicial of oportunidades) {
    let o = inicial;
    if (!etapas.some((e:any) => e.id === o.etapa_id && !['ganho','perdida'].includes(e.tipo))) continue;
    let historico = await db.HistoricoAutomacao.filter({empresa_id:o.empresa_id,oportunidade_id:o.id},'-enviado_em',1000);
    const acao = proximaAcaoRating(o,autos,historico);
    if (!acao) continue;
    const {auto,ciclo,base} = acao;
    if (dryRun) { resultados.push({oportunidade_id:o.id,acao:auto.nome,proximo_em:acao.data,canal:auto.canal}); continue; }
    const numero=telefone(o.telefone_lead||o.cliente_telefone);
    const alternativas=[...new Set([numero,numero.startsWith('55')?numero.slice(2):numero,o.telefone_lead,o.cliente_telefone].filter(Boolean))];
    const conversas=alternativas.length ? await db.ConversaWhatsapp.filter({empresa_id:o.empresa_id,cliente_telefone:{$in:alternativas}},'-data_ultima_mensagem',50) : [];
    const mensagens:any[]=[];
    for (const c of conversas) mensagens.push(...await db.MensagemWhatsapp.filter({empresa_id:o.empresa_id,conversa_id:c.id,data_envio:{$gt:new Date(base).toISOString()}},'-data_envio',500));
    const conversa=conversas[0]||null;
    if (o.rating_receita_id) {
      const receita=await db.Receita.get(o.rating_receita_id).catch(()=>null);
      if (receita?.empresa_id===o.empresa_id) o={...o,rating_pagamento_status:receita.status==='recebida'?'pago':'pendente'};
    }
    const motivo=conversas.map((c:any)=>motivoPausaRating(o,auto,c,mensagens,base,historico,agora)).find(Boolean) ||
      motivoPausaRating(o,auto,null,mensagens,base,historico,agora);
    if (motivo) {
      await db.Oportunidade.update(o.id,{rating_followup_pausado:true,rating_followup_motivo:motivo,rating_followup_ciclo:ciclo,rating_followup_proximo_em:null});
      await alertaRating(db,o,motivo,agora,conversa);
      resultados.push({oportunidade_id:o.id,status:'pausado',motivo}); continue;
    }
    await db.Oportunidade.update(o.id,{rating_followup_ciclo:ciclo,rating_followup_pausado:false,rating_followup_proximo_em:acao.data||null,
      rating_followup_tentativa:acao.tentativa,rating_followup_total:acao.total,rating_followup_acao:auto.canal==='interno'?'Alerta ao responsável':'Heitor — WhatsApp'});
    if (!acao.data || millis(acao.data)>agora.getTime()) continue;
    const atual=await db.Oportunidade.get(o.id);
    if (atual.status!=='aberta'||cicloRating(atual)!==ciclo||atual.rating_followup_pausa_manual) continue;
    const texto=resolverTextoRating(auto.mensagem,atual);
    const reserva=await reservarRating(db,{empresa_id:o.empresa_id,oportunidade_id:o.id,oportunidade_titulo:o.titulo,
      automacao_id:auto.id,automacao_nome:auto.nome,etapa_id:o.etapa_id,ciclo_id:ciclo,
      chave_execucao:[o.id,ciclo,auto.id].join('__'),telefone:numero,mensagem_enviada:texto,enviado_em:agora.toISOString()});
    if (!reserva) continue;
    try {
      if(auto.canal==='interno'){
        await alertaRating(db,o,texto,agora,conversa);
        await db.HistoricoAutomacao.update(reserva.id,{status:'alerta'});
      } else {
        if(!numero||!conversa) throw new Error('Sem conversa vinculada para verificar respostas e enviar pelo canal correto');
        const recente=await db.ConversaWhatsapp.get(conversa.id);
        const novas=await db.MensagemWhatsapp.filter({empresa_id:o.empresa_id,conversa_id:recente.id,data_envio:{$gt:new Date(base).toISOString()}},'-data_envio',500);
        const pausa=motivoPausaRating(atual,auto,recente,novas,base,historico,agora);
        const ultimo=await db.Oportunidade.get(o.id);
        const autoAtual=await db.AutomacaoFunil.get(auto.id);
        if(pausa||!autoAtual.ativo||ultimo.status!=='aberta'||ultimo.rating_followup_pausa_manual||cicloRating(ultimo)!==ciclo) {
          await db.HistoricoAutomacao.update(reserva.id,{status:'cancelado',motivo_ignorado:pausa||'Etapa, status ou configuração alterada'}); continue;
        }
        const conexao=recente.connection_id ? await db.WhatsappConnection.get(recente.connection_id) : null;
        if(conexao?.empresa_id!==o.empresa_id||conexao?.provider_type!=='dapi'||!conexao?.is_active||conexao.status!=='conectado') throw new Error('Conexão D-API da conversa indisponível: responsável deve conferir o canal');
        const out=await api.asServiceRole.functions.invoke('whatsappService',{connectionId:conexao.id,action:'sendText',phoneNumber:numero,text:texto});
        const dado=out?.data||out;
        if(dado?.error||dado?.success===false) throw new Error(dado.error||'Envio não confirmado');
        // Marcar o envio antes das gravações auxiliares: erro de histórico não autoriza repetir WhatsApp.
        await db.HistoricoAutomacao.update(reserva.id,{status:'enviado',enviado_em:agora.toISOString()});
        await db.MensagemWhatsapp.create({empresa_id:o.empresa_id,conversa_id:recente.id,remetente:'vendedor',usuario_id:AGENTE_RATING,
          usuario_nome:'IA • Heitor — Follow-up do Rating',tipo_conteudo:'texto',texto,provider:'dapi',data_envio:agora.toISOString(),status:'enviada',
          whatsapp_message_id:dado?.messageId||dado?.id||dado?.data?.key?.id||''});
        const depois=await db.ConversaWhatsapp.get(recente.id);
        if(millis(depois.data_ultima_mensagem)<=agora.getTime()) await db.ConversaWhatsapp.update(recente.id,{ultima_mensagem:texto.slice(0,200),data_ultima_mensagem:agora.toISOString(),ultimo_remetente:'vendedor'});
      }
      historico=await db.HistoricoAutomacao.filter({empresa_id:o.empresa_id,oportunidade_id:o.id},'-enviado_em',1000);
      const proxima=proximaAcaoRating(atual,autos,historico);
      await db.Oportunidade.update(o.id,{rating_followup_proximo_em:proxima?.data||null,rating_followup_tentativa:proxima?.tentativa||acao.tentativa,
        rating_followup_motivo:proxima?'':'Sequência concluída; aguardando responsável'});
      resultados.push({oportunidade_id:o.id,status:auto.canal==='interno'?'alerta':'enviado'});
    } catch(e) {
      // Não repetir automaticamente um envio com resultado incerto.
      const h=await db.HistoricoAutomacao.get(reserva.id);
      if(h.status!=='enviado') await db.HistoricoAutomacao.update(reserva.id,{status:'erro',erro_detalhe:String(e.message).slice(0,500)});
      await db.Oportunidade.update(o.id,{rating_followup_pausado:true,rating_followup_motivo:'Conferir acompanhamento: '+String(e.message).slice(0,250),rating_followup_ciclo:ciclo,rating_followup_proximo_em:null});
      await alertaRating(db,o,'Conferir follow-up de Rating: '+String(e.message).slice(0,250),agora,conversa);
      resultados.push({oportunidade_id:o.id,status:'erro'});
    }
  }
  return {success:true,processados:oportunidades.length,simulacao:dryRun,resultados};
}
Deno.serve(async(req)=>{
  try{
    const api=createClientFromRequest(req);
    const user=await api.auth.me();
    if(!user) return Response.json({error:'Não autenticado'},{status:401});
    if(user.email && !['admin','master','super_admin','gerente'].includes(user.perfil||user.role)) return Response.json({error:'Sem permissão'},{status:403});
    if(user.email && !['master','super_admin'].includes(user.perfil||user.role) && user.empresa_id!==EMPRESA_RATING) return Response.json({error:'Empresa não autorizada'},{status:403});
    const body=await req.json().catch(()=>({}));
    return Response.json(await processarRating(api,new Date(),body.dry_run===true));
  }catch(e){return Response.json({error:e.message},{status:500});}
});
