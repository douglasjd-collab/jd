import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    let empresaId = body.empresa_id || user.empresa_id;

    if (!empresaId && user.perfil === 'super_admin') {
      const todasEmps = await base44.asServiceRole.entities.Empresa.filter({}, '-created_date', 50).catch(() => []);
      const empComEvo = todasEmps.find(e => e.evolution_url && e.evolution_api_key && e.evolution_instance_name);
      if (empComEvo) empresaId = empComEvo.id;
    }

    if (!empresaId) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    // Buscar conversas com Douglas
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId, cliente_nome: 'Douglas' },
      '-updated_date',
      5000
    ).catch(() => []);

    console.log(`🔄 Resetando ${conversas.length} conversas com nome 'Douglas'...`);

    // Limpar em paralelo
    let limpas = 0;
    const BATCH_SIZE = 50;

    for (let i = 0; i < conversas.length; i += BATCH_SIZE) {
      const batch = conversas.slice(i, i + BATCH_SIZE);
      const promises = batch.map(c =>
        base44.asServiceRole.entities.ConversaWhatsapp.update(c.id, { cliente_nome: '' })
          .then(() => limpas++)
          .catch(() => {})
      );
      await Promise.all(promises);

      if (i + BATCH_SIZE < conversas.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return Response.json({
      ok: true,
      mensagem: `✅ ${limpas} conversas resetadas para vazio`,
      limpas
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});