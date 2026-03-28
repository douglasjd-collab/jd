import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { telefone, forceFull = true } = await req.json();

    if (!telefone) {
      return Response.json({ error: 'Telefone não fornecido' }, { status: 400 });
    }

    console.log(`\n${'='.repeat(100)}`);
    console.log(`🔐 SINCRONIZAÇÃO RIGOROSA: ${telefone}`);
    console.log(`${'='.repeat(100)}\n`);

    // ════════════════════════════════════════════════════════════════════
    // CONFIG
    // ════════════════════════════════════════════════════════════════════
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    if (!evolutionUrl || !evolutionKey || !instanceName) {
      return Response.json({ error: 'Evolution API não configurada' }, { status: 500 });
    }

    const jid = `${telefone}@s.whatsapp.net`;
    const telefoneLimpo = telefone.replace(/\D/g, '');

    // ════════════════════════════════════════════════════════════════════
    // [PASSO 1] Buscar todas as mensagens da Evolution API com RIGOR
    // ════════════════════════════════════════════════════════════════════
    let mensagensEvolution = [];
    let tentativas = 0;
    const maxTentativas = 3;

    // Tentar estratégia 1: getMessage direto
    while (tentativas < maxTentativas && mensagensEvolution.length === 0) {
      tentativas++;
      try {
        console.log(`[TENTATIVA ${tentativas}] getMessage direto...`);
        const res = await fetch(
          `${evolutionUrl}/message/${instanceName}/getMessage?remoteJid=${jid}`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
          }
        );

        if (res.ok) {
          const data = await res.json();
          if (data.messages && Array.isArray(data.messages)) {
            mensagensEvolution = data.messages;
            console.log(`✅ ${mensagensEvolution.length} mensagens obtidas\n`);
            break;
          }
        }
      } catch (e) {
        console.log(`⚠️ Erro: ${e.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Tentar estratégia 2: findMessages POST
    if (mensagensEvolution.length === 0) {
      try {
        console.log(`[ESTRATÉGIA 2] findMessages via POST...`);
        const res = await fetch(
          `${evolutionUrl}/chat/${instanceName}/findMessages`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
            body: JSON.stringify({ remoteJid: jid, limit: 500 }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          if (data.messages && Array.isArray(data.messages)) {
            mensagensEvolution = data.messages;
            console.log(`✅ ${mensagensEvolution.length} mensagens obtidas\n`);
          }
        }
      } catch (e) {
        console.log(`⚠️ Erro: ${e.message}`);
      }
    }

    console.log(`[RESUMO] Evolution API: ${mensagensEvolution.length} mensagens totais\n`);

    // ════════════════════════════════════════════════════════════════════
    // [PASSO 2] Garantir empresa e cliente
    // ════════════════════════════════════════════════════════════════════
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
    if (empresas.length === 0) {
      throw new Error('Nenhuma empresa ativa encontrada');
    }

    const empresaId = empresas[0].id;
    console.log(`[EMPRESA] ${empresaId}\n`);

    let clienteId = null;
    const clientesExistentes = await base44.asServiceRole.entities.Cliente.filter({
      empresa_id: empresaId,
      celular: telefoneLimpo,
    }, null, 1);

    if (clientesExistentes.length === 0) {
      const novoCliente = await base44.asServiceRole.entities.Cliente.create({
        empresa_id: empresaId,
        tipo_pessoa: 'Física',
        nome_completo: `Contato ${telefoneLimpo}`,
        celular: telefoneLimpo,
        status: 'ativo',
      });
      clienteId = novoCliente.id;
      console.log(`[CLIENTE] Criado: ${clienteId}\n`);
    } else {
      clienteId = clientesExistentes[0].id;
      console.log(`[CLIENTE] Encontrado: ${clienteId}\n`);
    }

    // ════════════════════════════════════════════════════════════════════
    // [PASSO 3] Garantir conversa
    // ════════════════════════════════════════════════════════════════════
    const conversasExistentes = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: telefoneLimpo,
    }, null, 1);

    let conversaId = null;
    if (conversasExistentes.length === 0) {
      const novaConversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_id: clienteId,
        cliente_nome: clientesExistentes[0]?.nome_completo || `Contato ${telefoneLimpo}`,
        cliente_telefone: telefoneLimpo,
        whatsapp_id: jid,
        status: 'ativa',
        tipo_conexao: 'empresa',
        instancia: instanceName,
      });
      conversaId = novaConversa.id;
      console.log(`[CONVERSA] Criada: ${conversaId}\n`);
    } else {
      conversaId = conversasExistentes[0].id;
      console.log(`[CONVERSA] Encontrada: ${conversaId}\n`);
    }

    // ════════════════════════════════════════════════════════════════════
    // [PASSO 4] Sincronizar CADA mensagem com RIGOR
    // ════════════════════════════════════════════════════════════════════
    let sincronizadas = 0;
    let duplicatas = 0;
    let erros = 0;

    const mensagensIdsExistentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { conversa_id: conversaId },
      null,
      10000
    ).then(msgs => new Set(msgs.map(m => m.whatsapp_message_id)));

    console.log(`[CRM ATUAL] ${mensagensIdsExistentes.size} mensagens no CRM\n`);

    for (const msg of mensagensEvolution) {
      try {
        const messageId = msg.key?.id || msg.id;
        const remetente = msg.key?.fromMe ? 'vendedor' : 'cliente';
        const conteudo = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        '[Arquivo/Mídia]';

        // Verificar duplicata
        if (messageId && mensagensIdsExistentes.has(messageId)) {
          duplicatas++;
          continue;
        }

        // Criar mensagem
        await base44.asServiceRole.entities.MensagemWhatsapp.create({
          conversa_id: conversaId,
          empresa_id: empresaId,
          remetente: remetente,
          tipo_conteudo: msg.message?.conversation ? 'texto' :
                        msg.message?.imageMessage ? 'imagem' :
                        msg.message?.audioMessage ? 'audio' :
                        msg.message?.videoMessage ? 'video' :
                        msg.message?.documentMessage ? 'documento' : 'texto',
          texto: conteudo.slice(0, 5000),
          whatsapp_message_id: messageId || null,
          data_envio: msg.messageTimestamp
            ? new Date(msg.messageTimestamp * 1000).toISOString()
            : new Date().toISOString(),
          status: 'entregue',
        });

        sincronizadas++;
        if (sincronizadas % 10 === 0) {
          console.log(`⏳ ${sincronizadas} sincronizadas...`);
        }
      } catch (e) {
        erros++;
        console.warn(`[ERRO na msg] ${e.message}`);
      }
    }

    // Atualizar conversa
    await base44.asServiceRole.entities.ConversaWhatsapp.update(conversaId, {
      ultima_mensagem: mensagensEvolution[mensagensEvolution.length - 1]?.message?.conversation?.slice(0, 100) || '[Sync completo]',
      data_ultima_mensagem: new Date().toISOString(),
    });

    console.log(`\n${'='.repeat(100)}`);
    console.log(`✅ SINCRONIZAÇÃO CONCLUÍDA COM RIGOR`);
    console.log(`   Sincronizadas: ${sincronizadas}`);
    console.log(`   Duplicatas: ${duplicatas}`);
    console.log(`   Erros: ${erros}`);
    console.log(`${'='.repeat(100)}\n`);

    return Response.json({
      success: true,
      telefone: telefoneLimpo,
      conversaId,
      evolutionTotal: mensagensEvolution.length,
      sincronizadas,
      duplicatas,
      erros,
    });

  } catch (error) {
    console.error('[ERRO CRÍTICO]:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});