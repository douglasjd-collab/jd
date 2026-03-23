import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  console.log('\n\n');
  console.log('█'.repeat(100));
  console.log('🧪🧪🧪 TESTE DE WEBHOOK MANUAL INICIADO');
  console.log('█'.repeat(100));
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log('✅ Usuário autenticado:', user.email);
    
    // Buscar empresas
    console.log('🏢 Buscando empresas...');
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
    console.log('🏢 Empresas encontradas:', empresas.length);
    
    if (!empresas || empresas.length === 0) {
      return Response.json({ success: false, error: 'Nenhuma empresa ativa' }, { status: 400 });
    }
    
    const empresaId = empresas[0].id;
    console.log('✅ Usando empresa:', empresaId);
    
    // Simular mensagem recebida
    const telefoneTeste = '558781194149';
    const testPayload = {
      event: 'messages.upsert',
      instance: 'teste',
      data: {
        key: {
          remoteJid: `${telefoneTeste}@s.whatsapp.net`,
          fromMe: false,
          id: `TEST_${Date.now()}`
        },
        pushName: 'Cliente Teste',
        message: {
          conversation: `Teste manual ${new Date().toLocaleTimeString('pt-BR')}`
        }
      }
    };
    
    console.log('📋 Payload de teste:', JSON.stringify(testPayload, null, 2));
    
    // Buscar ou criar conversa
    console.log('💬 Buscando/criando conversa...');
    let conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: telefoneTeste
    });
    
    let conversa;
    if (conversas.length === 0) {
      console.log('➕ Criando nova conversa...');
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
        empresa_id: empresaId,
        cliente_id: '',
        cliente_nome: 'Cliente Teste',
        cliente_telefone: telefoneTeste,
        whatsapp_id: testPayload.data.key.id,
        status: 'ativa',
        ultima_mensagem: testPayload.data.message.conversation,
        data_ultima_mensagem: new Date().toISOString()
      });
      console.log('✅ Conversa criada:', conversa.id);
    } else {
      conversa = conversas[0];
      console.log('✅ Conversa encontrada:', conversa.id);
    }
    
    // Criar mensagem
    console.log('💾 Criando mensagem de teste...');
    const novaMensagem = await base44.asServiceRole.entities.MensagemWhatsapp.create({
      conversa_id: conversa.id,
      empresa_id: empresaId,
      remetente: 'cliente',
      tipo_conteudo: 'texto',
      texto: testPayload.data.message.conversation,
      whatsapp_message_id: testPayload.data.key.id,
      data_envio: new Date().toISOString(),
      status: 'entregue'
    });
    
    console.log('█'.repeat(100));
    console.log('✅ MENSAGEM DE TESTE SALVA COM SUCESSO!');
    console.log('Mensagem ID:', novaMensagem.id);
    console.log('Conversa ID:', conversa.id);
    console.log('Texto:', novaMensagem.texto);
    console.log('█'.repeat(100));
    
    return Response.json({
      success: true,
      message: 'Teste executado com sucesso',
      mensagem_id: novaMensagem.id,
      conversa_id: conversa.id,
      telefone: telefoneTeste,
      instrucoes: 'Procure pela conversa "Cliente Teste" no Bate-papo'
    });
    
  } catch (error) {
    console.log('█'.repeat(100));
    console.log('❌ ERRO NO TESTE:', error.message);
    console.log('Stack:', error.stack);
    console.log('█'.repeat(100));
    
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});