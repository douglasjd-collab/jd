import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Buscar todas as conversas com instancia META_OFICIAL ou tipo_conexao meta_oficial
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({}, '-created_date', 2000);

    const paraCorrigir = conversas.filter(c => 
      c.instancia === 'META_OFICIAL' || 
      c.tipo_conexao === 'meta_oficial' ||
      c.canal_atendimento === 'meta_oficial'
    );

    console.log(`🔍 Total conversas: ${conversas.length} | Para corrigir: ${paraCorrigir.length}`);

    let corrigidas = 0;
    for (const c of paraCorrigir) {
      const precisaCorrecao = 
        c.tipo_conexao !== 'meta_oficial' || 
        c.instancia !== 'META_OFICIAL' ||
        c.canal_atendimento !== 'meta_oficial' ||
        c.canal_preferencial !== 'meta_oficial';

      if (precisaCorrecao) {
        await base44.asServiceRole.entities.ConversaWhatsapp.update(c.id, {
          tipo_conexao: 'meta_oficial',
          instancia: 'META_OFICIAL',
          canal_atendimento: 'meta_oficial',
          canal_preferencial: 'meta_oficial',
        });
        corrigidas++;
        console.log(`✅ Corrigida: ${c.id} | ${c.cliente_nome || c.cliente_telefone}`);
      }
    }

    return Response.json({ 
      success: true, 
      total_verificadas: paraCorrigir.length,
      corrigidas,
      mensagem: `${corrigidas} conversas Meta Oficial corrigidas com sucesso`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});