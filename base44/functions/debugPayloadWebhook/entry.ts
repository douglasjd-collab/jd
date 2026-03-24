import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);
    
    console.log('🔍 PAYLOAD WEBHOOK COMPLETO:');
    console.log(JSON.stringify(body, null, 2));
    
    // Capturar dados principais
    const data = body.data || {};
    const msgData = Array.isArray(data) ? data[0] : data;
    
    console.log('\n🔍 CAMPOS PRINCIPAIS:');
    console.log('- remoteJid:', msgData.key?.remoteJid || 'NÃO ENCONTRADO');
    console.log('- remoteJidAlt:', msgData.remoteJidAlt || 'NÃO ENCONTRADO');
    console.log('- participant:', msgData.participant || 'NÃO ENCONTRADO');
    console.log('- pushName:', msgData.pushName || 'NÃO ENCONTRADO');
    console.log('- senderName:', msgData.senderName || 'NÃO ENCONTRADO');
    
    // Salvar para análise
    await base44.asServiceRole.entities.LogRecebimentoWebhook.create({
      empresa_id: '699696c2c9f5bffc2e67402b',
      tipo_evento: 'debug_webhook',
      status: 'sucesso',
      conteudo: JSON.stringify({
        remoteJid: msgData.key?.remoteJid,
        remoteJidAlt: msgData.remoteJidAlt,
        participant: msgData.participant,
        pushName: msgData.pushName
      })
    });
    
    return Response.json({ 
      success: true, 
      captured: {
        remoteJid: msgData.key?.remoteJid,
        remoteJidAlt: msgData.remoteJidAlt,
        participant: msgData.participant
      }
    });
  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});