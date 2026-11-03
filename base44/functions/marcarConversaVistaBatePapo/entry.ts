import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { carregarConversaAutorizada } from '../../shared/acessoWhatsappShared.ts';

// Registra que a conversa foi ABERTA (visualizada) por um usuário com permissão
// restrita no WhatsApp. Esses usuários não podem atualizar MensagemWhatsapp
// direto por causa da RLS, então a leitura é confirmada aqui, com service role,
// depois de validar a conversa e a conexão liberada para ele.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { conversa_id } = await req.json();
    const autorizado = await carregarConversaAutorizada({ base44, user, conversaId: conversa_id });
    if (autorizado.erro) {
      return Response.json({ error: autorizado.erro }, { status: autorizado.status });
    }

    const corte = new Date().toISOString();
    await base44.asServiceRole.entities.MensagemWhatsapp.updateMany(
      {
        conversa_id,
        remetente: 'cliente',
        status: { $ne: 'lida' },
        data_envio: { $lte: corte },
      },
      { $set: { status: 'lida', lida_em: corte } }
    );

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});