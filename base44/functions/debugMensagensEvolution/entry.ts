import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Verificar se os nomes foram salvos no banco
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
      '-updated_date',
      100
    ).catch(() => []);

    // Ver as mais recentemente atualizadas
    const atualizadas = conversas.filter(c => {
      const nome = (c.cliente_nome || '').trim();
      return nome && nome !== '0' && !nome.match(/^\d+$/) && nome !== 'Cliente';
    });

    const semNome = conversas.filter(c => {
      const nome = (c.cliente_nome || '').trim();
      return !nome || nome === '0' || nome.match(/^\d+$/) || nome === 'Cliente';
    });

    return Response.json({
      ok: true,
      totalConversas: conversas.length,
      comNome: atualizadas.length,
      semNome: semNome.length,
      ultimasAtualizadas: conversas.slice(0, 5).map(c => ({
        id: c.id,
        telefone: c.cliente_telefone,
        nome: c.cliente_nome,
        updated_date: c.updated_date
      })),
      exemplosComNome: atualizadas.slice(0, 5).map(c => ({
        telefone: c.cliente_telefone,
        nome: c.cliente_nome
      })),
      exemplosSemNome: semNome.slice(0, 5).map(c => ({
        telefone: c.cliente_telefone,
        nome: c.cliente_nome
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});