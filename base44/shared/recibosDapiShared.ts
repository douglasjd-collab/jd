// O message_id do WhatsApp tem prioridade sobre IDs internos do banco do provedor.
export function idReciboDapi(item:any) {
 return [item?.message_id,item?.messageId,item?.key?.id,item?.message?.key?.id,item?.external_message_id,item?.stanzaId,item?.id]
  .find(id=>typeof id==='string'&&id.trim())?.trim() || null;
}
export function expandirRecibosDapi(data:any):any[] {
 if(Array.isArray(data))return data.flatMap(expandirRecibosDapi);
 if(!data||typeof data!=='object')return [];
 for(const field of ['messages','updates','receipts','data']){
  if(Array.isArray(data[field])){
   const {[field]:children,...parent}=data;
   return children.flatMap(child=>expandirRecibosDapi(typeof child==='string'?{...parent,message_id:child}:{...parent,...child}));
  }
 }
 for(const field of ['messageIds','message_ids','ids','keys']){
  if(Array.isArray(data[field])){
   const {[field]:ids,...parent}=data;
   return ids.flatMap(id=>expandirRecibosDapi(typeof id==='string'?{...parent,message_id:id}:{...parent,key:id}));
  }
 }
 if(!idReciboDapi(data)&&data.data&&typeof data.data==='object')return expandirRecibosDapi(data.data);
 return [data];
}
export async function aplicarReciboDapi(base44:any,connection:any,payload:any,status:string){
 if(!connection)return {handled:false,reason:'connection not found'};
 const db=base44.asServiceRole?.entities||base44.entities,results=[];
 for(const item of expandirRecibosDapi(payload)){
  const id=idReciboDapi(item);if(!id)continue;
  const result=await db.MensagemWhatsapp.updateMany({
   empresa_id:connection.empresa_id,whatsapp_message_id:id,remetente:'vendedor',
   status:{$nin:status==='lida'?['lida']:['entregue','lida']}
  },{$set:{status,...(status==='lida'?{lida_em:new Date().toISOString()}:{entregue_em:new Date().toISOString()})}});
  results.push({messageId:id,status,updated:result.updated||0});
 }
 return {handled:results.length>0,results};
}
