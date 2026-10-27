import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { carregarConversaAutorizada } from '../../shared/acessoWhatsappShared.ts';

// Histórico da conversa entregue somente a quem tem acesso àquela conversa.
// Necessário porque usuários com permissão restrita (somente atribuídas) não
// podem consultar MensagemWhatsapp diretamente — a RLS nega a leitura direta.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { conversa_id, limite, desde } = body || {};
    if (!conversa_id) return Response.json({ error: 'conversa_id é obrigatório' }, { status: 400 });

    const autorizado = await carregarConversaAutorizada({ base44, user, conversaId: conversa_id });
    if ('erro' in autorizado) return Response.json({ error: autorizado.erro }, { status: autorizado.status });

    const db = base44.asServiceRole.entities;
    const limiteSeguro = Math.min(Math.max(Number(limite) || 300, 1), 500);

    const filtro: any = { conversa_id };
    if (desde) filtro.updated_date = { $gte: desde };

    const mensagens = await db.MensagemWhatsapp.filter(
      filtro,
      desde ? '-updated_date' : '-data_envio',
      limiteSeguro
    );

    return Response.json({ success: true, mensagens: mensagens || [] });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}