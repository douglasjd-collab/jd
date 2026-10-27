import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { carregarConversaAutorizada } from '../../shared/acessoWhatsappShared.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { conversa_id } = await req.json();
    if (!conversa_id) return Response.json({ error: 'conversa_id obrigatório' }, { status: 400 });

    console.log('🔍 Buscando mensagens da conversa:', conversa_id);

    // Autorização antes de qualquer leitura com service role.
    const autorizado = await carregarConversaAutorizada({ base44, user, conversaId: conversa_id });
    if ('erro' in autorizado) {
      return Response.json({ error: autorizado.erro }, { status: autorizado.status });
    }

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