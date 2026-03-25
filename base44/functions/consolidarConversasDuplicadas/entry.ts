import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const normalizarTelefone = (tel) => {
  if (!tel) return null;
  const n = tel.replace(/\D/g, '');
  if (n.startsWith('55') && (n.length === 12 || n.length === 13)) {
    // Normalizar para 12 dígitos (55 + DDD + 8 dígitos sem o 9)
    if (n.length === 13 && n[4] === '9') {
      return n.slice(0, 4) + n.slice(5);
    }
    return n;
  }
  return null;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const empresaId = user.empresa_id || '699696c2c9f5bffc2e67402b';

    // Buscar TODAS as conversas
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.list('-created_date', 10000);
    const conversasEmpresa = conversas.filter(c => c.empresa_id === empresaId);

    // Agrupar por telefone normalizado
    const grupos = {};
    conversasEmpresa.forEach(c => {
      const telNorm = normalizarTelefone(c.cliente_telefone);
      if (telNorm) {
        if (!grupos[telNorm]) grupos[telNorm] = [];
        grupos[telNorm].push(c);
      }
    });

    let consolidadas = 0;
    let mensagensMovidas = 0;
    let conversasDeletadas = 0;

    // Para cada grupo com duplicatas
    for (const [telNorm, grupoConversas] of Object.entries(grupos)) {
      if (grupoConversas.length <= 1) continue;

      // Ordenar por data mais recente
      grupoConversas.sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date));
      
      const conversaPrincipal = grupoConversas[0];
      const duplicatas = grupoConversas.slice(1);

      console.log(`📌 Consolidando ${grupoConversas.length} conversas para: ${conversaPrincipal.cliente_nome || telNorm}`);

      // Mover mensagens das duplicatas para a principal
      for (const dupConversa of duplicatas) {
        try {
          const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
            { conversa_id: dupConversa.id },
            '-created_date',
            1000
          );

          // Mover mensagens
          for (const msg of mensagens) {
            await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, {
              conversa_id: conversaPrincipal.id
            });
            mensagensMovidas++;
          }

          // Deletar conversa duplicata
          await base44.asServiceRole.entities.ConversaWhatsapp.delete(dupConversa.id);
          conversasDeletadas++;
        } catch (e) {
          console.error(`Erro ao consolidar conversa ${dupConversa.id}:`, e);
        }
      }

      consolidadas++;
    }

    return Response.json({
      ok: true,
      consolidadas,
      mensagensMovidas,
      conversasDeletadas,
      mensagem: `✅ ${consolidadas} grupos consolidados | ${mensagensMovidas} mensagens movidas | ${conversasDeletadas} conversas deletadas`
    });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});