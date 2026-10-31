import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
import { resolverConexaoDapi } from '../../shared/dapiConexaoShared.ts';
import { aplicarReciboDapi } from '../../shared/recibosDapiShared.ts';
Deno.serve(async req=>{
 try {
  const b=createClientFromRequest(req),u=await b.auth.me();if(!u)return Response.json({error:'Não autenticado'},{status:401});
  const {conversaId}=await req.json(),db=b.asServiceRole.entities;
  const conversa=await db.ConversaWhatsapp.get(conversaId);
  if(conversa.empresa_id!==u.empresa_id&&!['master','super_admin'].includes(u.perfil))return Response.json({error:'Sem autorização'},{status:403});
  const pending=await db.MensagemWhatsapp.filter({empresa_id:conversa.empresa_id,conversa_id:conversa.id,provider:'dapi',remetente:'vendedor',status:{$in:['enviada','entregue']}},'-data_envio',30);
  if(!pending.length)return Response.json({success:true,updated:0});
  const candidates=conversa.connection_id?[await db.WhatsappConnection.get(conversa.connection_id)]:await db.WhatsappConnection.filter({empresa_id:conversa.empresa_id,session_id:conversa.instancia},'-created_date',1);
  const c=candidates[0];if(!c||c.empresa_id!==conversa.empresa_id||c.provider_type!=='dapi'||/^cloud-/i.test(c.session_id||''))return Response.json({success:true,updated:0});
  const {baseUrl,apiKey,sessionId}=resolverConexaoDapi(c);
  const get=async(path,params)=>{
   const url=new URL(baseUrl.replace(/\/+$/,'')+'/api/v1'+path);url.search=new URLSearchParams({sessionId,...params});
   const r=await fetch(url,{headers:{Authorization:apiKey},signal:AbortSignal.timeout(10000)});const data=await r.json();
   if(!r.ok||data.success===false)throw new Error('D-API indisponível para consultar entrega');
   return data;
  };
  const phone=String(conversa.cliente_telefone||'').replace(/\D/g,'');
  if(!phone)return Response.json({success:true,updated:0});
  const chats=await get('/chats/',{search:phone,limit:'20'});
  const targets=(chats.data||[]).filter(x=>String(x.contact?.phone||'').split('@')[0]===phone);
  let updated=0;
  for(const chat of targets.slice(0,3)){
   const messages=await get('/chats/'+encodeURIComponent(chat.id)+'/messages',{limit:'100',sort_order:'desc'});
   for(const m of messages.data||[]){
    if(m.from_me!==true||!pending.some(x=>x.whatsapp_message_id===m.message_id))continue;
    const status=String(m.status||'').toLowerCase();
    if(!['delivered','read','played'].includes(status))continue;
    const result=await aplicarReciboDapi(b,c,{message_id:m.message_id},status==='delivered'?'entregue':'lida');
    updated+=result.results?.reduce((n,x)=>n+x.updated,0)||0;
   }
  }
  return Response.json({success:true,updated});
 }catch(e){return Response.json({error:'Não foi possível consultar as confirmações de entrega agora.'},{status:502})}
});