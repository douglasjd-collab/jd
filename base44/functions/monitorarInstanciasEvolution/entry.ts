import { createClientFromRequest } from 'npm:@base44/sdk@0.8.34';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Buscar todas as instâncias configuradas
    const configs = await base44.entities.ConfiguracaoSistema.filter({
      chave: { $regex: '^evolution_.*_status$' }
    });

    const apiUrlConfig = await base44.entities.ConfiguracaoSistema.filter({ chave: 'evolution_api_url' });
    const apiKeyConfig = await base44.entities.ConfiguracaoSistema.filter({ chave: 'evolution_api_key' });
    
    let apiUrl = apiUrlConfig[0]?.valor;
    let apiKey = apiKeyConfig[0]?.valor;

    // Fallback: usar secrets do ambiente
    if (!apiUrl) apiUrl = Deno.env.get('EVOLUTION_API_URL');
    if (!apiKey) apiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!apiUrl || !apiKey) {
      console.log('Configurações da Evolution não encontradas');
      return Response.json({ status: 'skip', reason: 'no_config' });
    }

    const resultados = [];

    for (const config of configs) {
      const match = config.chave.match(/^evolution_(.+)_status$/);
      if (!match) continue;

      const instancia = match[1];
      const status = JSON.parse(config.valor || '{}');

      // Verificar se há erros recentes de envio
      const agora = new Date();
      const ultimoErro = status.data_ultimo_erro ? new Date(status.data_ultimo_erro) : null;
      
      // Se houve erro nos últimos 15 minutos e status_envio está bloqueado
      if (ultimoErro && 
          status.status_envio === 'bloqueado' && 
          (agora.getTime() - ultimoErro.getTime()) < 15 * 60 * 1000) {
        
        console.log(`Instância ${instancia}: Envio bloqueado, tentando recuperação...`);

        // Tentar recuperação automática
        try {
          // 1. Testar conexão com a API
          const testRes = await fetch(`${apiUrl}/instance/checkInstance?instanceName=${instancia}`, {
            headers: { 'apikey': apiKey }
          });
          
          const testData = await testRes.json();
          
          if (!testData.exists) {
            resultados.push({
              instancia,
              acao: 'reconectar_necessaria',
              motivo: 'Instância não existe'
            });
            continue;
          }

          // 2. Tentar enviar mensagem de teste
          const testeEnvioRes = await fetch(`${apiUrl}/message/sendText`, {
            method: 'POST',
            headers: {
              'apikey': apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              instance: instancia,
              number: '5511999999999',
              textMessage: { text: '[AUTO-TESTE] Verificação de sistema' }
            })
          });

          const testeEnvioData = await testeEnvioRes.json();

          if (testeEnvioRes.ok && testeEnvioData.messageId) {
            // Sucesso! Atualizar status
            const novoStatus = {
              ...status,
              status_envio: 'ok',
              ultimo_erro_envio: null,
              data_recuperacao: new Date().toISOString(),
              tentativas_falhas: 0,
            };

            await base44.entities.ConfiguracaoSistema.update(config.id, {
              valor: JSON.stringify(novoStatus)
            });

            resultados.push({
              instancia,
              acao: 'recuperado_automaticamente',
              motivo: 'Envio voltou a funcionar'
            });
          } else {
            // Falha no envio - verificar versão do WhatsApp
            const versaoRes = await fetch(`${apiUrl}/instance/fetchInstance?instanceName=${instancia}`, {
              headers: { 'apikey': apiKey }
            });
            
            const versaoData = await versaoRes.json();
            const versaoAtual = versaoData?.release?.whatsappVersion || 'desconhecida';

            // Buscar versão recomendada
            const versaoRecomendada = '2.3000.1015910647'; // Versão estável

            if (versaoAtual !== versaoRecomendada) {
              // Versão divergente - acionar atualização
              resultados.push({
                instancia,
                acao: 'atualizar_whatsapp',
                motivo: `Versão ${versaoAtual} incompatível`,
                versao_atual: versaoAtual,
                versao_recomendada: versaoRecomendada
              });
            } else {
              // Versão ok, mas envio falhando - sugerir reinício
              resultados.push({
                instancia,
                acao: 'reiniciar_instancia',
                motivo: 'Envio falhando mesmo com versão correta'
              });
            }
          }
        } catch (error) {
          console.error(`Erro ao verificar instância ${instancia}:`, error);
          resultados.push({
            instancia,
            acao: 'erro_verificacao',
            motivo: error.message
          });
        }
      }
    }

    // Enviar alerta no Telegram se houver problemas críticos
    if (resultados.some(r => r.acao === 'reconectar_necessaria')) {
      const telegramConfig = await base44.entities.ConfiguracaoSistema.filter({
        chave: { $in: ['telegram_bot_token', 'telegram_chat_id'] }
      });

      const botToken = telegramConfig.find(c => c.chave === 'telegram_bot_token')?.valor;
      const chatId = telegramConfig.find(c => c.chave === 'telegram_chat_id')?.valor;

      if (botToken && chatId) {
        const instanciasProblema = resultados
          .filter(r => r.acao === 'reconectar_necessaria')
          .map(r => r.instancia)
          .join(', ');

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `⚠️ *ALERTA: Reconexão Necessária*\n\nInstâncias: ${instanciasProblema}\n\nAção: Reconectar QR Code no CRM.`,
            parse_mode: 'Markdown'
          })
        });
      }
    }

    return Response.json({
      status: 'success',
      instancias_verificadas: configs.length,
      resultados
    });

  } catch (error) {
    console.error('Erro no monitoramento:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});