import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  console.log('='.repeat(100));
  console.log('🔍 DIAGNÓSTICO DE RECEBIMENTO WEBHOOK');
  console.log('='.repeat(100));

  try {
    const user = await base44.auth.me();
    console.log('✅ Usuário autenticado:', user.email);

    // 1. Verificar se a empresa TESTE existe
    console.log('\n📋 VERIFICANDO EMPRESA TESTE...');
    const empresasTeste = await base44.asServiceRole.entities.Empresa.filter({
      evolution_instance_name: 'TESTE'
    });
    console.log('Empresas encontradas com instance TESTE:', empresasTeste.length);
    if (empresasTeste.length > 0) {
      const emp = empresasTeste[0];
      console.log('  Nome:', emp.nome);
      console.log('  ID:', emp.id);
      console.log('  Instance:', emp.evolution_instance_name);
      console.log('  Evolution URL:', emp.evolution_url ? '✅ Configurada' : '❌ NÃO configurada');
      console.log('  Evolution API Key:', emp.evolution_api_key ? '✅ Configurada' : '❌ NÃO configurada');
    }

    // 2. Verificar conversas
    console.log('\n📱 VERIFICANDO CONVERSAS WHATSAPP...');
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.list('-created_date', 10);
    console.log('Total de conversas:', conversas.length);
    if (conversas.length > 0) {
      conversas.slice(0, 3).forEach((conv, i) => {
        console.log(`  [${i + 1}] Telefone: ${conv.cliente_telefone}, Status: ${conv.status}, Data: ${conv.created_date}`);
      });
    }

    // 3. Verificar mensagens
    console.log('\n💬 VERIFICANDO MENSAGENS WHATSAPP...');
    const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.list('-created_date', 10);
    console.log('Total de mensagens:', mensagens.length);
    if (mensagens.length > 0) {
      mensagens.slice(0, 3).forEach((msg, i) => {
        console.log(`  [${i + 1}] ID: ${msg.id.substring(0, 8)}..., Remetente: ${msg.remetente}, Tipo: ${msg.tipo_conteudo}, Data: ${msg.created_date}`);
      });
    }

    // 4. Verificar se há eventos não processados
    console.log('\n⚙️ INSTRUÇÕES PARA TESTAR RECEBIMENTO...');
    console.log('1. Envie uma mensagem para o número do WhatsApp configurado na Evolution API');
    console.log('2. O webhook deve processar a mensagem automaticamente');
    console.log('3. A conversa aparecerá no módulo "Bate-papo" alguns segundos depois');
    console.log('4. Se não aparecer, verifique:');
    console.log('   - A URL do webhook está correta na Evolution API?');
    console.log('   - A instância está conectada/autenticada na Evolution API?');
    console.log('   - O log do Deno mostra erros ao receber a mensagem?');

    // 5. Info do Webhook
    console.log('\n🔗 INFORMAÇÕES DO WEBHOOK...');
    const webhookUrl = 'https://windy-sheep-96-p6d620a4408h.deno.dev/functions/receberWebhookWhatsApp?instance=TESTE';
    console.log('URL do Webhook:', webhookUrl);
    console.log('Instance:', 'TESTE');
    console.log('Esta é a URL que deve estar configurada na Evolution API');

    console.log('\n' + '='.repeat(100));
    console.log('✅ DIAGNÓSTICO CONCLUÍDO');
    console.log('='.repeat(100));

    return Response.json({
      success: true,
      diagnostico: {
        empresa_teste_encontrada: empresasTeste.length > 0,
        empresa_teste_dados: empresasTeste.length > 0 ? {
          nome: empresasTeste[0].nome,
          id: empresasTeste[0].id,
          evolution_url_configurada: !!empresasTeste[0].evolution_url,
          evolution_api_key_configurada: !!empresasTeste[0].evolution_api_key
        } : null,
        total_conversas: conversas.length,
        total_mensagens: mensagens.length,
        webhook_url: 'https://windy-sheep-96-p6d620a4408h.deno.dev/functions/receberWebhookWhatsApp?instance=TESTE',
        ultimas_mensagens: mensagens.slice(0, 3).map(m => ({
          id: m.id,
          remetente: m.remetente,
          tipo: m.tipo_conteudo,
          data: m.created_date
        })),
        instrucoes: [
          'Envie uma mensagem de teste para o número do WhatsApp',
          'Verifique se a URL do webhook está correta na Evolution API',
          'Confirme que a instância está conectada/autenticada',
          'Aguarde alguns segundos e recarregue a página'
        ]
      }
    });

  } catch (error) {
    console.error('❌ ERRO NO DIAGNÓSTICO:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});