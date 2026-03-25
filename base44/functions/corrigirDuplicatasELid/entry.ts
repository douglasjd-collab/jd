import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function normalizarTel(tel) {
  if (!tel) return null;
  const n = tel.replace(/\D/g, '');
  if (!n || n.includes('lid')) return null;
  if (n.startsWith('55') && n.length === 13) return n.slice(0, 4) + n.slice(5);
  return n;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || '699696c2c9f5bffc2e67402b';

    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      10000
    );

    const porTelefone = {};
    const comLid = [];

    for (const conv of conversas) {
      const tel = conv.cliente_telefone || '';
      
      if (tel.includes('@lid') || tel.includes('lid_')) {
        comLid.push(conv);
        continue;
      }

      const telNorm = normalizarTel(tel);
      if (!telNorm) continue;

      if (!porTelefone[telNorm]) {
        porTelefone[telNorm] = [];
      }
      porTelefone[telNorm].push(conv);
    }

    let deletadas = 0;

    // Consolidar duplicatas (manter a mais recente)
    for (const [tel, convs] of Object.entries(porTelefone)) {
      if (convs.length > 1) {
        convs.sort((a, b) => 
          new Date(b.data_ultima_mensagem || b.created_date) - new Date(a.data_ultima_mensagem || a.created_date)
        );
        
        const principal = convs[0];
        
        for (let i = 1; i < convs.length; i++) {
          const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
            { conversa_id: convs[i].id },
            '-created_date',
            10000
          );

          for (const msg of msgs) {
            await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, {
              conversa_id: principal.id
            }).catch(() => {});
          }

          await base44.asServiceRole.entities.ConversaWhatsapp.delete(convs[i].id).catch(() => {});
          deletadas++;
        }
      }
    }

    // Deletar conversas @lid
    let deletadasLid = 0;
    for (const conv of comLid) {
      const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
        { conversa_id: conv.id },
        '-created_date',
        1000
      );

      for (const msg of msgs) {
        await base44.asServiceRole.entities.MensagemWhatsapp.delete(msg.id).catch(() => {});
      }

      await base44.asServiceRole.entities.ConversaWhatsapp.delete(conv.id).catch(() => {});
      deletadasLid++;
    }

    return Response.json({
      ok: true,
      duplicatasDeletadas: deletadas,
      conversasLidDeletadas: deletadasLid
    });
  } catch (error) {
    console.error('Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});