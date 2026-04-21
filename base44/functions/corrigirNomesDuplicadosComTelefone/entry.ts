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

    // Buscar todas as conversas
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      5000
    ).catch(() => []);

    // Agrupar por nome para identificar duplicatas
    const porNome = {};
    for (const c of conversas) {
      const nome = (c.cliente_nome || '').trim();
      if (nome) {
        if (!porNome[nome]) porNome[nome] = [];
        porNome[nome].push(c);
      }
    }

    // Encontrar nomes que aparecem múltiplas vezes
    const nomesDuplicados = Object.entries(porNome)
      .filter(([_, convs]) => convs.length > 1)
      .map(([nome, convs]) => ({ nome, quantidade: convs.length, conversas: convs }));

    console.log(`🔍 Encontrados ${nomesDuplicados.length} nomes duplicados`);

    // Para cada nome duplicado, atualizar as conversas para usar o telefone
    let corrigidas = 0;
    const BATCH_SIZE = 10;

    for (const dupl of nomesDuplicados) {
      for (let i = 0; i < dupl.conversas.length; i += BATCH_SIZE) {
        const batch = dupl.conversas.slice(i, i + BATCH_SIZE);
        const promises = batch.map(c =>
          base44.asServiceRole.entities.ConversaWhatsapp.update(c.id, {
            cliente_nome: c.cliente_telefone
          })
            .then(() => corrigidas++)
            .catch(() => {})
        );
        await Promise.all(promises);

        if (i + BATCH_SIZE < dupl.conversas.length) {
          await new Promise(r => setTimeout(r, 150));
        }
      }
    }

    return Response.json({
      ok: true,
      mensagem: `✅ ${corrigidas} conversas com nomes duplicados foram atualizadas com número de telefone`,
      nomesDuplicadosEncontrados: nomesDuplicados.length,
      corrigidas,
      exemplos: nomesDuplicados.slice(0, 5).map(d => ({
        nome: d.nome,
        quantidade: d.quantidade
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});