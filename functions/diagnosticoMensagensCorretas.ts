import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const JD_ID = '699696c2c9f5bffc2e67402b';

    // Buscar últimas 5 conversas
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: JD_ID },
      '-data_ultima_mensagem',
      5
    );

    const resultado = {
      total_conversas: conversas.length,
      conversas: conversas.map(c => ({
        id: c.id,
        cliente_nome: c.cliente_nome,
        cliente_telefone: c.cliente_telefone,
        status: c.status,
        ultima_mensagem: c.ultima_mensagem?.substring(0, 80),
        data_ultima_mensagem: c.data_ultima_mensagem
      }))
    };

    return Response.json(resultado);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});