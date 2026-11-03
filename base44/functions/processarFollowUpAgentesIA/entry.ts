import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { processarFollowUpTesteIA } from '../../shared/agentesTesteIA.ts';
// Sem parâmetros externos de destinatário ou conteúdo. Rotina limitada ao teste Eduarda.
Deno.serve(async (req) => {
  try {
    const api = createClientFromRequest(req);
    const resultado = await processarFollowUpTesteIA(api.asServiceRole.entities);
    return Response.json({ success: true, resultado });
  } catch {
    return Response.json({ error: 'Não foi possível verificar o follow-up de teste.' }, { status: 500 });
  }
});
