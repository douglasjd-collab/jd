import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || '699696c2c9f5bffc2e67402b';

    console.log(`🔍 Verificando recebimento de mensagens...`);

    // 1. Buscar últimas mensagens RECEBIDAS (cliente)
    const mensagensRecebidas = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { 
        empresa_id: empresaId,
        remetente: 'cliente'
      },
      '-created_date',
      50
    );

    console.log(`📨 Mensagens recebidas (últimas 50): ${mensagensRecebidas.length}`);

    // 2. Buscar últimas conversas ativas
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-data_ultima_mensagem',
      20
    );

    console.log(`💬 Conversas: ${conversas.length}`);

    // 3. Buscar logs de webhook
    const logs = await base44.asServiceRole.entities.LogRecebimentoWebhook.filter(
      { empresa_id: empresaId, tipo_evento: 'mensagem_recebida' },
      '-timestamp',
      20
    );

    console.log(`📋 Logs de mensagens recebidas: ${logs.length}`);

    // 4. Se não há mensagens recebidas, criar um aviso
    let diagnostico = {
      total_mensagens_recebidas: mensagensRecebidas.length,
      total_conversas: conversas.length,
      total_logs_recebimento: logs.length,
      conversas_com_ultimas_mensagens: conversas.map(c => ({
        id: c.id,
        cliente: c.cliente_nome,
        telefone: c.cliente_telefone,
        ultima_msg: c.ultima_mensagem?.substring(0, 50),
        data: c.data_ultima_mensagem
      })),
      ultimas_mensagens_recebidas: mensagensRecebidas.slice(0, 10).map(m => ({
        id: m.id,
        conversa_id: m.conversa_id,
        texto: m.texto?.substring(0, 50),
        data: m.created_date
      })),
      problema: mensagensRecebidas.length === 0 ? 'NENHUMA MENSAGEM RECEBIDA - Webhook pode não estar funcionando' : 'OK - Mensagens estão sendo recebidas'
    };

    console.log(`✅ Diagnóstico:`, JSON.stringify(diagnostico));

    return Response.json(diagnostico);

  } catch (e) {
    console.error(`❌ Erro: ${e.message}`);
    return Response.json({ error: e.message }, { status: 500 });
  }
});