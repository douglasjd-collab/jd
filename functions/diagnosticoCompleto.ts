import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  console.log('='.repeat(80));
  console.log('🔍 DIAGNÓSTICO COMPLETO - POR QUE NÃO RECEBO MENSAGENS?');
  console.log('='.repeat(80));
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ success: false, error: 'Não autenticado' }, { status: 401 });
    }

    const diagnostico = {
      etapa: '',
      problemas: [],
      sucessos: [],
      recomendacoes: []
    };

    // ETAPA 1: Verificar credenciais
    diagnostico.etapa = '1. Verificando credenciais da Evolution API';
    console.log('\n' + diagnostico.etapa);
    
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    if (!evolutionUrl || !evolutionKey || !instanceName) {
      const faltando = [];
      if (!evolutionUrl) faltando.push('EVOLUTION_API_URL');
      if (!evolutionKey) faltando.push('EVOLUTION_API_KEY');
      if (!instanceName) faltando.push('EVOLUTION_INSTANCE_NAME');
      
      diagnostico.problemas.push(`❌ Variáveis faltando: ${faltando.join(', ')}`);
      return Response.json({ success: false, diagnostico });
    }

    diagnostico.sucessos.push('✅ Credenciais da Evolution API configuradas');
    console.log('✅ Credenciais OK');

    // ETAPA 2: Verificar webhook configurado na Evolution
    diagnostico.etapa = '2. Verificando webhook na Evolution API';
    console.log('\n' + diagnostico.etapa);

    const endpoint = `${evolutionUrl.replace(/\/$/, '')}/webhook/find/${instanceName}`;
    console.log('Endpoint:', endpoint);

    const webhookResponse = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionKey
      }
    });

    const webhookData = await webhookResponse.json();
    console.log('Resposta webhook:', JSON.stringify(webhookData, null, 2));

    const currentUrl = new URL(req.url);
    const baseUrl = `${currentUrl.protocol}//${currentUrl.host}`;
    const webhookCorreto = `${baseUrl}/functions/receberWebhookWhatsApp?instance=${instanceName}`;

    if (!webhookData || !webhookData.url) {
      diagnostico.problemas.push('❌ Webhook NÃO configurado na Evolution API');
      diagnostico.recomendacoes.push('🔧 Clique em "Configurar Webhook Automaticamente"');
    } else if (webhookData.url !== webhookCorreto) {
      diagnostico.problemas.push(`❌ Webhook configurado INCORRETAMENTE`);
      diagnostico.problemas.push(`   Configurado: ${webhookData.url}`);
      diagnostico.problemas.push(`   Deveria ser: ${webhookCorreto}`);
      diagnostico.recomendacoes.push('🔧 Clique em "Configurar Webhook Automaticamente" para corrigir');
    } else {
      diagnostico.sucessos.push('✅ Webhook configurado CORRETAMENTE');
      diagnostico.sucessos.push(`   URL: ${webhookData.url}`);
      
      // Verificar eventos
      if (webhookData.events && webhookData.events.includes('MESSAGES_UPSERT')) {
        diagnostico.sucessos.push('✅ Evento MESSAGES_UPSERT ativo (recebe mensagens)');
      } else {
        diagnostico.problemas.push('❌ Evento MESSAGES_UPSERT não configurado');
        diagnostico.recomendacoes.push('🔧 Reconfigure o webhook para incluir MESSAGES_UPSERT');
      }
    }

    // ETAPA 3: Verificar banco de dados
    diagnostico.etapa = '3. Verificando banco de dados';
    console.log('\n' + diagnostico.etapa);

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
    const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.list('-created_date', 5);
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.list('-created_date', 5);

    diagnostico.sucessos.push(`✅ Empresas ativas: ${empresas.length}`);
    diagnostico.sucessos.push(`✅ Total de mensagens: ${mensagens.length}`);
    diagnostico.sucessos.push(`✅ Total de conversas: ${conversas.length}`);

    if (mensagens.length === 0) {
      diagnostico.problemas.push('⚠️ Nenhuma mensagem no banco de dados ainda');
    } else {
      const ultimaMensagem = mensagens[0];
      const dataUltima = new Date(ultimaMensagem.created_date);
      const minutosAtras = Math.floor((Date.now() - dataUltima.getTime()) / 1000 / 60);
      
      diagnostico.sucessos.push(`📅 Última mensagem há ${minutosAtras} minutos`);
      diagnostico.sucessos.push(`   Tipo: ${ultimaMensagem.tipo_conteudo}`);
      diagnostico.sucessos.push(`   Remetente: ${ultimaMensagem.remetente}`);
    }

    // ETAPA 4: Testar endpoint de webhook
    diagnostico.etapa = '4. Testando endpoint de recebimento';
    console.log('\n' + diagnostico.etapa);

    try {
      const testePayload = {
        event: 'messages.upsert',
        instance: instanceName,
        data: {
          key: {
            remoteJid: '558781194149@s.whatsapp.net',
            fromMe: false,
            id: 'TESTE_' + Date.now()
          },
          message: {
            conversation: 'Mensagem de teste do diagnóstico'
          },
          messageTimestamp: Date.now()
        }
      };

      const testeResponse = await fetch(webhookCorreto, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testePayload)
      });

      const testeStatus = testeResponse.status;
      const testeText = await testeResponse.text();

      if (testeStatus === 200) {
        diagnostico.sucessos.push('✅ Endpoint de webhook responde corretamente');
      } else {
        diagnostico.problemas.push(`❌ Endpoint retornou erro ${testeStatus}`);
        diagnostico.problemas.push(`   Resposta: ${testeText.substring(0, 200)}`);
      }
    } catch (e) {
      diagnostico.problemas.push(`❌ Erro ao testar endpoint: ${e.message}`);
    }

    // RESUMO FINAL
    console.log('\n' + '='.repeat(80));
    console.log('📊 RESUMO DO DIAGNÓSTICO');
    console.log('='.repeat(80));
    console.log('\n✅ SUCESSOS:');
    diagnostico.sucessos.forEach(s => console.log('  ' + s));
    console.log('\n❌ PROBLEMAS:');
    diagnostico.problemas.forEach(p => console.log('  ' + p));
    console.log('\n🔧 RECOMENDAÇÕES:');
    diagnostico.recomendacoes.forEach(r => console.log('  ' + r));
    console.log('='.repeat(80));

    const temProblemas = diagnostico.problemas.length > 0;

    return Response.json({
      success: !temProblemas,
      diagnostico,
      configuracao_atual: {
        webhook_esperado: webhookCorreto,
        webhook_configurado: webhookData?.url || 'NÃO CONFIGURADO',
        eventos: webhookData?.events || []
      },
      resumo: temProblemas 
        ? '❌ Problemas encontrados - veja os detalhes acima'
        : '✅ Tudo configurado corretamente!'
    });

  } catch (error) {
    console.error('❌ ERRO:', error.message);
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});