import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { monitorarAtendimentoTesteIA } from '../../shared/monitorAtendimentoIA.ts';
Deno.serve(async (req) => {
  try {
    const api = createClientFromRequest(req);
    const resultado = await monitorarAtendimentoTesteIA(api.asServiceRole.entities);
    return Response.json({success:true,resultado});
  } catch { return Response.json({error:'Não foi possível verificar o atendimento de teste.'},{status:500}); }
});
