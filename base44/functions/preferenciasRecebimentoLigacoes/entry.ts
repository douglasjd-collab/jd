import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
Deno.serve(async req => {
 try {
  const b=createClientFromRequest(req), u=await b.auth.me();
  if(!u) return Response.json({error:'Não autenticado'},{status:401});
  const p=await req.json().catch(()=>({})), db=b.asServiceRole.entities;
  const global=['master','super_admin'].includes(u.perfil);
  const admin=global || ['admin','gerente'].includes(u.perfil);
  const empresa=p.empresaId || u.empresa_id;
  if(!empresa || (!global && empresa!==u.empresa_id)) return Response.json({error:'Empresa sem autorização'},{status:403});
  const connections=(await db.WhatsappConnection.filter({empresa_id:empresa},'-created_date',200)).filter(c=>c.provider_type==='dapi'&&!/^cloud-/i.test(c.session_id||''));
  const users=admin ? await db.User.filter({empresa_id:empresa},'full_name',1000) : [u];
  const target=p.userId || u.id;
  if(p.acao==='salvar') {
   if(target!==u.id && (!admin || !users.some(x=>x.id===target))) return Response.json({error:'Usuário sem autorização'},{status:403});
   if(!connections.some(c=>c.id===p.connectionId)) return Response.json({error:'Número sem autorização'},{status:403});
   const filtro={empresa_id:empresa,user_id:target,connection_id:p.connectionId};
   const rows=await db.RecebimentoLigacao.filter(filtro,'-created_date',100);
   if(rows.length) await db.RecebimentoLigacao.updateMany(filtro,{$set:{ativo:p.ativo===true}});
   else await db.RecebimentoLigacao.create({...filtro,ativo:p.ativo===true});
  }
  const configs=await db.RecebimentoLigacao.filter({empresa_id:empresa,...(!admin?{user_id:u.id}:{})},'-created_date',3000);
  return Response.json({success:true,admin,userId:u.id,connections:connections.map(c=>({id:c.id,nome:c.nome,numero:c.numero_telefone,status:c.status,recebimento: (()=>{try{return !!JSON.parse(c.config_json||'{}').recebimento_chamadas}catch{return false}})()})),users:users.map(x=>({id:x.id,nome:x.nome_perfil||x.full_name||x.email})),configs});
 } catch(e) {return Response.json({error:e.message||'Falha ao configurar ligações'},{status:500});}
});