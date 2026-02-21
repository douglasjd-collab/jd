import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { conversa_id } = await req.json();
    if (!conversa_id) return Response.json({ error: 'conversa_id obrigatório' }, { status: 400 });

    console.log('🔍 Buscando mensagens da conversa:', conversa_id);

    // Usar asServiceRole para garantir acesso sem restrições de empresa_id
    const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { conversa_id },
      'data_envio',
      500
    );

    console.log('✅ Mensagens encontradas:', mensagens?.length);

    return Response.json({ sucesso: true, mensagens: mensagens || [] });
  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});