import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
import { resolverConexaoDapi } from '../../shared/dapiConexaoShared.ts';
import { lerRespostaStream } from '../../shared/dapiStreamResposta.ts';
Deno.serve(async req=>{
 let db, call, token;
 try {
  const b=createClientFromRequest(req),u=await b.auth.me();
  if(!u) return Response.json({error:'Não autenticado'},{status:401});
  db=b.asServiceRole.entities;
  const p=await req.json();
  const rows=await db.ChamadaVozWhatsapp.filter({connection_id:p.connectionId,call_id:p.callId},'-created_date',1);
  call=rows[0];
  if(!call) return Response.json({error:'Chamada não encontrada'},{status:404});
  if(call.empresa_id!==u.empresa_id&&!['master','super_admin'].includes(u.perfil)) return Response.json({error:'Empresa sem autorização'},{status:403});
  const permissoes=await db.RecebimentoLigacao.filter({empresa_id:call.empresa_id,user_id:u.id,connection_id:p.connectionId,ativo:true},'-created_date',1);
  if(!permissoes.length) return Response.json({error:'Ative o recebimento deste número nas configurações de ligações'},{status:403});
  if(!['atender','recusar'].includes(p.acao)) return Response.json({error:'Ação inválida'},{status:400});
  if(Date.now()-Date.parse(call.oferta_em||call.created_date)>90000) return Response.json({error:'A oferta da chamada expirou'},{status:409});
  const c=await db.WhatsappConnection.get(p.connectionId);
  if(c.empresa_id!==call.empresa_id||c.provider_type!=='dapi') return Response.json({error:'Conexão inválida'},{status:403});
  const {baseUrl,apiKey,sessionId}=resolverConexaoDapi(c);
  if(!apiKey||!sessionId||/^cloud-/i.test(sessionId)) return Response.json({error:'Conexão sem suporte a chamadas'},{status:400});
  if(p.acao==='recusar'&&!call.from_jid) return Response.json({error:'Origem da chamada ausente; não é possível recusar com segurança'},{status:409});
  token=crypto.randomUUID();
  // A condição e a atualização são executadas atomicamente no banco.
  const claim=await db.ChamadaVozWhatsapp.updateMany({id:call.id,status:'recebida'},{$set:{status:'atendendo',atendente_id:u.id,atendente_token:token}});
  if(claim.updated!==1) return Response.json({error:'Esta chamada já foi assumida ou encerrada',code:'CHAMADA_INDISPONIVEL'},{status:409});
  const r=await fetch(baseUrl.replace(/\/+$/,'')+'/api/v1/calls/'+(p.acao==='atender'?'accept':'reject'),{method:'POST',headers:{Authorization:apiKey,'Content-Type':'application/json'},body:JSON.stringify({sessionId,callId:call.call_id,...(p.acao==='recusar'?{from:call.from_jid}:{})}),signal:AbortSignal.timeout(20000)});
  const raw=await r.json().catch(()=>({}));
  const result=lerRespostaStream(raw);
  if(!r.ok||result.falhou||(p.acao==='atender'&&!result.stream)) {
   const detalhe=(result.mensagem||raw.details?.message||raw.details||'A D-API não confirmou o aceite da chamada');
   const error=String(detalhe).replaceAll(apiKey,'[protegido]').slice(0,500);
   await db.ChamadaVozWhatsapp.updateMany({id:call.id,atendente_token:token},{$set:{status:'erro',erro_aceite:error}});
   return Response.json({error,code:'DAPI_FALHA_ACEITE',callId:call.call_id},{status:502});
  }
  await db.ChamadaVozWhatsapp.updateMany({id:call.id,atendente_token:token,status:'atendendo'},{$set:{status:p.acao==='atender'?'em_atendimento':'recusada'}});
  return Response.json({success:true,...(p.acao==='atender'?{callId:result.stream.callId,wsUrl:result.stream.wsUrl}:{})});
 }catch(e){
  if(db&&call&&token) await db.ChamadaVozWhatsapp.updateMany({id:call.id,atendente_token:token},{$set:{status:'erro',erro_aceite:'Falha de comunicação no atendimento'}}).catch(()=>{});
  return Response.json({error:'Não foi possível concluir o atendimento. Confira a conexão e o estado da chamada.'},{status:500});
 }
});