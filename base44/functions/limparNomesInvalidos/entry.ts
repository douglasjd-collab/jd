import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Remover nomes que são iguais ao telefone
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || user.empresa_id;

    if (!empresaId) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    // Buscar conversas
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      5000
    ).catch(() => []);

    // Identificar conversas para limpar (em memória, sem requisições)
    const paraLimpar = conversas.filter(c => {
      const nome = (c.cliente_nome || '').trim();
      const telefoneLimpo = (c.cliente_telefone || '').replace(/\D/g, '');
      return nome === telefoneLimpo;
    });

    // Atualizar em paralelo com limite
    let limpas = 0;
    const BATCH_SIZE = 10;
    for (let i = 0; i < paraLimpar.length; i += BATCH_SIZE) {
      const batch = paraLimpar.slice(i, i + BATCH_SIZE);
      const promises = batch.map(c =>
        base44.asServiceRole.entities.ConversaWhatsapp.update(c.id, { cliente_nome: '' })
          .then(() => limpas++)
          .catch(() => {})
      );
      await Promise.all(promises);
      if (i + BATCH_SIZE < paraLimpar.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    return Response.json({
      ok: true,
      mensagem: `✅ ${limpas} conversas com nome = telefone foram limpas`,
      limpas
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});