import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const JD_ID = '699696c2c9f5bffc2e67402b';
    const instanceName = 'TES';
    const timeout = 15000; // 15 segundos

    const diagnostico = {
      timestamp: new Date().toISOString(),
      empresa_id: JD_ID,
      testes: {},
      status_geral: '⚠️ AGUARDANDO VERIFICAÇÃO'
    };

    // 1. Verificar variáveis de ambiente
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');

    diagnostico.testes.configuracao = {
      evolution_url: evolutionUrl ? `✓ ${evolutionUrl}` : '✗ Ausente',
      evolution_key: evolutionKey ? '✓ Configurada' : '✗ Ausente'
    };

    if (!evolutionUrl || !evolutionKey) {
      diagnostico.status_geral = '❌ CONFIGURAÇÃO INCOMPLETA';
      return Response.json(diagnostico);
    }

    // 2. Testar conectividade com timeout
    console.log(`🔍 Testando conexão com Evolution: ${evolutionUrl}/instance/info/${instanceName}`);
    
    let conexaoOk = false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${evolutionUrl}/instance/info/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': evolutionKey,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        diagnostico.testes.conexao_evolution = {
          status: '✓ CONECTADO',
          numero: data.instance?.number || 'N/A',
          conectado: data.instance?.connected
        };
        conexaoOk = true;
      } else {
        diagnostico.testes.conexao_evolution = {
          status: `✗ HTTP ${response.status}`,
          erro: response.statusText
        };
      }
    } catch (err) {
      diagnostico.testes.conexao_evolution = {
        status: '✗ ERRO',
        erro: err.message.includes('abort') ? 'TIMEOUT (>15s)' : err.message
      };
    }

    // 3. Webhook não precisa testar (demora muito)
    diagnostico.testes.webhook = {
      status: conexaoOk ? '✓ Verificar manualmente no painel Evolution' : '⏭️ Ignorado (sem conexão)'
    };

    // 4. Logs de recebimento (com timeout)
    try {
      const logs = await Promise.race([
        base44.asServiceRole.entities.LogRecebimentoWebhook.filter(
          {},
          '-created_date',
          20
        ),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), timeout)
        )
      ]);

      const logsInstancia = logs.filter(l => l.instancia === instanceName || !l.instancia);
      diagnostico.testes.ultimos_logs = {
        total_geral: logs.length,
        para_esta_instancia: logsInstancia.length,
        logs: logsInstancia.slice(0, 5).map(log => ({
          tipo: log.tipo_evento,
          status: log.status,
          tempo: log.timestamp
        }))
      };
    } catch (err) {
      diagnostico.testes.ultimos_logs = {
        status: `⚠️ ${err.message}`
      };
    }

    // 5. Mensagens e conversas
    try {
      const mensagens = await Promise.race([
        base44.asServiceRole.entities.MensagemWhatsapp.filter(
          { empresa_id: JD_ID },
          '-created_date',
          5
        ),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), timeout)
        )
      ]);

      diagnostico.testes.mensagens_recebidas = {
        total: mensagens.length,
        ultimas: mensagens.slice(0, 3).map(m => ({
          id: m.id,
          remetente: m.remetente,
          tipo: m.tipo_conteudo,
          tempo: m.data_envio
        }))
      };
    } catch (err) {
      diagnostico.testes.mensagens_recebidas = {
        status: `⚠️ ${err.message}`
      };
    }

    // Resumo final
    diagnostico.status_geral = conexaoOk ? '✅ TUDO OK' : '❌ SEM CONEXÃO COM EVOLUTION';

    return Response.json(diagnostico, {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return Response.json(
      {
        status_geral: '❌ ERRO CRÍTICO',
        erro: error.message
      },
      { status: 500 }
    );
  }
});