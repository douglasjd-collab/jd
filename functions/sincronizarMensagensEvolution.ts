import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  console.log('\n📱 SINCRONIZANDO MENSAGENS COM EVOLUTION API\n');
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversa_id, telefone, empresa_id } = await req.json();
    
    if (!conversa_id || !telefone || !empresa_id) {
      return Response.json({
        sucesso: false,
        erro: 'Parâmetros inválidos',
        mensagens_adicionadas: 0
      });
    }

    console.log('📋 Parâmetros:');
    console.log('  Conversa ID:', conversa_id);
    console.log('  Telefone:', telefone);
    console.log('  Empresa ID:', empresa_id);

    // Obter credenciais da Evolution API
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    if (!evolutionUrl || !evolutionKey || !instanceName) {
      console.log('⚠️ Credenciais da Evolution API não configuradas');
      return Response.json({
        sucesso: false,
        erro: 'Credenciais da Evolution API não configuradas',
        mensagens_adicionadas: 0
      });
    }

    // Obter mensagens já salvas no banco
    const mensagensExistentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
      conversa_id: conversa_id
    });
    
    const idsExistentes = new Set(mensagensExistentes.map(m => m.whatsapp_message_id));
    console.log('📦 Mensagens já no banco:', idsExistentes.size);

    // Chamar Evolution API para listar mensagens
    console.log('\n🔗 Conectando à Evolution API...');
    const cleanPhone = String(telefone).replace(/\D/g, '');
    const evolutionListUrl = `${evolutionUrl}/chats/list/${instanceName}?limit=100`;
    
    console.log('  URL:', evolutionListUrl);

    let evolutionMessages = [];
    try {
      const response = await fetch(evolutionListUrl, {
        method: 'GET',
        headers: {
          'apikey': evolutionKey,
          'Content-Type': 'application/json'
        }
      });

      console.log('  Status:', response.status);

      if (!response.ok) {
        console.log('⚠️ Erro ao obter mensagens da Evolution:', response.status);
        return Response.json({
          sucesso: true,
          mensagens_adicionadas: 0,
          aviso: 'Não foi possível sincronizar com Evolution API'
        });
      }

      const data = await response.json();
      console.log('  Resposta:', data ? 'OK' : 'Vazia');

      // Procurar chat do telefone
      if (data && Array.isArray(data)) {
        const chat = data.find(c => {
          const jid = c.id || c.jid || '';
          return jid.includes(cleanPhone) || c.name?.includes(telefone);
        });

        if (chat && chat.messages) {
          evolutionMessages = Array.isArray(chat.messages) ? chat.messages : [];
          console.log('  Mensagens encontradas:', evolutionMessages.length);
        }
      }
    } catch (error) {
      console.log('⚠️ Erro ao conectar Evolution:', error.message);
      // Continuar mesmo sem sincronizar com Evolution
    }

    // Adicionar mensagens da Evolution que não existem no banco
    let adicionadas = 0;
    for (const evMsg of evolutionMessages) {
      try {
        const msgId = evMsg.id || evMsg.key?.id;
        
        if (!msgId || idsExistentes.has(msgId)) {
          continue; // Já existe
        }

        const isFromMe = evMsg.fromMe || evMsg.key?.fromMe;
        if (isFromMe) {
          continue; // Ignorar mensagens do bot
        }

        // Extrair conteúdo
        let tipo = 'texto';
        let conteudo = '';

        if (evMsg.body || evMsg.text) {
          tipo = 'texto';
          conteudo = evMsg.body || evMsg.text;
        } else if (evMsg.image) {
          tipo = 'imagem';
          conteudo = 'Imagem';
        } else if (evMsg.audio) {
          tipo = 'audio';
          conteudo = 'Áudio';
        } else if (evMsg.video) {
          tipo = 'video';
          conteudo = 'Vídeo';
        } else if (evMsg.document) {
          tipo = 'pdf';
          conteudo = evMsg.document.filename || 'Documento';
        }

        if (!conteudo) continue;

        // Salvar mensagem
        await base44.asServiceRole.entities.MensagemWhatsapp.create({
          conversa_id: conversa_id,
          empresa_id: empresa_id,
          remetente: 'cliente',
          tipo_conteudo: tipo,
          texto: conteudo,
          whatsapp_message_id: msgId,
          data_envio: new Date(evMsg.timestamp * 1000).toISOString(),
          status: 'entregue'
        });

        adicionadas++;
        console.log('✅ Mensagem adicionada:', msgId);
        idsExistentes.add(msgId);

      } catch (error) {
        console.log('⚠️ Erro ao adicionar mensagem:', error.message);
      }
    }

    console.log('\n✅ SINCRONIZAÇÃO COMPLETA');
    console.log('  Novas mensagens:', adicionadas);
    console.log('  Total no banco:', idsExistentes.size);

    return Response.json({
      sucesso: true,
      mensagens_adicionadas: adicionadas,
      total_no_banco: idsExistentes.size
    });

  } catch (error) {
    console.error('❌ ERRO CRÍTICO:', error.message);
    return Response.json({
      sucesso: false,
      erro: error.message,
      mensagens_adicionadas: 0
    }, { status: 500 });
  }
});