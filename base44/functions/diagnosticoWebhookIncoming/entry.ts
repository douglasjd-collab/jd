import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  console.log('🔍 DIAGNÓSTICO WEBHOOK INCOMING');
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const empresaId = user.empresa_id || '699696c2c9f5bffc2e67402b';
    
    // 1. Verificar últimas mensagens recebidas
    console.log('📊 Buscando últimas mensagens...');
    const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { empresa_id: empresaId, remetente: 'cliente' },
      '-data_envio',
      50
    );
    
    // 2. Verificar logs de recebimento
    console.log('📋 Buscando logs de webhook...');
    const logs = await base44.asServiceRole.entities.LogRecebimentoWebhook.filter(
      { empresa_id: empresaId, tipo_evento: 'mensagem_recebida' },
      '-timestamp',
      50
    );

    // 3. Agrupar por hora
    const porHora = {};
    mensagens.forEach(m => {
      const data = new Date(m.data_envio);
      const hora = data.toISOString().substring(0, 13) + ':00:00';
      porHora[hora] = (porHora[hora] || 0) + 1;
    });

    // 4. Verificar conversas ativas
    console.log('💬 Buscando conversas ativas...');
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId, status: 'ativa' },
      '-data_ultima_mensagem',
      100
    );

    return Response.json({
      sucesso: true,
      empresa_id: empresaId,
      webhook_recebendo: mensagens.length > 0,
      ultima_mensagem_em: mensagens.length > 0 ? mensagens[0].data_envio : null,
      total_mensagens_cliente: mensagens.length,
      total_conversas_ativas: conversas.length,
      mensagens_por_hora: porHora,
      ultimas_5_mensagens: mensagens.slice(0, 5).map(m => ({
        id: m.id,
        conversa: m.conversa_id,
        texto: m.texto?.substring(0, 50),
        data: m.data_envio,
        tipo: m.tipo_conteudo
      })),
      ultimos_5_logs: logs.slice(0, 5).map(l => ({
        telefone: l.telefone,
        conteudo: l.conteudo?.substring(0, 50),
        status: l.status,
        timestamp: l.timestamp
      })),
      conversas_com_ultima_msg: conversas.slice(0, 5).map(c => ({
        id: c.id,
        telefone: c.cliente_telefone,
        nome: c.cliente_nome,
        ultima_msg: c.ultima_mensagem?.substring(0, 50),
        data: c.data_ultima_mensagem
      }))
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ 
      erro: error.message,
      dica: 'Se não há mensagens sendo salvas, o webhook não está configurado corretamente na Evolution API'
    }, { status: 500 });
  }
});