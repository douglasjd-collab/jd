import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    let empresaId = body.empresa_id || user.empresa_id;

    if (!empresaId && user.perfil === 'super_admin') {
      const todasEmps = await base44.asServiceRole.entities.Empresa.filter({}, '-created_date', 50).catch(() => []);
      const empComEvo = todasEmps.find(e => e.evolution_url && e.evolution_api_key && e.evolution_instance_name);
      if (empComEvo) empresaId = empComEvo.id;
    }

    if (!empresaId) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    // Buscar algumas conversas
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-updated_date',
      50
    ).catch(() => []);

    // Agrupar por whatsapp_id
    const porWhatsappId = {};
    for (const c of conversas) {
      const wid = c.whatsapp_id || 'SEM_ID';
      if (!porWhatsappId[wid]) porWhatsappId[wid] = [];
      porWhatsappId[wid].push({
        telefone: c.cliente_telefone,
        nome: c.cliente_nome
      });
    }

    const resultado = {};
    for (const [wid, convs] of Object.entries(porWhatsappId)) {
      resultado[wid] = {
        quantidade: convs.length,
        exemplos: convs.slice(0, 3)
      };
    }

    return Response.json({
      ok: true,
      totalConversas: conversas.length,
      whatsappIdUnicos: Object.keys(resultado).length,
      agrupadoPorWhatsappId: resultado,
      primeirasConversas: conversas.slice(0, 5).map(c => ({
        telefone: c.cliente_telefone,
        nome: c.cliente_nome,
        whatsapp_id: c.whatsapp_id
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});