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

    const telefone = telefoneRaw.replace(/\D/g, '');
    console.log(`\n${'='.repeat(80)}`);
    console.log('🚀 PULL HISTÓRICO - EVOLUTION API v2.3.7');
    console.log(`Telefone: ${telefone}`);
    console.log(`Instância: ${instancia}`);
    console.log(`${'='.repeat(80)}\n`);

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
    // EVOLUTION API v2.3.7 - Endpoint correto para chat/message
    // De acordo com a documentação oficial:
    // GET /chats/{instanceName}/{remoteJid}
    // POST /messages/send/{instanceName}
    // ════════════════════════════════════════════════════════════════════

    console.log('[TENTATIVA 1] GET /chats/{instanceName}/{remoteJid}');
    try {
      // Formato: telefone@s.whatsapp.net
      const remoteJid = `${telefone}@s.whatsapp.net`;
      const url = `${evUrl}/chats/${instancia}/${remoteJid}`;
      console.log(`URL: ${url}`);

      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${evKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (resp.ok) {
        const data = await resp.json();
        console.log(`✅ Status ${resp.status}`);
        console.log(`Response: ${JSON.stringify(data).slice(0, 300)}`);
        
        // A resposta pode ser um objeto com "messages"
        if (data.messages) {
          mensagensTotal = Array.isArray(data.messages) ? data.messages : [data.messages];
        } else if (data.data) {
          mensagensTotal = Array.isArray(data.data) ? data.data : [data.data];
        } else if (Array.isArray(data)) {
          mensagensTotal = data;
        }
      } else {
        const errText = await resp.text();
        console.log(`❌ Status ${resp.status}`);
        console.log(`Response: ${errText.slice(0, 300)}`);
      }
    } catch (err) {
      console.log(`❌ Erro: ${err.message}`);
    }

    // ════════════════════════════════════════════════════════════════════
    // TENTATIVA 2: GET /chats/{instanceName} (listar todos)
    // ════════════════════════════════════════════════════════════════════
    if (mensagensTotal.length === 0) {
      console.log('\n[TENTATIVA 2] GET /chats/{instanceName} - listar todos os chats');
      try {
        const url = `${evUrl}/chats/${instancia}`;
        console.log(`URL: ${url}`);

        const resp = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${evKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (resp.ok) {
          const data = await resp.json();
          console.log(`✅ Status ${resp.status}`);
          console.log(`Chats encontrados: ${JSON.stringify(data).length} bytes`);
          
          // Procurar pelo telefone na resposta
          if (Array.isArray(data)) {
            for (const chat of data) {
              if ((chat.id || chat.jid || '').includes(telefone)) {
                console.log(`✅ Chat encontrado: ${chat.id || chat.jid}`);
                if (chat.messages) {
                  mensagensTotal = Array.isArray(chat.messages) ? chat.messages : [chat.messages];
                }
                break;
              }
            }
          }
        } else {
          const errText = await resp.text();
          console.log(`❌ Status ${resp.status}: ${errText.slice(0, 200)}`);
        }
      } catch (err) {
        console.log(`❌ Erro: ${err.message}`);
      }
    }

    console.log(`\n📊 Mensagens obtidas: ${mensagensTotal.length}`);

    if (mensagensTotal.length === 0) {
      console.log('\n⚠️ Nenhuma mensagem foi obtida. Possíveis causas:');
      console.log('   1. O endpoint correto pode ser diferente');
      console.log('   2. A Evolution API pode não armazenar histórico completo');
      console.log('   3. Pode ser necessário usar webhooks para receber mensagens em tempo real');
      console.log('   4. Verifique: https://doc.evolution-api.com');
    }

    // ════════════════════════════════════════════════════════════════════
    // PROCESSAR E IMPORTAR MENSAGENS
    // ════════════════════════════════════════════════════════════════════

    // Buscar/criar cliente
    const clientesExistentes = await base44.asServiceRole.entities.Cliente.filter({
      empresa_id: empresaId,
      celular: telefone,
    }, null, 10);

    let clienteId = null;
    let clienteNome = null;
    if (clientesExistentes.length > 0) {
      clienteId = clientesExistentes[0].id;
      clienteNome = clientesExistentes[0].nome_completo;
    }

    // Buscar/criar conversa
    const conversasExistentes = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: telefone,
    }, null, 10);

    let conversa = null;
    if (conversasExistentes.length > 0) {
      conversa = conversasExistentes[0];
    } else {
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_id: clienteId,
        cliente_nome: clienteNome || `Contato ${telefone}`,
        cliente_telefone: telefone,
        whatsapp_id: `${telefone}@s.whatsapp.net`,
        status: 'ativa',
        ultima_mensagem: '',
        data_ultima_mensagem: new Date().toISOString(),
        usuario_responsavel_id: user.id,
        usuario_responsavel_nome: user.full_name,
        tipo_conexao: 'empresa',
        instancia: instancia,
      });
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
          continue;
        }

        const remetente = msg.fromMe || msg.from_me ? 'vendedor' : 'cliente';
        let tipoConteudo = 'texto';
        let arquivo_url = null;
        let texto = '';

        if (msg.type === 'image' || msg.mediaType === 'image') {
          tipoConteudo = 'imagem';
          arquivo_url = msg.image?.url || msg.media?.url;
        } else if (msg.type === 'audio' || msg.mediaType === 'audio') {
          tipoConteudo = 'audio';
          arquivo_url = msg.audio?.url || msg.media?.url;
        } else if (msg.type === 'video' || msg.mediaType === 'video') {
          tipoConteudo = 'video';
          arquivo_url = msg.video?.url || msg.media?.url;
        } else if (msg.type === 'document' || msg.mediaType === 'document') {
          tipoConteudo = 'pdf';
          arquivo_url = msg.document?.url || msg.media?.url;
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
          arquivo_nome: arquivo_url ? 'arquivo' : null,
          whatsapp_message_id: msgId || null,
          data_envio: msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString(),
          status: 'entregue',
        });

        importadas++;
        msgIdMap.add(msgId);
      } catch (err) {
        console.warn(`⚠️ Erro ao importar: ${err.message}`);
      }
    }

    console.log(`${'='.repeat(80)}`);
    console.log(`✅ ${importadas} mensagens importadas`);
    console.log(`${'='.repeat(80)}\n`);

    return Response.json({
      success: true,
      telefone,
      conversaId: conversa.id,
      mensagensObtidas: mensagensTotal.length,
      mensagensImportadas: importadas,
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});