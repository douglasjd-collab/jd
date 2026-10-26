// Eventos de voz: criar a oferta antes de processar o histórico da conversa.
function entidades(b:any){return b?.asServiceRole?.entities||b?.entities}
export async function registrarChamadaRecebidaDapi(b:any,c:any,d:any){
 if(!c||d?.isGroup) return {handled:false};
 const db=entidades(b),callId=String(d?.callId||d?.call_id||'');
 if(!callId) return {handled:false};
 const from=typeof d.from==='object'?d.from.jid:d.from||d.callCreator||'';
 const phone=d.phone || (!String(from).includes('@lid')?String(from).split('@')[0].replace(/\D/g,''):'');
 const existing=await db.ChamadaVozWhatsapp.filter({empresa_id:c.empresa_id,connection_id:c.id,call_id:callId},'-created_date',1);
 if(existing.length) return {handled:true,duplicate:true};
 const configs=await db.RecebimentoLigacao.filter({empresa_id:c.empresa_id,connection_id:c.id,ativo:true},'-created_date',1000);
 let time=Number(d.timestamp);if(time&&time<1e12)time*=1000;
 const oferta_em=Number.isFinite(time)&&time>0?new Date(time).toISOString():new Date().toISOString();
 const call=await db.ChamadaVozWhatsapp.create({empresa_id:c.empresa_id,connection_id:c.id,call_id:callId,cliente_telefone:phone||'Número não identificado',cliente_nome:d.from?.name||phone||'Número não identificado',from_jid:String(from),oferta_em,destinatarios:[...new Set(configs.map(x=>x.user_id))],status:Date.now()-Date.parse(oferta_em)>90000?'encerrada':'recebida'});
 if(!phone) return {handled:true,callId};
 try {
  let conversa=(await db.ConversaWhatsapp.filter({empresa_id:c.empresa_id,cliente_telefone:phone},'-created_date',1))[0];
  if(!conversa) conversa=await db.ConversaWhatsapp.create({empresa_id:c.empresa_id,cliente_telefone:phone,cliente_nome:phone,whatsapp_id:String(from),provider:'dapi',canal_origem:'dapi',tipo_conexao:'usuario',connection_id:c.id,instancia:c.session_id,status:'ativa',ultima_mensagem:'',data_ultima_mensagem:oferta_em,ultimo_remetente:'cliente'});
  await db.ChamadaVozWhatsapp.update(call.id,{conversa_id:conversa.id,cliente_nome:conversa.cliente_nome||phone});
  const messageId='call_'+callId;
  if(!(await db.MensagemWhatsapp.filter({empresa_id:c.empresa_id,whatsapp_message_id:messageId},'-created_date',1)).length){
   await db.MensagemWhatsapp.create({empresa_id:c.empresa_id,conversa_id:conversa.id,remetente:'cliente',tipo_conteudo:'texto',texto:'📞 Chamada de voz recebida',provider:'dapi',whatsapp_message_id:messageId,data_envio:oferta_em,status:'entregue'});
   await db.ConversaWhatsapp.update(conversa.id,{ultima_mensagem:'📞 Chamada de voz recebida',data_ultima_mensagem:oferta_em,ultimo_remetente:'cliente',cliente_respondeu:true});
  }
 }catch(e){console.error('Histórico da chamada indisponível:',e.message)}
 return {handled:true,callId};
}
export async function finalizarChamadaDapi(b:any,c:any,d:any,event='call.ended'){
 if(!c||!d?.callId) return {handled:false};
 const db=entidades(b);
 const filtro:any={empresa_id:c.empresa_id,connection_id:c.id,call_id:String(d.callId)};
 // Um atendimento fora do CRM só encerra a oferta; não assume mídia local.
 if(event!=='call.ended') filtro.status={$in:['recebida','visualizada']};
 const result=await db.ChamadaVozWhatsapp.updateMany(filtro,{$set:{status:'encerrada'}});
 return {handled:true,updated:result.updated};
}
