import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const JD_ID = '699696c2c9f5bffc2e67402b';

    // Buscar últimas conversas
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: JD_ID },
      '-data_ultima_mensagem',
      10
    );

    // Para cada conversa, buscar mensagens recentes
    const resultado = {
      total_conversas: conversas.length,
      conversas_detalhes: []
    };

    for (const conv of conversas) {
      const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
        { conversa_id: conv.id },
        '-data_envio',
        5
      );

      resultado.conversas_detalhes.push({
        conversa_id: conv.id,
        cliente_nome: conv.cliente_nome,
        cliente_telefone: conv.cliente_telefone,
        status: conv.status,
        ultima_mensagem: conv.ultima_mensagem,
        data_ultima_mensagem: conv.data_ultima_mensagem,
        total_mensagens: mensagens.length,
        ultimas_mensagens: mensagens.map(m => ({
          id: m.id,
          remetente: m.remetente,
          texto: m.texto?.substring(0, 100),
          data_envio: m.data_envio,
          status: m.status
        }))
      });
    }

    console.log('📊 DIAGNÓSTICO:', JSON.stringify(resultado, null, 2));

    return Response.json(resultado);
  } catch (error) {
    console.error('❌ Erro no diagnóstico:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});