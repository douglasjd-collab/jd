import { createClientFromRequest } from 'npm:@base44/sdk@0.8.34';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const { instancia, erro_envio, telefone_teste } = payload;

    // Registrar erro de envio
    const agora = new Date().toISOString();
    
    // Buscar configurações da instância
    const configs = await base44.entities.ConfiguracaoSistema.filter({ chave: `evolution_${instancia}_status` });
    const statusAtual = configs.length > 0 ? JSON.parse(configs[0].valor || '{}') : {};

    // Atualizar status com erro
    const novoStatus = {
      ...statusAtual,
      instancia,
      status_conexao: 'conectado', // Recebendo mensagens
      status_envio: 'bloqueado',
      ultimo_erro_envio: erro_envio || 'Falha desconhecida',
      data_ultimo_erro: agora,
      tentativas_falhas: (statusAtual.tentativas_falhas || 0) + 1,
      versao_whatsapp: statusAtual.versao_whatsapp || 'desconhecida',
    };

    // Salvar status atualizado
    if (configs.length > 0) {
      await base44.entities.ConfiguracaoSistema.update(configs[0].id, { valor: JSON.stringify(novoStatus) });
    } else {
      await base44.entities.ConfiguracaoSistema.create({
        chave: `evolution_${instancia}_status`,
        valor: JSON.stringify(novoStatus),
        empresa_id: user.empresa_id || null,
      });
    }

    // Se muitas tentativas falhas, tentar recuperação automática
    if (novoStatus.tentativas_falhas >= 3) {
      console.log(`[${instancia}] Muitas falhas detectadas. Iniciando recuperação automática...`);
      
      // 1. Tentar reiniciar instância
      try {
        const restartRes = await fetch(`${Deno.env.get('EVOLUTION_API_URL')}/instance/restart/${instancia}`, {
          method: 'POST',
          headers: { 'apikey': Deno.env.get('EVOLUTION_API_KEY') || '' },
        });
        const restartData = await restartRes.json();
        console.log(`[${instancia}] Restart:`, restartData);
      } catch (e) {
        console.error(`[${instancia}] Erro ao reiniciar:`, e.message);
      }

      // 2. Verificar e atualizar versão do WhatsApp Web
      try {
        const versaoAtual = statusAtual.versao_whatsapp;
        const versaoRecomendada = await fetch('https://raw.githubusercontent.com/EvolutionAPI/EvolutionAPI/main/docker-compose.yml')
          .then(r => r.text())
          .then(text => {
            const match = text.match(/wppconnect\/wppconnect-server:([0-9.]+)/);
            return match ? match[1] : null;
          })
          .catch(() => null);

        if (versaoRecomendada && versaoAtual !== versaoRecomendada) {
          console.log(`[${instancia}] Atualizando versão: ${versaoAtual} → ${versaoRecomendada}`);
          // Atualizar variável de ambiente no EasyPanel (se configurado)
          // Isso requereria integração com API do EasyPanel
        }
      } catch (e) {
        console.error(`[${instancia}] Erro ao verificar versão:`, e.message);
      }

      // 3. Testar envio interno
      if (telefone_teste) {
        try {
          const testRes = await fetch(`${Deno.env.get('EVOLUTION_API_URL')}/message/sendText/${instancia}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': Deno.env.get('EVOLUTION_API_KEY') || '',
            },
            body: JSON.stringify({
              number: telefone_teste,
              textMessage: { text: '[TESTE AUTO] Verificação de envio - ' + agora },
            }),
          });
          const testData = await testRes.json();
          
          if (testData.status === 'success' || testData.messageId) {
            // Sucesso! Resetar contador de erros
            novoStatus.status_envio = 'operacional';
            novoStatus.tentativas_falhas = 0;
            novoStatus.ultimo_erro_envio = null;
            novoStatus.data_ultimo_teste_sucesso = agora;
            novoStatus.recuperacao_automatica = 'sucesso';
          } else {
            novoStatus.recuperacao_automatica = 'falha';
            novoStatus.status_qr = 'necessario_reconectar';
          }
          
          await base44.entities.ConfiguracaoSistema.update(
            configs.length > 0 ? configs[0].id : (await base44.entities.ConfiguracaoSistema.filter({ chave: `evolution_${instancia}_status` }))[0].id,
            { valor: JSON.stringify(novoStatus) }
          );
        } catch (e) {
          console.error(`[${instancia}] Erro no teste de envio:`, e.message);
          novoStatus.recuperacao_automatica = 'falha';
          novoStatus.status_qr = 'necessario_reconectar';
        }
      }
    }

    return Response.json({
      success: true,
      instancia,
      status: novoStatus,
      recuperacao_iniciada: novoStatus.tentativas_falhas >= 3,
    });
  } catch (error) {
    console.error('Erro ao registrar erro Evolution:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});