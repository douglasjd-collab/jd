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
    console.log(`🔥 SINCRONIZAÇÃO AGRESSIVA: ${telefoneLimpo}`);
    console.log(`${'='.repeat(100)}\n`);

    // ════════════════════════════════════════════════════════════════════
    // [1] Puxar TUDO da Evolution API
    // ════════════════════════════════════════════════════════════════════
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    let mensagensEvolution = [];

    // Estratégia 1: fetchMessages (endpoint simples)
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
        console.log(`[Estratégia 1] fetchMessages: ${mensagensEvolution.length} mensagens`);
      }
    } catch (e) {
      console.log(`Estratégia 1 falhou: ${e.message}`);
    }

    // Estratégia 2: getMessage POST
    if (mensagensEvolution.length === 0) {
      try {
        const res = await fetch(`${evolutionUrl}/message/${instanceName}/getMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
          body: JSON.stringify({ remoteJid: jid }),
        });
        if (res.ok) {
          const data = await res.json();
          mensagensEvolution = data.messages || data || [];
          console.log(`[Estratégia 2] getMessage POST: ${mensagensEvolution.length} mensagens`);
        }
      } catch (e) {
        console.log(`Estratégia 2 falhou: ${e.message}`);
      }
    }

    // Estratégia 3: listMessages
    if (mensagensEvolution.length === 0) {
      try {
        const res = await fetch(`${evolutionUrl}/chat/${instanceName}/listMessages/${jid}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
        });
        if (res.ok) {
          const data = await res.json();
          mensagensEvolution = data.messages || data || [];
          console.log(`[Estratégia 3] listMessages: ${mensagensEvolution.length} mensagens`);
        }
      } catch (e) {
        console.log(`Estratégia 3 falhou: ${e.message}`);
      }
    }

    console.log(`\n✅ Total de mensagens da Evolution: ${mensagensEvolution.length}\n`);

    // ════════════════════════════════════════════════════════════════════
    // [2] Garantir que empresa existe
    // ════════════════════════════════════════════════════════════════════
    let empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' }, null, 1);
    if (empresas.length === 0) {
      console.log('❌ Nenhuma empresa ativa encontrada!');
      return Response.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });
    }

    const empresaId = empresas[0].id;
    console.log(`✅ Usando empresa: ${empresaId}\n`);

    // ════════════════════════════════════════════════════════════════════
    // [3] Garantir que cliente existe
    // ════════════════════════════════════════════════════════════════════
    let clientes = await base44.asServiceRole.entities.Cliente.filter({
      empresa_id: empresaId,
      celular: telefoneLimpo,
    }, null, 1);

    let cliente;
    if (clientes.length === 0) {
      // Criar cliente automaticamente
      console.log(`[CLIENTE] Criando novo cliente...`);
      cliente = await base44.asServiceRole.entities.Cliente.create({
        empresa_id: empresaId,
        tipo_pessoa: 'Física',
        celular: telefoneLimpo,
        email: `${telefoneLimpo}@whatsapp.local`,
        nome_completo: `Contato ${telefoneLimpo}`,
        status: 'ativo',
      });
      console.log(`✅ Cliente criado: ${cliente.id}\n`);
    } else {
      cliente = clientes[0];
      console.log(`✅ Cliente encontrado: ${cliente.id}\n`);
    }

    // ════════════════════════════════════════════════════════════════════
    // [4] Garantir que conversa existe
    // ════════════════════════════════════════════════════════════════════
    let conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_id: cliente.id,
      cliente_telefone: telefoneLimpo,
    }, null, 1);

    let conversa;
    if (conversas.length === 0) {
      console.log(`[CONVERSA] Criando nova conversa...`);
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_id: cliente.id,
        cliente_nome: cliente.nome_completo,
        cliente_telefone: telefoneLimpo,
        whatsapp_id: jid,
        status: 'ativa',
        type_conexao: 'empresa',
      });
      console.log(`✅ Conversa criada: ${conversa.id}\n`);
    } else {
      conversa = conversas[0];
      console.log(`✅ Conversa encontrada: ${conversa.id}\n`);
    }

    // ════════════════════════════════════════════════════════════════════
    // [5] SINCRONIZAÇÃO AGRESSIVA - Inserir todas as mensagens EM LOTE
    // ════════════════════════════════════════════════════════════════════
    console.log(`[SINCRONIZAÇÃO] Iniciando sincronização agressiva em lote...\n`);

    let sincronizadas = 0;
    let duplicatas = 0;
    let erros = 0;

    // Coletar IDs existentes
    const existentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
      conversa_id: conversa.id,
    }, null, 1000);
    const idsExistentes = new Set(existentes.map(m => m.whatsapp_message_id));

    // Preparar array para bulk create
    const novasMensagens = [];

    for (const msg of mensagensEvolution) {
      try {
        // Extrair dados da mensagem com fallback
        const msgId = msg.key?.id || msg.id || msg.message_id || `msg_${Date.now()}_${Math.random()}`;
        const fromMe = msg.key?.fromMe ?? msg.fromMe ?? false;
        
        // Extrair texto com múltiplas estratégias
        let texto = '';
        if (msg.message?.conversation) {
          texto = msg.message.conversation;
        } else if (msg.message?.text) {
          texto = msg.message.text;
        } else if (msg.body) {
          texto = msg.body;
        } else if (msg.text) {
          texto = msg.text;
        } else {
          texto = '[Arquivo/Mídia]';
        }

        const timestamp = msg.messageTimestamp || msg.timestamp || Math.floor(Date.now() / 1000);

        // Pular se já existe
        if (idsExistentes.has(msgId)) {
          duplicatas++;
          continue;
        }

        // Adicionar à lista de novas mensagens
        novasMensagens.push({
          conversa_id: conversa.id,
          empresa_id: empresaId,
          remetente: fromMe ? 'vendedor' : 'cliente',
          usuario_id: null,
          usuario_nome: null,
          tipo_conteudo: 'texto',
          texto: String(texto).slice(0, 5000),
          arquivo_url: null,
          arquivo_nome: null,
          arquivo_tamanho: 0,
          whatsapp_message_id: String(msgId),
          data_envio: new Date(timestamp * 1000).toISOString(),
          status: 'entregue',
        });
      } catch (e) {
        console.warn(`⚠️ Erro ao preparar mensagem: ${e.message}`);
        erros++;
      }
    }

    // Inserir todas as mensagens de uma vez
    if (novasMensagens.length > 0) {
      try {
        console.log(`💾 Inserindo ${novasMensagens.length} mensagens em lote...`);
        await base44.asServiceRole.entities.MensagemWhatsapp.bulkCreate(novasMensagens);
        sincronizadas = novasMensagens.length;
        console.log(`✅ ${sincronizadas} mensagens inseridas com sucesso!`);
      } catch (e) {
        console.error(`❌ Erro ao fazer bulk insert: ${e.message}`);
        
        // Fallback: inserir uma por uma
        console.log(`⚠️ Tentando inserir uma por uma...`);
        for (const msg of novasMensagens) {
          try {
            await base44.asServiceRole.entities.MensagemWhatsapp.create(msg);
            sincronizadas++;
          } catch (err) {
            console.warn(`❌ Erro em mensagem individual: ${err.message}`);
            erros++;
          }
        }
      }
    }

    // Atualizar conversa com última mensagem
    if (sincronizadas > 0) {
      await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
        ultima_mensagem: mensagensEvolution[0]?.message?.conversation || 'Mensagens sincronizadas',
        data_ultima_mensagem: new Date().toISOString(),
      });
    }

    console.log(`${'='.repeat(100)}`);
    console.log(`✅ SINCRONIZAÇÃO CONCLUÍDA`);
    console.log(`${'='.repeat(100)}`);
    console.log(`📥 Total Evolution: ${mensagensEvolution.length}`);
    console.log(`✅ Sincronizadas: ${sincronizadas}`);
    console.log(`⚠️  Duplicatas: ${duplicatas}`);
    console.log(`❌ Erros: ${erros}`);
    console.log(`${'='.repeat(100)}\n`);

    return Response.json({
      sucesso: true,
      telefone: telefoneLimpo,
      cliente_id: cliente.id,
      conversa_id: conversa.id,
      total_evolution: mensagensEvolution.length,
      sincronizadas,
      duplicatas,
      erros,
    });

  } catch (error) {
    console.error('[ERRO CRÍTICO]:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});