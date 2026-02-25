import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Diagnosticar sem necessidade de user autenticado (pois é uma ferramenta admin)
    const JD_ID = '699696c2c9f5bffc2e67402b'; // JD Promotora padrão
    
    const diagnostico = {
      timestamp: new Date().toISOString(),
      empresa_id: JD_ID,
      testes: {}
    };

    // 1. Verificar configuração da Evolution API
    const config = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({
      chave: 'evolution_api_url'
    });
    
    const evolutionUrl = config.length > 0 ? config[0].valor : Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = 'TES';

    diagnostico.testes.configuracao = {
      evolution_url: evolutionUrl ? '✓ Configurada' : '✗ Ausente',
      evolution_key: evolutionKey ? '✓ Configurada' : '✗ Ausente',
      instance_name: instanceName || '✗ Ausente'
    };

    // 2. Testar conectividade com Evolution API
    try {
      const response = await fetch(`${evolutionUrl}/instance/info/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': evolutionKey,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        diagnostico.testes.conexao_evolution = {
          status: '✓ Conectado',
          instance_status: data.instance?.status,
          connected: data.instance?.connected,
          numero_whatsapp: data.instance?.number || 'N/A'
        };
      } else {
        diagnostico.testes.conexao_evolution = {
          status: '✗ Falha na conexão',
          http_status: response.status,
          erro: await response.text()
        };
      }
    } catch (err) {
      diagnostico.testes.conexao_evolution = {
        status: '✗ Erro de rede',
        erro: err.message
      };
    }

    // 3. Verificar webhook configurado na Evolution
    try {
      const webhookResponse = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': evolutionKey,
          'Content-Type': 'application/json'
        }
      });

      if (webhookResponse.ok) {
        const webhookData = await webhookResponse.json();
        diagnostico.testes.webhook_na_evolution = {
          status: '✓ Webhook existe',
          url: webhookData.webhook?.url,
          enabled: webhookData.webhook?.enabled,
          eventos: webhookData.webhook?.events || []
        };
      } else {
        diagnostico.testes.webhook_na_evolution = {
          status: '✗ Webhook não encontrado',
          http_status: webhookResponse.status
        };
      }
    } catch (err) {
      diagnostico.testes.webhook_na_evolution = {
        status: '✗ Erro ao verificar webhook',
        erro: err.message
      };
    }

    // 4. Listar últimos logs de recebimento
    const logs = await base44.asServiceRole.entities.LogRecebimentoWebhook.filter(
      { empresa_id: user.empresa_id, instancia: instanceName },
      '-created_date',
      10
    );

    diagnostico.testes.ultimos_logs = {
      total_registros: logs.length,
      logs: logs.map(log => ({
        id: log.id,
        tipo_evento: log.tipo_evento,
        status: log.status,
        timestamp: log.timestamp,
        erro: log.mensagem_erro || 'N/A'
      }))
    };

    // 5. Verificar se há ConversasWhatsapp para essa instância
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: user.empresa_id,
      instancia: instanceName
    });

    diagnostico.testes.conversas_ativas = {
      total: conversas.length,
      ultimas: conversas.slice(0, 5).map(c => ({
        id: c.id,
        cliente_telefone: c.cliente_telefone,
        ultima_mensagem: c.data_ultima_mensagem,
        status: c.status
      }))
    };

    // 6. Resumo do diagnóstico
    diagnostico.resumo = {
      configuracao_ok: diagnostico.testes.configuracao.evolution_url === '✓ Configurada',
      conexao_evolution_ok: diagnostico.testes.conexao_evolution.status.includes('✓'),
      webhook_ativo: diagnostico.testes.webhook_na_evolution.enabled === true,
      logs_recebidos: logs.length > 0,
      conversas_ativas: conversas.length > 0
    };

    // 7. Recomendações
    diagnostico.recomendacoes = [];
    if (!diagnostico.resumo.configuracao_ok) {
      diagnostico.recomendacoes.push('Configurar EVOLUTION_API_URL e EVOLUTION_API_KEY');
    }
    if (!diagnostico.resumo.conexao_evolution_ok) {
      diagnostico.recomendacoes.push('Verificar se Evolution API está rodando e acessível');
    }
    if (!diagnostico.resumo.webhook_ativo) {
      diagnostico.recomendacoes.push('Ativar webhook na Evolution API');
    }
    if (!logs.length) {
      diagnostico.recomendacoes.push('Nenhum webhook recebido ainda - enviar mensagem de teste');
    }

    return Response.json(diagnostico);
  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});