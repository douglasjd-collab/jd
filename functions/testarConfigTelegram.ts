import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verificar autenticação
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const diagnostico = {
      usuario: user.nome_perfil || user.full_name,
      timestamp: new Date().toISOString(),
      checks: {}
    };

    // 1. Verificar TELEGRAM_BOT_TOKEN
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    diagnostico.checks.token = {
      configurado: !!token,
      valor_parcial: token ? `${token.substring(0, 10)}...` : null
    };

    // 2. Verificar TELEGRAM_CHAT_ID
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
    diagnostico.checks.chat_id = {
      configurado: !!chatId,
      valor: chatId || null
    };

    // 3. Verificar se o bot está ativo
    if (token) {
      try {
        const botInfo = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const botData = await botInfo.json();
        diagnostico.checks.bot = {
          ativo: botData.ok,
          username: botData.result?.username || null,
          nome: botData.result?.first_name || null
        };
      } catch (e) {
        diagnostico.checks.bot = {
          ativo: false,
          erro: e.message
        };
      }
    }

    // 4. Verificar webhook configurado
    if (token) {
      try {
        const webhookInfo = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
        const webhookData = await webhookInfo.json();
        diagnostico.checks.webhook = {
          configurado: !!webhookData.result?.url,
          url: webhookData.result?.url || null,
          pending_updates: webhookData.result?.pending_update_count || 0,
          last_error: webhookData.result?.last_error_message || null
        };
      } catch (e) {
        diagnostico.checks.webhook = {
          configurado: false,
          erro: e.message
        };
      }
    }

    // 5. Verificar entidade Agenda
    try {
      const agendas = await base44.asServiceRole.entities.Agenda.filter({}, '-created_date', 5);
      diagnostico.checks.entidade_agenda = {
        existe: true,
        total_registros: agendas?.length || 0
      };
    } catch (e) {
      diagnostico.checks.entidade_agenda = {
        existe: false,
        erro: e.message
      };
    }

    // 6. Resumo e recomendações
    const problemas = [];
    const sucesso = [];

    if (!diagnostico.checks.token.configurado) {
      problemas.push('❌ TELEGRAM_BOT_TOKEN não configurado');
    } else {
      sucesso.push('✅ TELEGRAM_BOT_TOKEN configurado');
    }

    if (!diagnostico.checks.chat_id.configurado) {
      problemas.push('❌ TELEGRAM_CHAT_ID não configurado');
    } else {
      sucesso.push('✅ TELEGRAM_CHAT_ID configurado');
    }

    if (diagnostico.checks.bot?.ativo) {
      sucesso.push(`✅ Bot ativo: @${diagnostico.checks.bot.username}`);
    } else {
      problemas.push('❌ Bot não está ativo ou token inválido');
    }

    if (!diagnostico.checks.webhook?.configurado) {
      problemas.push('❌ Webhook NÃO configurado - O bot não receberá mensagens!');
      problemas.push('   👉 Execute a função "telegramSetWebhook" com a URL correta');
    } else {
      sucesso.push(`✅ Webhook configurado: ${diagnostico.checks.webhook.url}`);
      if (diagnostico.checks.webhook.last_error) {
        problemas.push(`⚠️ Último erro no webhook: ${diagnostico.checks.webhook.last_error}`);
      }
    }

    if (!diagnostico.checks.entidade_agenda?.existe) {
      problemas.push('❌ Entidade Agenda não encontrada');
    } else {
      sucesso.push('✅ Entidade Agenda configurada');
    }

    diagnostico.resumo = {
      total_checks: Object.keys(diagnostico.checks).length,
      total_sucesso: sucesso.length,
      total_problemas: problemas.length,
      status: problemas.length === 0 ? 'TUDO OK ✅' : 'ATENÇÃO ⚠️'
    };

    diagnostico.sucesso = sucesso;
    diagnostico.problemas = problemas;

    // Instruções para corrigir
    if (problemas.length > 0) {
      diagnostico.instrucoes = [
        '📋 COMO CORRIGIR:',
        '',
        '1️⃣ Configure o webhook executando a função "telegramSetWebhook"',
        '   Payload: {"url": "https://SEU_APP.base44.app/api/apps/SEU_APP_ID/functions/telegramWebhook"}',
        '',
        '2️⃣ Abra o Telegram e envie /start para o bot',
        '',
        '3️⃣ Teste com: "ajuda" ou "reuniao hoje 14:30 teste"'
      ];
    } else {
      diagnostico.instrucoes = [
        '🎉 TUDO CONFIGURADO!',
        '',
        'Abra o Telegram e envie:',
        '• /start ou "ajuda" - ver comandos',
        '• "reuniao hoje 14:30 teste" - criar compromisso',
        '• "agenda hoje" - listar compromissos'
      ];
    }

    return Response.json(diagnostico, {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });

  } catch (e) {
    return Response.json({ 
      erro: 'Erro ao executar diagnóstico',
      detalhes: e.message || String(e) 
    }, { status: 500 });
  }
});