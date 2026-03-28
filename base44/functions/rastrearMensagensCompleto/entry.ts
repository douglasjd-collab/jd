import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { telefone } = await req.json();

    if (!telefone) {
      return Response.json({ error: 'Telefone não fornecido' }, { status: 400 });
    }

    const telefoneLimpo = telefone.replace(/\D/g, '');
    const jid = `${telefoneLimpo}@s.whatsapp.net`;

    console.log(`\n${'='.repeat(100)}`);
    console.log(`🔍 RASTREAMENTO COMPLETO: ${telefoneLimpo}`);
    console.log(`${'='.repeat(100)}\n`);

    // ════════════════════════════════════════════════════════════════════
    // [ETAPA 1] Mensagens na Evolution API
    // ════════════════════════════════════════════════════════════════════
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    let mensagensEvolution = [];
    try {
      const res = await fetch(
        `${evolutionUrl}/message/${instanceName}/getMessage?remoteJid=${jid}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
        }
      );

      if (res.ok) {
        const data = await res.json();
        mensagensEvolution = data.messages || [];
      }
    } catch (e) {
      console.warn('Erro ao buscar Evolution:', e.message);
    }

    console.log(`[ETAPA 1] Evolution API: ${mensagensEvolution.length} mensagens\n`);

    // ════════════════════════════════════════════════════════════════════
    // [ETAPA 2] Logs de webhook recebido
    // ════════════════════════════════════════════════════════════════════
    let logsWebhook = [];
    try {
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' }, null, 1);
      if (empresas.length > 0) {
        logsWebhook = await base44.asServiceRole.entities.LogRecebimentoWebhook.filter(
          { empresa_id: empresas[0].id },
          '-created_date',
          500
        );

        // Filtrar por telefone
        logsWebhook = logsWebhook.filter(log => {
          try {
            const payload = JSON.parse(log.payload_json || '{}');
            const tel = (payload.from || payload.data?.message?.from || '').replace(/\D/g, '');
            return tel === telefoneLimpo;
          } catch {
            return false;
          }
        });
      }
    } catch (e) {
      console.warn('Erro ao buscar logs webhook:', e.message);
    }

    console.log(`[ETAPA 2] Webhooks recebidos: ${logsWebhook.length}\n`);

    // ════════════════════════════════════════════════════════════════════
    // [ETAPA 3] Cliente no CRM
    // ════════════════════════════════════════════════════════════════════
    let cliente = null;
    let conversas = [];
    let mensagensNCRM = [];

    try {
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' }, null, 1);
      if (empresas.length > 0) {
        const empresaId = empresas[0].id;

        // Buscar cliente
        const clientes = await base44.asServiceRole.entities.Cliente.filter({
          empresa_id: empresaId,
          celular: telefoneLimpo,
        }, null, 1);

        if (clientes.length > 0) {
          cliente = clientes[0];
          console.log(`[ETAPA 3] Cliente encontrado: ${cliente.id}\n`);

          // Buscar conversas
          conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
            empresa_id: empresaId,
            cliente_telefone: telefoneLimpo,
          }, null, 10);

          console.log(`[ETAPA 4] Conversas: ${conversas.length}\n`);

          // Buscar mensagens em cada conversa
          for (const conversa of conversas) {
            const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
              conversa_id: conversa.id,
            }, '-created_date', 1000);
            mensagensNCRM.push(...msgs);
          }

          console.log(`[ETAPA 5] Mensagens no CRM: ${mensagensNCRM.length}\n`);
        } else {
          console.log(`[ETAPA 3] Cliente NÃO encontrado\n`);
        }
      }
    } catch (e) {
      console.warn('Erro ao buscar CRM:', e.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // [ANÁLISE] Onde as mensagens estão ficando?
    // ════════════════════════════════════════════════════════════════════
    const analise = {
      emEvolution: mensagensEvolution.length,
      webhooksRecebidos: logsWebhook.length,
      nosCRM: mensagensNCRM.length,
      clienteExiste: !!cliente,
      conversasExistem: conversas.length > 0,
    };

    let diagnostico = [];

    if (analise.emEvolution === 0) {
      diagnostico.push({
        nivel: 'CRÍTICO',
        problema: '❌ NENHUMA mensagem na Evolution API',
        causa: 'Pode ser que a instância Evolution não está conectada ao WhatsApp ou não está recebendo mensagens',
        solucao: 'Verifique a configuração da Evolution API em Configuração WhatsApp',
      });
    }

    if (analise.webhooksRecebidos === 0 && analise.emEvolution > 0) {
      diagnostico.push({
        nivel: 'CRÍTICO',
        problema: '❌ Webhooks NÃO chegam (Evolution tem mensagens mas webhook não foi acionado)',
        causa: 'O webhook não está configurado corretamente na Evolution ou está retornando erro',
        solucao: 'Vá em Configuração WhatsApp e reconfigurem o webhook',
      });
    }

    if (!analise.clienteExiste && analise.webhooksRecebidos > 0) {
      diagnostico.push({
        nivel: 'AVISO',
        problema: '⚠️ Cliente não existe no CRM',
        causa: 'O webhook chegou mas o cliente não foi criado automaticamente',
        solucao: 'Crie o cliente manualmente ou force a sincronização',
      });
    }

    if (!analise.conversasExistem && analise.clienteExiste) {
      diagnostico.push({
        nivel: 'AVISO',
        problema: '⚠️ Conversa não existe',
        causa: 'O cliente existe mas a conversa não foi criada',
        solucao: 'Force a sincronização das mensagens',
      });
    }

    if (analise.nosCRM < analise.emEvolution) {
      const diferenca = analise.emEvolution - analise.nosCRM;
      diagnostico.push({
        nivel: 'AVISO',
        problema: `⚠️ ${diferenca} mensagens faltam no CRM`,
        causa: 'Evolution tem mensagens que não foram sincronizadas',
        solucao: 'Use "Sincronizar RIGOR" na página de comparação',
      });
    }

    if (diagnostico.length === 0) {
      diagnostico.push({
        nivel: 'OK',
        problema: '✅ Tudo sincronizado corretamente',
        causa: 'Nenhum problema detectado',
        solucao: 'Sistema operacional normalmente',
      });
    }

    console.log(`${'='.repeat(100)}`);
    console.log('DIAGNÓSTICO RESUMIDO');
    console.log(`${'='.repeat(100)}`);
    diagnostico.forEach(d => {
      console.log(`[${d.nivel}] ${d.problema}`);
    });
    console.log(`${'='.repeat(100)}\n`);

    return Response.json({
      telefone: telefoneLimpo,
      analise,
      diagnostico,
      mensagensEvolution: mensagensEvolution.map(m => ({
        id: m.key?.id || m.id,
        de: m.key?.fromMe ? 'ENVIADO' : 'RECEBIDO',
        tipo: m.message?.conversation ? 'texto' : 'outro',
        conteudo: (m.message?.conversation || '[Arquivo]').slice(0, 50),
        timestamp: m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleString('pt-BR') : '',
      })),
      logsWebhook: logsWebhook.map(log => ({
        id: log.id,
        criado: new Date(log.created_date).toLocaleString('pt-BR'),
        tipo: log.tipo_evento,
        statusResposta: log.status_resposta,
      })),
      mensagensNCRM: mensagensNCRM.map(m => ({
        id: m.id,
        remetente: m.remetente,
        tipo: m.tipo_conteudo,
        conteudo: (m.texto || '').slice(0, 50),
        enviada: new Date(m.data_envio).toLocaleString('pt-BR'),
      })),
    });

  } catch (error) {
    console.error('[ERRO CRÍTICO]:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});