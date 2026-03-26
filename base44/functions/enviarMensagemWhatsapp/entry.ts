import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  console.log('='.repeat(80));
  console.log('📤 ENVIAR MENSAGEM WHATSAPP');
  console.log('='.repeat(80));
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    console.log('👤 Usuário:', user?.email);

    if (!user) {
      console.error('❌ Usuário não autenticado');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ler payload
    const bodyText = await req.text();
    console.log('📥 Payload recebido:', bodyText);
    
    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch (e) {
      console.error('❌ Erro ao parsear JSON:', e.message);
      return Response.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const { conversa_id, mensagem_texto, numero_cliente, arquivo } = payload;
    
    console.log('📋 Parâmetros:');
    console.log('  - conversa_id:', conversa_id);
    console.log('  - mensagem_texto:', mensagem_texto?.substring(0, 50));
    console.log('  - numero_cliente:', numero_cliente);
    console.log('  - arquivo:', arquivo ? 'presente' : 'nenhum');
    console.log('📋 Payload completo:', JSON.stringify(payload).substring(0, 200));

    if (!conversa_id) {
      console.error('❌ conversa_id faltando');
      return Response.json({ error: 'conversa_id é obrigatório' }, { status: 400 });
    }
    
    if (!mensagem_texto?.trim() && !arquivo) {
      console.error('❌ mensagem_texto vazio e nenhum arquivo');
      return Response.json({ error: 'texto ou arquivo é obrigatório' }, { status: 400 });
    }
    
    if (!numero_cliente) {
      console.error('❌ numero_cliente faltando');
      return Response.json({ error: 'numero_cliente é obrigatório' }, { status: 400 });
    }

    // Buscar empresa e credenciais Evolution
    let evolutionApiKey, evolutionApiUrl, instanceName;
    
    // Tentar obter empresa_id do payload ou user
    let empresaId = payload.empresa_id || user.empresa_id;
    
    // SE USAR INSTÂNCIA TESTE, DEVE SER JD PROMOTORA
    if (empresaId) {
      const empresa = await base44.asServiceRole.entities.Empresa.get(empresaId);
      if (empresa) {
        instanceName = empresa.evolution_instance_name;
        
        // Se a instância é TESTE, redirecionar para JD Promotora
        evolutionApiKey = empresa.evolution_api_key;
        evolutionApiUrl = empresa.evolution_url;
        console.log('📦 Credenciais da empresa carregadas:', { instanceName });
      }
    }
    
    // Fallback para variáveis de ambiente se não encontrar na empresa
    if (!evolutionApiKey) evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!evolutionApiUrl) evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    if (!instanceName) instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    console.log('🔐 Verificando credenciais Evolution:');
    console.log('  - URL:', evolutionApiUrl ? '✅' : '❌');
    console.log('  - Key:', evolutionApiKey ? '✅' : '❌');
    console.log('  - Instance:', instanceName ? '✅' : '❌');

    if (!evolutionApiKey || !evolutionApiUrl || !instanceName) {
      console.error('❌ Credenciais Evolution faltando');
      return Response.json({ 
        error: 'Evolution API não configurada. Configure na página de Configuração WhatsApp' 
      }, { status: 400 });
    }

    // Detectar se é grupo (@g.us)
    const isGrupo = numero_cliente.includes('@g.us');
    
    // Formatar número (grupos mantêm o JID, individuais limpam formatação)
    const numeroFormatado = isGrupo ? numero_cliente : numero_cliente.replace(/\D/g, '');
    console.log('📱 Número/JID formatado:', numeroFormatado, isGrupo ? '(grupo)' : '(individual)');

    // Validar número apenas para conversas individuais
    if (!isGrupo && numeroFormatado.length < 10) {
      console.error('❌ Número inválido - menos de 10 dígitos');
      return Response.json({ 
        error: 'Número de telefone inválido. Deve ter pelo menos 10 dígitos',
        success: false
      }, { status: 400 });
    }

    // Preparar requisição para Evolution — texto ou mídia
    const baseUrl = evolutionApiUrl.replace(/\/$/, '');
    let endpoint, requestPayload;

    if (arquivo && arquivo.base64) {
      // Detectar tipo e endpoint correto
      const tipo = arquivo.tipo || '';
      if (tipo.startsWith('image')) {
        endpoint = `${baseUrl}/message/sendMedia/${instanceName}`;
        requestPayload = {
          number: numeroFormatado,
          mediatype: 'image',
          media: arquivo.base64,
          fileName: arquivo.nome,
          caption: mensagem_texto || ''
        };
      } else if (tipo.startsWith('audio')) {
        endpoint = `${baseUrl}/message/sendWhatsAppAudio/${instanceName}`;
        requestPayload = {
          number: numeroFormatado,
          audio: arquivo.base64,
          encoding: true
        };
      } else if (tipo.startsWith('video')) {
        endpoint = `${baseUrl}/message/sendMedia/${instanceName}`;
        requestPayload = {
          number: numeroFormatado,
          mediatype: 'video',
          media: arquivo.base64,
          fileName: arquivo.nome,
          caption: mensagem_texto || ''
        };
      } else {
        // PDF ou documento
        endpoint = `${baseUrl}/message/sendMedia/${instanceName}`;
        requestPayload = {
          number: numeroFormatado,
          mediatype: 'document',
          media: arquivo.base64,
          fileName: arquivo.nome,
          caption: mensagem_texto || ''
        };
      }
    } else {
      endpoint = `${baseUrl}/message/sendText/${instanceName}`;
      requestPayload = {
        number: numeroFormatado,
        text: mensagem_texto.trim()
      };
    }

    console.log('🎯 Endpoint:', endpoint);
    console.log('📦 Payload tipo:', arquivo ? arquivo.tipo : 'texto');
    console.log('📱 Número:', numeroFormatado);

    // Enviar para Evolution API
    console.log('📤 Enviando para Evolution API...');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey
      },
      body: JSON.stringify(requestPayload)
    });

    console.log('📥 Status Evolution:', response.status);
    const responseText = await response.text();
    console.log('📥 Response body:', responseText.substring(0, 500));

    if (!response.ok) {
      console.error('❌ Evolution API retornou erro:');
      console.error('Status:', response.status);
      console.error('Body:', responseText);

      // Analisar erro específico
      let mensagemErro = 'Erro ao enviar via WhatsApp';
      try {
        const errorData = JSON.parse(responseText);
        if (errorData.response?.message) {
          const msg = errorData.response.message[0];
          if (msg && msg.exists === false) {
            mensagemErro = `Número ${msg.number} não possui WhatsApp ativo`;
          }
        }
      } catch (_) {}

      return Response.json({ 
        error: mensagemErro,
        details: responseText,
        status: response.status,
        success: false
      }, { status: 400 });
    }

    let result;
    try {
      result = JSON.parse(responseText);
      console.log('✅ Resposta parseada:', result);
    } catch (e) {
      console.error('⚠️ Erro ao parsear resposta Evolution:', e.message);
      result = { raw: responseText };
    }

    // Garantir que a conversa existe
    console.log('📋 Verificando se conversa existe...');
    let conversa = null;
    try {
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.get(conversa_id);
      console.log('✅ Conversa encontrada:', conversa.id);
    } catch (e) {
      console.log('⚠️ Conversa não encontrada, criando nova...');
      
      // Se não existir, criar a conversa
      const empresaIdFinal = empresaId || payload.empresa_id || '699696c2c9f5bffc2e67402b';
      const telefoneLimpo = numeroFormatado.replace(/\D/g, '');
      
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaIdFinal,
        cliente_telefone: telefoneLimpo,
        cliente_nome: payload.cliente_nome || telefoneLimpo,
        whatsapp_id: `conv_${Date.now()}`,
        status: 'ativa',
        ultima_mensagem: '',
        data_ultima_mensagem: new Date().toISOString(),
        tipo_conexao: 'empresa'
      });
      console.log('✅ Conversa criada:', conversa.id);
    }

    // Criar registro de mensagem no banco
    console.log('💾 Salvando mensagem no banco...');
    
    const empresaIdFinal = empresaId || payload.empresa_id || '699696c2c9f5bffc2e67402b';

    // Determinar tipo de conteúdo
    let tipo_conteudo = 'texto';
    let arquivo_url_permanente = null;

    if (arquivo && arquivo.base64) {
      const tipo = arquivo.tipo || '';
      if (tipo.startsWith('image')) tipo_conteudo = 'imagem';
      else if (tipo.startsWith('audio')) tipo_conteudo = 'audio';
      else if (tipo.startsWith('video')) tipo_conteudo = 'video';
      else tipo_conteudo = 'pdf';

      // Upload para Base44 para URL permanente
      try {
        const binaryStr = atob(arquivo.base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const blob = new Blob([bytes], { type: arquivo.tipo || 'application/octet-stream' });
        const uploadRes = await base44.integrations.Core.UploadFile({ file: blob });
        if (uploadRes?.file_url) {
          arquivo_url_permanente = uploadRes.file_url;
          console.log('✅ Arquivo salvo permanentemente:', arquivo_url_permanente);
        }
      } catch (uploadErr) {
        console.error('⚠️ Erro ao fazer upload do arquivo:', uploadErr.message);
      }
    }

    const novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
      conversa_id: conversa_id,
      empresa_id: empresaIdFinal,
      remetente: 'vendedor',
      usuario_id: user.id,
      usuario_nome: user.full_name,
      tipo_conteudo: tipo_conteudo,
      texto: mensagem_texto || (arquivo ? `📎 ${arquivo.nome}` : ''),
      arquivo_url: arquivo_url_permanente,
      arquivo_nome: arquivo?.nome || null,
      arquivo_tamanho: 0,
      whatsapp_message_id: result.key?.id || result.messageId || result.id || 'pending',
      data_envio: new Date().toISOString(),
      status: 'enviada'
    });

    console.log('✅ Mensagem salva:', novaMensagem.id);

    console.log('='.repeat(80));
    console.log('✅ SUCESSO!');
    console.log('='.repeat(80));

    return Response.json({ 
      success: true,
      message_id: novaMensagem.id,
      whatsapp_id: result.key?.id || result.messageId || result.id
    });

  } catch (error) {
    console.log('='.repeat(80));
    console.log('❌ ERRO CRÍTICO');
    console.log('Mensagem:', error.message);
    console.log('Stack:', error.stack);
    console.log('='.repeat(80));
    
    return Response.json({
      success: false,
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
});