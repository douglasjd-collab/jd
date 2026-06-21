import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.perfil !== 'super_admin' && user.perfil !== 'master') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const cincoDiasAtras = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { status: 'ativa' },
      '-updated_date',
      10000
    );

    const paraEncerrar = conversas.filter(c => {
      if (!c.data_ultima_mensagem) return false;
      return c.data_ultima_mensagem < cincoDiasAtras;
    });

    let encerradas = 0;
    let erros = 0;
    const detalhes = [];

    for (const c of paraEncerrar) {
      try {
        await base44.asServiceRole.entities.ConversaWhatsapp.update(c.id, {
          status: 'encerrada',
          ultimo_remetente: 'cliente',
        });
        encerradas++;
        if (detalhes.length < 20) {
          detalhes.push({ id: c.id, nome: c.cliente_nome || c.cliente_telefone, ultima_msg: c.data_ultima_mensagem });
        }
        // Delay de 150ms entre updates para evitar rate limit
        await sleep(150);
      } catch (e) {
        erros++;
        console.error(`Erro ao encerrar conversa ${c.id}:`, e.message);
        await sleep(150);
      }
    }

    return Response.json({
      success: true,
      total_ativas: conversas.length,
      pendentes: paraEncerrar.length,
      encerradas,
      erros,
      detalhes,
      mensagem: `${encerradas} conversa(s) encerrada(s) por inatividade (>5 dias). ${erros} erro(s).`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});