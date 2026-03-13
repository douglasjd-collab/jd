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

    const { conversa_id, mensagem_texto, numero_cliente } = payload;
    
    console.log('📋 Parâmetros:');
    console.log('  - conversa_id:', conversa_id);
    console.log('  - mensagem_texto:', mensagem_texto?.substring(0, 50));
    console.log('  - numero_cliente:', numero_cliente);
    console.log('📋 Payload completo:', JSON.stringify(payload));

    if (!conversa_id) {
      console.error('❌ conversa_id faltando');
      return Response.json({ error: 'conversa_id é obrigatório' }, { status: 400 });
    }
    
    if (!mensagem_texto || mensagem_texto.trim() === '') {
      console.error('❌ mensagem_texto vazio ou nulo:', mensagem_texto);
      return Response.json({ error: 'mensagem_texto não pode estar vazio' }, { status: 400 });
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

    // Formatar número
    const numeroFormatado = numero_cliente.replace(/\D/g, '');
    console.log('📱 Número formatado:', numeroFormatado);

    // Preparar requisição para Evolution
    const endpoint = `${evolutionApiUrl.replace(/\/$/, '')}/message/sendText/${instanceName}`;
    const requestPayload = {
      number: numeroFormatado,
      text: mensagem_texto
    };

    console.log('🎯 Endpoint:', endpoint);
    console.log('📦 Payload Evolution:', JSON.stringify(requestPayload));

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
      
      return Response.json({ 
        error: 'Erro ao enviar via WhatsApp',
        details: responseText,
        status: response.status
      }, { status: 500 });
    }

    let result;
    try {
      result = JSON.parse(responseText);
      console.log('✅ Resposta parseada:', result);
    } catch (e) {
      console.error('⚠️ Erro ao parsear resposta Evolution:', e.message);
      result = { raw: responseText };
    }

    // Criar registro de mensagem no banco
    console.log('💾 Salvando mensagem no banco...');
    
    // Garantir empresa_id correto - nunca usar 'default' ou vazio
    const empresaIdFinal = empresaId || payload.empresa_id || '699696c2c9f5bffc2e67402b';
    console.log('🏢 Empresa ID final para salvar mensagem:', empresaIdFinal);

    const novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
      conversa_id: conversa_id,
      empresa_id: empresaIdFinal,
      remetente: 'vendedor',
      usuario_id: user.id,
      usuario_nome: user.full_name,
      tipo_conteudo: 'texto',
      texto: mensagem_texto,
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