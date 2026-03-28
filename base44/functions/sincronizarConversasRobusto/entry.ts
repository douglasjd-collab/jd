import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const evUrl = Deno.env.get('EVOLUTION_API_URL');
    const evKey = Deno.env.get('EVOLUTION_API_KEY');
    const instancia = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'JDPROMOTORA';

    if (!evUrl || !evKey) {
      return Response.json({ error: 'Evolution API não configurada' }, { status: 400 });
    }

    // Encontrar empresa_id
    let empresaId = null;
    if (user.role === 'super_admin' || user.perfil === 'super_admin') {
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) empresaId = empresas[0].id;
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: user.id, status: 'ativo' });
      if (colabs.length > 0) empresaId = colabs[0].empresa_id;
    }

    if (!empresaId) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 400 });
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('🚀 SINCRONIZAÇÃO ROBUSTA DE CONVERSAS');
    console.log(`Empresa: ${empresaId}`);
    console.log(`Instância: ${instancia}`);
    console.log(`${'='.repeat(80)}\n`);

    // ════════════════════════════════════════════════════════════════════
    // PASSO 1: Buscar TODAS as conversas da Evolution
    // ════════════════════════════════════════════════════════════════════
    console.log('📥 [PASSO 1] Buscando conversas da Evolution...');
    let conversasEvolution = [];
    try {
      const urlChats = `${evUrl}/chats/findAll/${instancia}`;
      const respChats = await fetch(urlChats, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${evKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (respChats.ok) {
        const dataChats = await respChats.json();
        conversasEvolution = dataChats.response || dataChats.chats || dataChats.data || [];
        console.log(`✅ ${conversasEvolution.length} conversas encontradas na Evolution`);
      } else {
        console.warn(`⚠️ Falha ao buscar chats: ${respChats.status}`);
      }
    } catch (err) {
      console.error('❌ Erro ao buscar conversas:', err.message);
      return Response.json({ error: 'Falha ao buscar conversas da Evolution' }, { status: 500 });
    }

    // ════════════════════════════════════════════════════════════════════
    // PASSO 2: Processar cada conversa
    // ════════════════════════════════════════════════════════════════════
    console.log('\n📊 [PASSO 2] Processando conversas...\n');

    let conversasCriadas = 0;
    let conversasAtualizadas = 0;
    let mensagensImportadas = 0;
    const erros = [];

    for (const chat of conversasEvolution) {
      try {
        // Extrair número do telefone
        const jid = chat.id || chat.jid || '';
        const telefone = jid.replace(/[^0-9]/g, '');

        if (!telefone || telefone.length < 10) {
          console.log(`⏭️  Pulando chat com JID inválido: ${jid}`);
          continue;
        }

        console.log(`\n🔄 Processando: ${telefone}`);

        // Buscar cliente
        const clientesExistentes = await base44.asServiceRole.entities.Cliente.filter({
          empresa_id: empresaId,
          celular: telefone,
        }, null, 10);

        let clienteId = null;
        let clienteNome = null;
        if (clientesExistentes.length > 0) {
          clienteId = clientesExistentes[0].id;
          clienteNome = clientesExistentes[0].nome_completo;
          console.log(`  ✅ Cliente encontrado: ${clienteNome}`);
        } else {
          console.log(`  ℹ️  Cliente não encontrado, será criado ao receber mensagem`);
        }

        // Buscar ou criar conversa
        const conversasExistentes = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
          empresa_id: empresaId,
          cliente_telefone: telefone,
        }, null, 10);

        let conversa = null;
        if (conversasExistentes.length > 0) {
          conversa = conversasExistentes[0];
          console.log(`  ✅ Conversa encontrada: ${conversa.id}`);

          // Atualizar status
          await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
            status: 'ativa',
            whatsapp_id: jid,
            instancia: instancia,
          });
          conversasAtualizadas++;
        } else {
          // Criar nova conversa
          conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
            empresa_id: empresaId,
            cliente_id: clienteId,
            cliente_nome: clienteNome || `Contato ${telefone}`,
            cliente_telefone: telefone,
            whatsapp_id: jid,
            status: 'ativa',
            ultima_mensagem: chat.lastMessage || '',
            data_ultima_mensagem: new Date().toISOString(),
            usuario_responsavel_id: user.id,
            usuario_responsavel_nome: user.full_name,
            tipo_conexao: 'empresa',
            instancia: instancia,
          });
          console.log(`  🆕 Conversa criada: ${conversa.id}`);
          conversasCriadas++;
        }

        // ════════════════════════════════════════════════════════════════════
        // PASSO 3: Buscar mensagens desta conversa
        // ════════════════════════════════════════════════════════════════════
        console.log(`  📨 Buscando mensagens...`);
        let mensagensChat = [];
        try {
          const urlMsgs = `${evUrl}/chats/fetchMessages/${instancia}`;
          const respMsgs = await fetch(urlMsgs, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${evKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phone: telefone,
              limit: 500,
            }),
          });

          if (respMsgs.ok) {
            const dataMsgs = await respMsgs.json();
            mensagensChat = dataMsgs.data || dataMsgs.messages || [];
            console.log(`    📦 ${mensagensChat.length} mensagens encontradas`);
          } else {
            console.warn(`    ⚠️ Falha ao buscar mensagens: ${respMsgs.status}`);
          }
        } catch (err) {
          console.warn(`    ⚠️ Erro ao buscar mensagens: ${err.message}`);
        }

        // ════════════════════════════════════════════════════════════════════
        // PASSO 4: Importar mensagens
        // ════════════════════════════════════════════════════════════════════
        if (mensagensChat.length > 0) {
          // Buscar mensagens já existentes
          const mensagensExistentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
            conversa_id: conversa.id,
          }, null, 5000);

          const msgIdMap = new Set(mensagensExistentes.map(m => m.whatsapp_message_id).filter(Boolean));

          let novasAdicionadas = 0;
          for (const msg of mensagensChat) {
            try {
              const msgId = msg.id || msg.message_id || msg.key?.id;
              if (msgId && msgIdMap.has(msgId)) {
                continue; // já existe
              }

              // Mapear dados
              const remetente = msg.fromMe ? 'vendedor' : 'cliente';
              let tipoConteudo = 'texto';
              let arquivo_url = null;
              let arquivo_nome = null;
              let texto = '';

              if (msg.type === 'image' || msg.mediaType === 'image') {
                tipoConteudo = 'imagem';
                arquivo_url = msg.image?.url || msg.media?.url || msg.image_url;
              } else if (msg.type === 'audio' || msg.mediaType === 'audio') {
                tipoConteudo = 'audio';
                arquivo_url = msg.audio?.url || msg.media?.url || msg.audio_url;
              } else if (msg.type === 'video' || msg.mediaType === 'video') {
                tipoConteudo = 'video';
                arquivo_url = msg.video?.url || msg.media?.url || msg.video_url;
              } else if (msg.type === 'document' || msg.mediaType === 'document') {
                tipoConteudo = 'pdf';
                arquivo_url = msg.document?.url || msg.media?.url || msg.document_url;
              } else {
                texto = msg.body || msg.text || msg.message || '';
              }

              // Criar mensagem
              await base44.asServiceRole.entities.MensagemWhatsapp.create({
                conversa_id: conversa.id,
                empresa_id: empresaId,
                remetente: remetente,
                usuario_id: remetente === 'vendedor' ? user.id : null,
                usuario_nome: remetente === 'vendedor' ? user.full_name : null,
                tipo_conteudo: tipoConteudo,
                texto: texto,
                arquivo_url: arquivo_url,
                arquivo_nome: arquivo_nome || (tipoConteudo === 'imagem' ? 'imagem.jpg' : 'arquivo'),
                whatsapp_message_id: msgId || null,
                data_envio: msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString(),
                status: 'entregue',
              });

              novasAdicionadas++;
              msgIdMap.add(msgId);
            } catch (err) {
              console.warn(`    ⚠️ Erro ao importar mensagem: ${err.message}`);
            }
          }

          mensagensImportadas += novasAdicionadas;
          console.log(`    ✅ ${novasAdicionadas} mensagens importadas`);
        }

      } catch (err) {
        console.error(`❌ Erro ao processar conversa: ${err.message}`);
        erros.push(err.message);
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 RESUMO');
    console.log(`Conversas criadas: ${conversasCriadas}`);
    console.log(`Conversas atualizadas: ${conversasAtualizadas}`);
    console.log(`Mensagens importadas: ${mensagensImportadas}`);
    console.log(`Erros: ${erros.length}`);
    console.log(`${'='.repeat(80)}\n`);

    return Response.json({
      success: true,
      conversasCriadas,
      conversasAtualizadas,
      mensagensImportadas,
      erros: erros.slice(0, 10),
      totalConversas: conversasEvolution.length,
    });

  } catch (error) {
    console.error('❌ Erro crítico:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});