import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Buscar colaborador para obter empresa_id
    const colaboradores = await base44.entities.Colaborador.filter({ user_id: user.id });
    if (!colaboradores || colaboradores.length === 0) {
      return Response.json({ error: 'Colaborador não encontrado' }, { status: 404 });
    }
    
    const empresa_id = colaboradores[0].empresa_id;

    const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
    const INSTANCE_NAME = 'PROMOTORAJD';

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return Response.json({
        erro: 'Variáveis de ambiente não configuradas',
        EVOLUTION_API_URL: EVOLUTION_API_URL ? '✅ Configurada' : '❌ Não configurada',
        EVOLUTION_API_KEY: EVOLUTION_API_KEY ? '✅ Configurada' : '❌ Não configurada'
      }, { status: 500 });
    }

    // 1. Verificar webhooks da instância
    console.log('🔍 Verificando webhooks configurados na Evolution...');
    const webhookResponse = await fetch(
      `${EVOLUTION_API_URL}/webhook/${INSTANCE_NAME}`,
      {
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const webhookData = await webhookResponse.json();
    
    console.log('📊 Resposta dos webhooks:', JSON.stringify(webhookData, null, 2));

    // 2. Tentar listar configurações da instância
    console.log('🔍 Verificando configuração geral da instância...');
    const instanceResponse = await fetch(
      `${EVOLUTION_API_URL}/instances/info/${INSTANCE_NAME}`,
      {
        headers: {
          'apikey': EVOLUTION_API_KEY
        }
      }
    );

    const instanceData = await instanceResponse.json();

    return Response.json({
      sucesso: true,
      webhook_configurado: webhookData.webhook ? true : false,
      webhook_url: webhookData.webhook || 'Nenhum webhook configurado',
      webhook_events: webhookData.events || [],
      webhook_response_status: webhookResponse.status,
      instance_status: instanceData.instance?.state || 'desconhecido',
      diagnostico: {
        problema: webhookData.webhook ? 
          'Webhook está configurado, mas pode não estar recebendo eventos corretamente' :
          '❌ PROBLEMA: Nenhum webhook configurado na Evolution API!',
        solucao: webhookData.webhook ?
          'Mensagens podem estar sendo bloqueadas. Verifique os logs da Evolution API.' :
          'Configure o webhook manualmente no painel da Evolution API'
      }
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ 
      erro: error.message,
      dica: 'Erro ao conectar à Evolution API'
    }, { status: 500 });
  }
});