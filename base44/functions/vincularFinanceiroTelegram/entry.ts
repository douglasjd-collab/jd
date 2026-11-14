import { createClientFromRequest } from "npm:@base44/sdk";
Deno.serve(async req => {
 try {
  const b = createClientFromRequest(req), u = await b.auth.me();
  if (!u) return Response.json({error:"Faça login."},{status:401});
  const colabs = await b.asServiceRole.entities.Colaborador.filter({user_id:u.id,status:"ativo"});
  const empresaId = u.empresa_id || colabs[0]?.empresa_id;
  if (!empresaId) return Response.json({error:"Usuário sem empresa vinculada."},{status:400});
  const token = crypto.randomUUID().replaceAll("-","");
  await b.asServiceRole.entities.TelegramFinanceState.create({key:"pair_"+token,data:JSON.stringify({usuario_id:u.id,empresa_id:empresaId}),expires_at:new Date(Date.now()+600000).toISOString()});
  return Response.json({comando:"/vincular "+token});
 } catch(e) { return Response.json({error:e.message},{status:500}); }
});