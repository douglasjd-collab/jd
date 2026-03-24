import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { telefone } = await req.json();

    if (!telefone) {
      return Response.json({ error: 'Telefone obrigatório' }, { status: 400 });
    }

    console.log('='.repeat(80));
    console.log('[SIMULAR] Iniciando simulação de mensagem recebida');
    console.log('[SIMULAR] Telefone:', telefone);

    // Buscar ou criar conversa
    const conversasExistentes = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      cliente_telefone: telefone
    });

    let conversa;
    if (conversasExistentes.length > 0) {
      conversa = conversasExistentes[0];
      console.log('[SIMULAR] Conversa existente:', conversa.id);
    } else {
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        cliente_telefone: telefone,
        status: 'ativa',
        ultima_mensagem: 'Nova conversa iniciada',
        data_ultima_mensagem: new Date().toISOString()
      });
      console.log('[SIMULAR] Conversa criada:', conversa.id);
    }

    // Criar mensagem
    const mensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
      conversa_id: conversa.id,
      remetente: 'cliente',
      tipo_conteudo: 'texto',
      texto: '🧪 TESTE - Mensagem simulada em ' + new Date().toLocaleString('pt-BR'),
      whatsapp_message_id: 'SIM_' + Date.now(),
      data_envio: new Date().toISOString(),
      status: 'entregue'
    });

    console.log('[SIMULAR] Mensagem criada:', mensagem.id);

    // Atualizar conversa
    await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
      ultima_mensagem: mensagem.texto,
      data_ultima_mensagem: mensagem.data_envio
    });

    console.log('[SIMULAR] ✅ Simulação concluída com sucesso!');
    console.log('='.repeat(80));

    return Response.json({
      success: true,
      conversa_id: conversa.id,
      mensagem_id: mensagem.id,
      mensagem: {
        texto: mensagem.texto,
        data: mensagem.data_envio
      }
    });

  } catch (error) {
    console.error('[SIMULAR] ❌ Erro:', error.message);
    console.error('[SIMULAR] Stack:', error.stack);
    
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});