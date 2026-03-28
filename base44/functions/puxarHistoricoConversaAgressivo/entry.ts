import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json();
    const telefoneRaw = body.telefone || '558791426333';
    
    const evUrl = Deno.env.get('EVOLUTION_API_URL');
    const evKey = Deno.env.get('EVOLUTION_API_KEY');
    const instancia = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'JDPROMOTORA';

    if (!evUrl || !evKey) {
      return Response.json({ error: 'Evolution API não configurada' }, { status: 400 });
    }

    // Normalizar número
    const telefone = telefoneRaw.replace(/\D/g, '');
    const telefoneComPais = telefone.startsWith('55') ? telefone : `55${telefone}`;
    const telefoneWhatsapp = `${telefoneComPais}@s.whatsapp.net`;

    console.log(`\n${'='.repeat(80)}`);
    console.log('🚀 PULL AGRESSIVO DE HISTÓRICO DE CONVERSA');
    console.log(`Número: ${telefone}`);
    console.log(`Instância: ${instancia}`);
    console.log(`${'='.repeat(80)}\n`);

    // Encontrar empresa
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

    let mensagensTotal = [];

    // ════════════════════════════════════════════════════════════════════
    // TENTATIVA 1: POST /messages/fetchMessages
    // ════════════════════════════════════════════════════════════════════
    console.log('[TENTATIVA 1] POST /messages/fetchMessages');
    try {
      const url1 = `${evUrl}/messages/fetchMessages/${instancia}`;
      console.log(`URL: ${url1}`);
      console.log(`Body: { "phone": "${telefone}", "limit": 1000 }`);

      const resp1 = await fetch(url1, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${evKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: telefone, limit: 1000 }),
      });

      if (resp1.ok) {
        const data1 = await resp1.json();
        const msgs = data1.data || data1.messages || data1.response || [];
        console.log(`✅ Sucesso: ${msgs.length} mensagens`);
        mensagensTotal = msgs;
      } else {
        const errText = await resp1.text();
        console.log(`❌ Status ${resp1.status}: ${errText.slice(0, 200)}`);
      }
    } catch (err) {
      console.log(`❌ Erro: ${err.message}`);
    }

    // ════════════════════════════════════════════════════════════════════
    // TENTATIVA 2: GET /messages/{phone}/all
    // ════════════════════════════════════════════════════════════════════
    if (mensagensTotal.length === 0) {
      console.log('\n[TENTATIVA 2] GET /messages/{phone}/all');
      try {
        const url2 = `${evUrl}/messages/${telefone}/all/${instancia}`;
        console.log(`URL: ${url2}`);

        const resp2 = await fetch(url2, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${evKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (resp2.ok) {
          const data2 = await resp2.json();
          const msgs = data2.data || data2.messages || data2.response || [];
          console.log(`✅ Sucesso: ${msgs.length} mensagens`);
          mensagensTotal = msgs;
        } else {
          const errText = await resp2.text();
          console.log(`❌ Status ${resp2.status}: ${errText.slice(0, 200)}`);
        }
      } catch (err) {
        console.log(`❌ Erro: ${err.message}`);
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // TENTATIVA 3: POST /chats/fetch (algumas versões usam isso)
    // ════════════════════════════════════════════════════════════════════
    if (mensagensTotal.length === 0) {
      console.log('\n[TENTATIVA 3] POST /chats/fetch');
      try {
        const url3 = `${evUrl}/chats/fetch/${instancia}`;
        console.log(`URL: ${url3}`);

        const resp3 = await fetch(url3, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${evKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone: telefone }),
        });

        if (resp3.ok) {
          const data3 = await resp3.json();
          const msgs = data3.data || data3.messages || data3.response || [];
          console.log(`✅ Sucesso: ${msgs.length} mensagens`);
          mensagensTotal = msgs;
        } else {
          const errText = await resp3.text();
          console.log(`❌ Status ${resp3.status}: ${errText.slice(0, 200)}`);
        }
      } catch (err) {
        console.log(`❌ Erro: ${err.message}`);
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // TENTATIVA 4: POST /messages/fetch
    // ════════════════════════════════════════════════════════════════════
    if (mensagensTotal.length === 0) {
      console.log('\n[TENTATIVA 4] POST /messages/fetch');
      try {
        const url4 = `${evUrl}/messages/fetch/${instancia}`;
        console.log(`URL: ${url4}`);

        const resp4 = await fetch(url4, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${evKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone: telefone, limit: 1000 }),
        });

        if (resp4.ok) {
          const data4 = await resp4.json();
          const msgs = data4.data || data4.messages || data4.response || [];
          console.log(`✅ Sucesso: ${msgs.length} mensagens`);
          mensagensTotal = msgs;
        } else {
          const errText = await resp4.text();
          console.log(`❌ Status ${resp4.status}: ${errText.slice(0, 200)}`);
        }
      } catch (err) {
        console.log(`❌ Erro: ${err.message}`);
      }
    }

    console.log(`\n📊 RESULTADO: ${mensagensTotal.length} mensagens obtidas\n`);

    // ════════════════════════════════════════════════════════════════════
    // PROCESSAR MENSAGENS
    // ════════════════════════════════════════════════════════════════════
    if (mensagensTotal.length === 0) {
      console.log('❌ Nenhuma mensagem foi retornada pelos endpoints testados.');
      return Response.json({
        success: false,
        error: 'Nenhuma mensagem obtida - endpoints indisponíveis',
        tentativas: 4,
      });
    }

    // Buscar ou criar cliente
    const clientesExistentes = await base44.asServiceRole.entities.Cliente.filter({
      empresa_id: empresaId,
      celular: telefone,
    }, null, 10);

    let clienteId = null;
    let clienteNome = null;
    if (clientesExistentes.length > 0) {
      clienteId = clientesExistentes[0].id;
      clienteNome = clientesExistentes[0].nome_completo;
      console.log(`✅ Cliente encontrado: ${clienteNome}`);
    } else {
      console.log(`ℹ️  Cliente não encontrado`);
    }

    // Buscar ou criar conversa
    const conversasExistentes = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: telefone,
    }, null, 10);

    let conversa = null;
    if (conversasExistentes.length > 0) {
      conversa = conversasExistentes[0];
      console.log(`✅ Conversa encontrada: ${conversa.id}`);
    } else {
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_id: clienteId,
        cliente_nome: clienteNome || `Contato ${telefone}`,
        cliente_telefone: telefone,
        whatsapp_id: telefoneWhatsapp,
        status: 'ativa',
        ultima_mensagem: '',
        data_ultima_mensagem: new Date().toISOString(),
        usuario_responsavel_id: user.id,
        usuario_responsavel_nome: user.full_name,
        tipo_conexao: 'empresa',
        instancia: 'JDPROMOTORA',
      });
      console.log(`🆕 Conversa criada: ${conversa.id}`);
    }

    // Buscar mensagens existentes
    const mensagensExistentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
      conversa_id: conversa.id,
    }, null, 5000);

    const msgIdMap = new Set(mensagensExistentes.map(m => m.whatsapp_message_id).filter(Boolean));

    // Importar mensagens
    let importadas = 0;
    for (const msg of mensagensTotal) {
      try {
        const msgId = msg.id || msg.key?.id || msg.messageId;
        if (msgId && msgIdMap.has(msgId)) {
          continue; // já existe
        }

        const remetente = msg.fromMe || msg.from_me || false ? 'vendedor' : 'cliente';
        let tipoConteudo = 'texto';
        let arquivo_url = null;
        let arquivo_nome = null;
        let texto = '';

        // Detectar tipo de conteúdo
        if (msg.type === 'image' || msg.mediaType === 'image') {
          tipoConteudo = 'imagem';
          arquivo_url = msg.image?.url || msg.media?.url || msg.imageUrl;
        } else if (msg.type === 'audio' || msg.mediaType === 'audio') {
          tipoConteudo = 'audio';
          arquivo_url = msg.audio?.url || msg.media?.url || msg.audioUrl;
        } else if (msg.type === 'video' || msg.mediaType === 'video') {
          tipoConteudo = 'video';
          arquivo_url = msg.video?.url || msg.media?.url || msg.videoUrl;
        } else if (msg.type === 'document' || msg.mediaType === 'document') {
          tipoConteudo = 'pdf';
          arquivo_url = msg.document?.url || msg.media?.url || msg.documentUrl;
        } else {
          texto = msg.body || msg.text || msg.message || '';
        }

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

        importadas++;
        msgIdMap.add(msgId);
      } catch (err) {
        console.warn(`⚠️ Erro ao importar mensagem: ${err.message}`);
      }
    }

    console.log(`${'='.repeat(80)}`);
    console.log(`✅ ${importadas} mensagens importadas para a conversa`);
    console.log(`${'='.repeat(80)}\n`);

    return Response.json({
      success: true,
      telefone,
      conversaId: conversa.id,
      mensagensObtidas: mensagensTotal.length,
      mensagensImportadas: importadas,
      clienteId: clienteId || 'não encontrado',
    });

  } catch (error) {
    console.error('❌ Erro crítico:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});