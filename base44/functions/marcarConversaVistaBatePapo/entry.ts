import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { carregarConversaAutorizada } from '../../shared/acessoWhatsappShared.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { conversa_id, mensagem_id } = await req.json();
    const autorizado = await carregarConversaAutorizada({ base44, user, conversaId: conversa_id });
    if ('erro' in autorizado) return Response.json({ error: autorizado.erro }, { status: autorizado.status });

    const db = base44.asServiceRole.entities;
    const mensagem = mensagem_id && await db.MensagemWhatsapp.get(mensagem_id);
    if (!mensagem || mensagem.conversa_id !== conversa_id || mensagem.remetente !== 'cliente' || !mensagem.data_envio) {
      return Response.json({ error: 'Mensagem recebida inválida' }, { status: 400 });
    }
    const chave = { empresa_id: autorizado.conversa.empresa_id, usuario_id: user.id, conversa_id };
    const registros = await db.LeituraConversaWhatsapp.filter(chave, '-vista_ate', 1);
    if (!registros.length) {
      await db.LeituraConversaWhatsapp.create({ ...chave, vista_ate: mensagem.data_envio });
    } else if (registros[0].vista_ate < mensagem.data_envio) {
      await db.LeituraConversaWhatsapp.updateMany(
        { id: registros[0].id, vista_ate: { $lt: mensagem.data_envio } },
        { $set: { vista_ate: mensagem.data_envio } }
      );
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
