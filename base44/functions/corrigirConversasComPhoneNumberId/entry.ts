import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Corrige conversas que têm phone_number_id_meta preenchido mas canal_origem incorreto (evolution)
// Essas conversas devem ser Meta Oficial mas foram classificadas errado por bug anterior

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Buscar todas as conversas com phone_number_id_meta preenchido
    const todasConvs = await base44.asServiceRole.entities.ConversaWhatsapp.filter({}, null, 2000);

    const paraCorrigir = todasConvs.filter(c =>
      c.phone_number_id_meta &&
      (c.canal_origem !== 'meta' || c.provider !== 'whatsapp_meta' || c.tipo_conexao !== 'meta_oficial')
    );

    console.log(`🔍 Total conversas: ${todasConvs.length} | Para corrigir: ${paraCorrigir.length}`);

    let corrigidas = 0;
    for (const c of paraCorrigir) {
      await base44.asServiceRole.entities.ConversaWhatsapp.update(c.id, {
        canal_origem: 'meta',
        provider: 'whatsapp_meta',
        locked_provider: true,
        tipo_conexao: 'meta_oficial',
        instancia: 'META_OFICIAL',
        canal_atendimento: 'meta_oficial',
        canal_preferencial: 'meta_oficial',
        last_inbound_provider: 'whatsapp_meta',
      });
      corrigidas++;
      console.log(`✅ Corrigida: ${c.id} | tel=${c.cliente_telefone} | era canal_origem=${c.canal_origem}`);
    }

    return Response.json({
      success: true,
      total: todasConvs.length,
      corrigidas,
      message: `${corrigidas} conversa(s) corrigidas para Meta Oficial`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});