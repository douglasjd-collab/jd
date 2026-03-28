import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { telefone, api } = await req.json();

    console.log('\n' + '='.repeat(80));
    console.log(`🔄 SINCRONIZAÇÃO ${api?.toUpperCase() || 'AMBAS'}`);
    console.log('='.repeat(80) + '\n');

    if (!telefone) {
      return Response.json({ error: 'Telefone não fornecido' }, { status: 400 });
    }

    const telefoneLimpo = telefone.replace(/\D/g, '');
    const jid = `${telefoneLimpo}@s.whatsapp.net`;

    // Garantir empresa
    let empresas = await base44.asServiceRole.entities.Empresa.filter(
      { status: 'ativa' },
      null,
      1
    );
    if (empresas.length === 0) {
      return Response.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });
    }

    const empresaId = empresas[0].id;

    // ════════════════════════════════════════════════════════════════════
    // [1] SINCRONIZAR EVOLUTION (se solicitado)
    // ════════════════════════════════════════════════════════════════════
    let sincEvolution = 0;

    if (!api || api === 'evolution') {
      console.log('📥 [1] Sincronizando EVOLUTION API...\n');

      const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
      const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
      const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

      let mensagensEvolution = [];

      // Tentar fetchMessages
      try {
        const res = await fetch(
          `${evolutionUrl}/message/${instanceName}/fetchMessages?remoteJid=${jid}&limit=500`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
          }
        );
        if (res.ok) {
          const data = await res.json();
          mensagensEvolution = Array.isArray(data) ? data : (data.messages || []);
          console.log(`✅ Evolution: ${mensagensEvolution.length} mensagens encontradas`);
        }
      } catch (e) {
        console.log(`⚠️ Erro ao buscar Evolution: ${e.message}`);
      }

      // Processar mensagens da Evolution
      if (mensagensEvolution.length > 0) {
        const existentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
          { empresa_id: empresaId },
          null,
          1000
        );
        const idsExistentes = new Set(existentes.map(m => m.whatsapp_message_id));

        const novasMensagens = [];

        for (const msg of mensagensEvolution) {
          const msgId = msg.key?.id || msg.id || `msg_${Date.now()}`;
          if (idsExistentes.has(msgId)) continue;

          // Encontrar ou criar cliente
          let clientes = await base44.asServiceRole.entities.Cliente.filter({
            empresa_id: empresaId,
            celular: telefoneLimpo,
          }, null, 1);

          let cliente = clientes[0];
          if (!cliente) {
            cliente = await base44.asServiceRole.entities.Cliente.create({
              empresa_id: empresaId,
              tipo_pessoa: 'Física',
              celular: telefoneLimpo,
              email: `${telefoneLimpo}@whatsapp.local`,
              nome_completo: `Contato ${telefoneLimpo}`,
              status: 'ativo',
            });
          }

          // Encontrar ou criar conversa
          let conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
            empresa_id: empresaId,
            cliente_id: cliente.id,
          }, null, 1);

          let conversa = conversas[0];
          if (!conversa) {
            conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
              empresa_id: empresaId,
              cliente_id: cliente.id,
              cliente_nome: cliente.nome_completo,
              cliente_telefone: telefoneLimpo,
              whatsapp_id: jid,
              status: 'ativa',
              tipo_conexao: 'empresa',
              instancia: 'EVOLUTION',
            });
          }

          novasMensagens.push({
            conversa_id: conversa.id,
            empresa_id: empresaId,
            remetente: msg.key?.fromMe ? 'vendedor' : 'cliente',
            usuario_id: null,
            usuario_nome: null,
            tipo_conteudo: 'texto',
            texto: (msg.message?.conversation || msg.body || '[Mídia]').slice(0, 5000),
            arquivo_url: null,
            arquivo_nome: null,
            arquivo_tamanho: 0,
            whatsapp_message_id: String(msgId),
            data_envio: new Date((msg.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
            status: 'entregue',
          });
        }

        if (novasMensagens.length > 0) {
          try {
            await base44.asServiceRole.entities.MensagemWhatsapp.bulkCreate(novasMensagens);
            sincEvolution = novasMensagens.length;
            console.log(`✅ ${sincEvolution} mensagens da Evolution sincronizadas`);
          } catch (e) {
            console.warn(`⚠️ Erro no bulk insert Evolution: ${e.message}`);
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // [2] SINCRONIZAR API OFICIAL (se solicitado)
    // ════════════════════════════════════════════════════════════════════
    let sincOficial = 0;

    if (!api || api === 'oficial') {
      console.log('\n📥 [2] Sincronizando API OFICIAL...\n');

      // Nota: A API Oficial usa webhooks, não há endpoint de histórico
      // As mensagens chegam via webhook em tempo real
      console.log('ℹ️  API Oficial sincroniza via webhooks em tempo real');
      console.log('✅ Configure o webhook da API Oficial para este endpoint');
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ SINCRONIZAÇÃO CONCLUÍDA');
    console.log('='.repeat(80));
    console.log(`📊 Evolution: ${sincEvolution} mensagens`);
    console.log(`📊 Oficial: (via webhooks)`);
    console.log('='.repeat(80) + '\n');

    return Response.json({
      sucesso: true,
      telefone: telefoneLimpo,
      evolution: sincEvolution,
      oficial: 0,
      total: sincEvolution,
    });

  } catch (error) {
    console.error('[ERRO CRÍTICO]:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});