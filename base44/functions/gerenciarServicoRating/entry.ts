import { createClientFromRequest } from 'npm:@base44/sdk@0.8.62';
import { salvarServicoRating } from '../../shared/ratingServicoShared.ts';
export default async function(req: Request) {
  try{
    const api=createClientFromRequest(req), user=await api.auth.me();
    if(!user?.id||!user?.email) return Response.json({error:'Não autenticado'},{status:401});
    const body=await req.json().catch(()=>({})), db=api.asServiceRole.entities;
    if(!body.oportunidade_id) return Response.json({error:'Oportunidade obrigatória'},{status:400});
    const o=await db.Oportunidade.get(body.oportunidade_id);
    const colabs=await db.Colaborador.filter({user_id:user.id,empresa_id:o.empresa_id,status:'ativo'},null,50);
    const colab=colabs[0], perfil=colab?.perfil||user.perfil||user.role;
    const global=['master','super_admin'].includes(perfil);
    const empresa=colab?.empresa_id||user.empresa_id;
    const ids=[user.id,colab?.id].filter(Boolean);
    let responsaveis=[];try{responsaveis=JSON.parse(o.responsaveis_ids||'[]');}catch{}
    if(!global&&(empresa!==o.empresa_id||(!['admin','gerente'].includes(perfil)&&!ids.some(id=>o.vendedor_id===id||responsaveis.includes(id))))) return Response.json({error:'Sem permissão para este serviço'},{status:403});
    return Response.json({success:true,resultado:await salvarServicoRating(db,o,user,body)});
  }catch(e){return Response.json({error:e.message},{status:400});}
}
