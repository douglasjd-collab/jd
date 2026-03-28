import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Dados de entrada
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

    const contato = '5587991426333'; // Número alvo
    const evUrl = Deno.env.get('EVOLUTION_API_URL');
    const evKey = Deno.env.get('EVOLUTION_API_KEY');
    const instancia = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'instance';

    if (!evUrl || !evKey) {
      return Response.json({ error: 'Evolution API não configurada' }, { status: 400 });
    }

    console.log(`🚀 SINCRONIZAÇÃO AGRESSIVA para ${contato}...`);

    // ════════════════════════════════════════════════════════════════════
    // PASSO 1: Buscar ou criar CONVERSA
    // ════════════════════════════════════════════════════════════════════
    let conversa = null;
    const conversasExistentes = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: contato,
    });

    if (conversasExistentes.length > 0) {
      conversa = conversasExistentes[0];
      console.log(`✅ Conversa encontrada: ${conversa.id}`);
    } else {
      // Buscar cliente
      const clientes = await base44.asServiceRole.entities.Cliente.filter({
        empresa_id: empresaId,
        celular: contato,
      });
      const cliente = clientes.length > 0 ? clientes[0] : null;

      // Criar conversa
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_id: cliente?.id || null,
        cliente_nome: cliente?.nome_completo || 'Contato ' + contato,
        cliente_telefone: contato,
        whatsapp_id: contato,
        status: 'ativa',
        ultima_mensagem: '',
        data_ultima_mensagem: new Date().toISOString(),
        usuario_responsavel_id: user.id || null,
        usuario_responsavel_nome: user.full_name || 'Sistema',
        tipo_conexao: 'empresa',
        instancia: instancia,
      });
      console.log(`🆕 Conversa criada: ${conversa.id}`);
    }

    // ════════════════════════════════════════════════════════════════════
    // PASSO 2: Buscar TODAS as mensagens do Evolution
    // ════════════════════════════════════════════════════════════════════
    let mensagensFetchadas = [];
    try {
      // Tentar buscar via Evolution API
      const urlFetch = `${evUrl}/chats/fetchMessages/${instancia}`;
      const respFetch = await fetch(urlFetch, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${evKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: contato,
          limit: 1000,
        }),
      });

      if (respFetch.ok) {
        const data = await respFetch.json();
        mensagensFetchadas = data.data || data.messages || [];
        console.log(`📥 ${mensagensFetchadas.length} mensagens buscadas do Evolution`);
      } else {
        console.warn('Falha ao buscar mensagens do Evolution:', respFetch.status);
      }
    } catch (err) {
      console.warn('Erro ao chamar Evolution fetchMessages:', err.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // PASSO 3: Importar mensagens + criar se não existirem
    // ════════════════════════════════════════════════════════════════════
    let importadas = 0;
    let puladas = 0;

    // Buscar mensagens já registradas para evitar duplicatas
    const mensagensExistentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
      conversa_id: conversa.id,
    }, null, 5000);

    const msgIds = new Set(mensagensExistentes.map(m => m.whatsapp_message_id).filter(Boolean));

    for (const msg of mensagensFetchadas) {
      // Skip se já existe
      const msgId = msg.id || msg.message_id || msg.key?.id || null;
      if (msgId && msgIds.has(msgId)) {
        puladas++;
        continue;
      }

      try {
        // Mapear remetente (enviada pelo contato? ou pela empresa?)
        const remetente = msg.fromMe || msg.sender?.fromMe ? 'vendedor' : 'cliente';

        // Mapear tipo de conteúdo
        let tipoConteudo = 'texto';
        let arquivo_url = null;
        let arquivo_nome = null;
        let texto = '';

        if (msg.type === 'image' || msg.mediaType === 'image') {
          tipoConteudo = 'imagem';
          arquivo_url = msg.image?.url || msg.media?.url || null;
          arquivo_nome = 'imagem.jpg';
        } else if (msg.type === 'audio' || msg.mediaType === 'audio') {
          tipoConteudo = 'audio';
          arquivo_url = msg.audio?.url || msg.media?.url || null;
          arquivo_nome = 'audio.m4a';
        } else if (msg.type === 'video' || msg.mediaType === 'video') {
          tipoConteudo = 'video';
          arquivo_url = msg.video?.url || msg.media?.url || null;
          arquivo_nome = 'video.mp4';
        } else if (msg.type === 'document' || msg.mediaType === 'document') {
          tipoConteudo = 'pdf';
          arquivo_url = msg.document?.url || msg.media?.url || null;
          arquivo_nome = msg.document?.filename || msg.media?.filename || 'documento.pdf';
        } else {
          tipoConteudo = 'texto';
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
          arquivo_nome: arquivo_nome,
          whatsapp_message_id: msgId,
          data_envio: msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString(),
          status: 'entregue',
        });

        importadas++;
        console.log(`✅ Mensagem importada: ${msgId}`);
      } catch (err) {
        console.error(`❌ Erro ao importar mensagem:`, err.message);
        puladas++;
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // PASSO 4: Atualizar conversa
    // ════════════════════════════════════════════════════════════════════
    if (mensagensFetchadas.length > 0) {
      const ultimaMsg = mensagensFetchadas[mensagensFetchadas.length - 1];
      await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
        ultima_mensagem: ultimaMsg.body || ultimaMsg.text || '[Mídia]',
        data_ultima_mensagem: new Date().toISOString(),
        status: 'ativa',
      });
    }

    return Response.json({
      success: true,
      conversa_id: conversa.id,
      mensagens_importadas: importadas,
      mensagens_puladas: puladas,
      total_buscado: mensagensFetchadas.length,
      message: `✅ SUCESSO! ${importadas} mensagens sincronizadas para ${contato}`,
    });

  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});