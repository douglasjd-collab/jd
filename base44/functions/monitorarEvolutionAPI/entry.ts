/**
 * Monitoramento automático da Evolution API.
 * Verifica status, detecta falhas e envia alertas.
 * Executado via automação agendada.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Buscar todas as empresas com Evolution configurada
    let empresas = [];
    try {
      empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' }, null, 200);
      empresas = empresas.filter(e => e.evolution_url && e.evolution_api_key);
    } catch (_) {}

    const resultados = [];

    for (const empresa of empresas) {
      const baseUrl = (empresa.evolution_url || '').replace(/\/$/, '');
      const apiKey = empresa.evolution_api_key;

      const resultado = {
        empresa_id: empresa.id,
        empresa_nome: empresa.nome,
        evolution_online: false,
        instancias: [],
        problemas: [],
        acao_tomada: null
      };

      // 1. Verificar se Evolution está online
      try {
        const resp = await fetch(`${baseUrl}/`, {
          headers: { 'apikey': apiKey },
          signal: AbortSignal.timeout(8000)
        });
        resultado.evolution_online = resp.status < 500;
      } catch (_) {
        resultado.evolution_online = false;
        resultado.problemas.push('Evolution API inacessível');
      }

      // 2. Buscar instâncias
      if (resultado.evolution_online) {
        try {
          const resp = await fetch(`${baseUrl}/instance/fetchInstances`, {
            headers: { 'apikey': apiKey },
            signal: AbortSignal.timeout(10000)
          });
          if (resp.ok) {
            const data = await resp.json();
            const instancias = Array.isArray(data) ? data : (data.instances || []);
            resultado.instancias = instancias.map(inst => ({
              nome: inst.instance?.instanceName || inst.name || inst.instanceName,
              status: inst.instance?.status || inst.status || inst.state || 'unknown'
            }));
          }
        } catch (_) {}

        // Verificar instâncias desconectadas
        const desconectadas = resultado.instancias.filter(i =>
          !['open', 'connected', 'CONNECTED'].includes(i.status)
        );
        if (desconectadas.length > 0) {
          resultado.problemas.push(`${desconectadas.length} instância(s) desconectada(s): ${desconectadas.map(i => i.nome).join(', ')}`);
        }
      }

      // 3. Verificar últimas mensagens recebidas (detectar webhook parado)
      if (resultado.evolution_online && empresa.id) {
        try {
          const agoraISO = new Date().toISOString();
          const limit30min = new Date(Date.now() - 30 * 60 * 1000).toISOString();
          
          // Buscar mensagens recentes do cliente (recebidas via webhook)
          const msgsRecentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
            empresa_id: empresa.id,
            remetente: 'cliente'
          }, '-data_envio', 5);

          if (msgsRecentes.length > 0) {
            const ultimaMsg = msgsRecentes[0];
            const dataUltimaMsg = ultimaMsg.data_envio || ultimaMsg.created_date;
            if (dataUltimaMsg && dataUltimaMsg < limit30min) {
              resultado.problemas.push(`Nenhuma mensagem recebida há mais de 30 min (última: ${dataUltimaMsg})`);
            }
          }
        } catch (_) {}
      }

      // 4. Se há problemas críticos, tomar ações
      if (resultado.problemas.length > 0) {
        // Verificar versão do WhatsApp Web como possível causa
        let versaoConfigurada = null;
        let versaoMaisRecente = null;
        
        try {
          const configs = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({
            chave: 'whatsapp_versao_configurada'
          });
          if (configs.length > 0) versaoConfigurada = configs[0].valor;
        } catch (_) {}

        // Tentar reconectar instâncias desconectadas (sem deletar)
        const desconectadas = resultado.instancias.filter(i =>
          !['open', 'connected', 'CONNECTED'].includes(i.status)
        );
        
        for (const inst of desconectadas) {
          try {
            const resp = await fetch(`${baseUrl}/instance/connect/${inst.nome}`, {
              method: 'GET',
              headers: { 'apikey': apiKey },
              signal: AbortSignal.timeout(10000)
            });
            if (resp.ok) {
              resultado.acao_tomada = `Tentou reconectar: ${inst.nome}`;
            }
          } catch (_) {}
        }

        // Enviar alerta via Telegram
        const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
        const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID');
        
        if (telegramToken && telegramChatId) {
          // Verificar se já enviou alerta nos últimos 30 min para não spam
          const ultimoAlerta = await base44.asServiceRole.entities.LogVersaoWhatsApp.filter({
            empresa_id: empresa.id,
            acao: 'alerta_falha'
          }, '-created_date', 1).catch(() => []);

          const ultimoAlertaRecente = ultimoAlerta.length > 0 &&
            ultimoAlerta[0].created_date > new Date(Date.now() - 30 * 60 * 1000).toISOString();

          if (!ultimoAlertaRecente) {
            const msg = `🚨 *Alerta Evolution API*\n\n` +
              `*Empresa:* ${empresa.nome}\n` +
              `*Online:* ${resultado.evolution_online ? '✅' : '❌'}\n` +
              `*Instâncias:* ${resultado.instancias.length} (${resultado.instancias.filter(i => ['open','connected','CONNECTED'].includes(i.status)).length} conectadas)\n\n` +
              `*Problemas:*\n${resultado.problemas.map(p => `• ${p}`).join('\n')}\n\n` +
              `Acesse o CRM > Configurações > WhatsApp para verificar.`;

            await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: telegramChatId, text: msg, parse_mode: 'Markdown' })
            }).catch(() => {});

            // Registrar log do alerta
            await base44.asServiceRole.entities.LogVersaoWhatsApp.create({
              empresa_id: empresa.id,
              acao: 'alerta_falha',
              sucesso: false,
              status_antes: JSON.stringify(resultado.instancias),
              detalhes: resultado.problemas.join('; '),
              erro: resultado.problemas.join('; ')
            }).catch(() => {});
          }
        }
      }

      resultados.push(resultado);
    }

    const totalProblemas = resultados.reduce((acc, r) => acc + r.problemas.length, 0);

    return Response.json({
      success: true,
      empresas_monitoradas: resultados.length,
      total_problemas: totalProblemas,
      resultados,
      verificado_em: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erro no monitoramento:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});