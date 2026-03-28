import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Determinar empresa
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

    const evUrl = Deno.env.get('EVOLUTION_API_URL');
    const evKey = Deno.env.get('EVOLUTION_API_KEY');
    const instancia = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'instance';

    if (!evUrl || !evKey) {
      return Response.json({ error: 'Evolution não configurado' }, { status: 400 });
    }

    console.log('🚀 SINCRONIZAÇÃO AGRESSIVA - Evolution → CRM');

    // ════════════════════════════════════════════════════════════════════
    // 1. Listar TODOS os chats ativos do Evolution
    // ════════════════════════════════════════════════════════════════════
    let chatsEvolution = [];
    try {
      const urlChats = `${evUrl}/chats/findAllChats/${instancia}`;
      const respChats = await fetch(urlChats, {
        headers: { 'Authorization': `Bearer ${evKey}` },
      });

      if (respChats.ok) {
        const dataChats = await respChats.json();
        chatsEvolution = (dataChats.data || dataChats.chats || [])
          .filter(c => c.number || c.phone) // Apenas chats com número
          .slice(0, 100); // Top 100 mais recentes
        console.log(`📞 ${chatsEvolution.length} chats encontrados`);
      }
    } catch (err) {
      console.warn('Erro ao listar chats:', err.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // 2. Para CADA chat, buscar mensagens do Evolution
    // ════════════════════════════════════════════════════════════════════
    let totalImportadas = 0;
    let totalConversas = 0;

    for (const chat of chatsEvolution) {
      const telefone = (chat.number || chat.phone || '').replace(/\D/g, '');
      if (!telefone || telefone.length < 11) continue;

      const telefoneFull = telefone.length === 11 ? '55' + telefone : '55' + telefone.slice(-11);

      console.log(`\n📱 Processando: ${telefone}`);

      try {
        // ────────────────────────────────────────────────────────────────
        // 2a. Buscar/criar CONVERSA
        // ────────────────────────────────────────────────────────────────
        let conversa = null;
        const conversasExist = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
          empresa_id: empresaId,
          cliente_telefone: telefone,
        });

        if (conversasExist.length > 0) {
          conversa = conversasExist[0];
        } else {
          // Buscar cliente
          const clientes = await base44.asServiceRole.entities.Cliente.filter({
            empresa_id: empresaId,
            celular: telefone,
          });
          const cliente = clientes.length > 0 ? clientes[0] : null;

          conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
            empresa_id: empresaId,
            cliente_id: cliente?.id || null,
            cliente_nome: chat.name || cliente?.nome_completo || 'Contato ' + telefone,
            cliente_telefone: telefone,
            whatsapp_id: telefoneFull,
            status: 'ativa',
            ultima_mensagem: '',
            data_ultima_mensagem: new Date().toISOString(),
            usuario_responsavel_id: user.id,
            usuario_responsavel_nome: user.full_name,
            tipo_conexao: 'empresa',
            instancia: instancia,
          });
          totalConversas++;
        }

        // ────────────────────────────────────────────────────────────────
        // 2b. Buscar mensagens do Evolution para este chat
        // ────────────────────────────────────────────────────────────────
        let mensagensEvol = [];
        try {
          const urlMsg = `${evUrl}/chats/fetchMessages/${instancia}`;
          const respMsg = await fetch(urlMsg, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${evKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phone: telefone,
              limit: 500,
              fromMe: false, // Apenas mensagens do contato
            }),
          });

          if (respMsg.ok) {
            const dataMsg = await respMsg.json();
            mensagensEvol = (dataMsg.data || dataMsg.messages || [])
              .filter(m => !m.fromMe); // Mensagens recebidas
            console.log(`  📥 ${mensagensEvol.length} mensagens encontradas`);
          }
        } catch (err) {
          console.warn(`  Erro ao buscar mensagens para ${telefone}:`, err.message);
        }

        // ────────────────────────────────────────────────────────────────
        // 2c. Importar mensagens para o CRM
        // ────────────────────────────────────────────────────────────────
        const msgExistentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
          conversa_id: conversa.id,
        }, null, 5000);

        const msgIds = new Set(msgExistentes.map(m => m.whatsapp_message_id).filter(Boolean));
        let importadasEstaConversa = 0;

        for (const msg of mensagensEvol) {
          const msgId = msg.id || msg.message_id || msg.key?.id;
          if (msgId && msgIds.has(msgId)) continue;

          try {
            // Determinar tipo de conteúdo
            let tipoConteudo = 'texto';
            let texto = '';
            let arqUrl = null;
            let arqNome = null;

            if (msg.mediaType === 'image') {
              tipoConteudo = 'imagem';
              arqUrl = msg.image?.url || msg.media?.url;
              arqNome = 'imagem.jpg';
            } else if (msg.mediaType === 'audio') {
              tipoConteudo = 'audio';
              arqUrl = msg.audio?.url || msg.media?.url;
              arqNome = 'audio.m4a';
            } else if (msg.mediaType === 'video') {
              tipoConteudo = 'video';
              arqUrl = msg.video?.url || msg.media?.url;
              arqNome = 'video.mp4';
            } else if (msg.mediaType === 'document') {
              tipoConteudo = 'pdf';
              arqUrl = msg.document?.url || msg.media?.url;
              arqNome = msg.document?.filename || 'documento.pdf';
            } else {
              texto = msg.body || msg.text || '';
            }

            // Criar mensagem
            await base44.asServiceRole.entities.MensagemWhatsapp.create({
              conversa_id: conversa.id,
              empresa_id: empresaId,
              remetente: 'cliente',
              tipo_conteudo: tipoConteudo,
              texto: texto,
              arquivo_url: arqUrl,
              arquivo_nome: arqNome,
              whatsapp_message_id: msgId,
              data_envio: msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString(),
              status: 'entregue',
            });

            importadasEstaConversa++;
          } catch (err) {
            console.warn(`    Erro ao importar msg ${msgId}:`, err.message);
          }
        }

        if (importadasEstaConversa > 0) {
          totalImportadas += importadasEstaConversa;
          // Atualizar conversa
          if (mensagensEvol.length > 0) {
            const ultimaMsg = mensagensEvol[0];
            await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
              ultima_mensagem: ultimaMsg.body || ultimaMsg.text || '[Mídia]',
              data_ultima_mensagem: new Date().toISOString(),
            });
          }
          console.log(`  ✅ ${importadasEstaConversa} mensagens importadas para conversa`);
        }

      } catch (err) {
        console.error(`❌ Erro ao processar ${telefone}:`, err.message);
      }
    }

    return Response.json({
      success: true,
      total_chats_processados: chatsEvolution.length,
      total_conversas_criadas: totalConversas,
      total_mensagens_importadas: totalImportadas,
      message: `✅ SINCRONIZAÇÃO COMPLETA! ${totalImportadas} mensagens importadas de ${chatsEvolution.length} chats`,
    });

  } catch (error) {
    console.error('❌ Erro geral:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});