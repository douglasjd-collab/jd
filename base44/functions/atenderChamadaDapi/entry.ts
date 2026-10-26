import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Recebimento exclusivo pela extensão oficial D-API.
// Mantém a rota para abas antigas, sem enviar accept/reject à D-API.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    return Response.json({
      success: false,
      code: 'RECEBIMENTO_EXCLUSIVO_EXTENSAO_DAPI',
      error: 'Atenda ou recuse a ligação pela extensão oficial da D-API. O recebimento de chamadas no CRM está desativado.',
    }, { status: 409 });
  } catch (error) {
    return Response.json({ error: error?.message || 'Erro inesperado' }, { status: 500 });
  }
});
