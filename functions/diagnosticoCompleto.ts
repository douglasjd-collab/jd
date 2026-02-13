import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  console.log('='.repeat(100));
  console.log('🔍🔍🔍 DIAGNÓSTICO COMPLETO DE RECEBIMENTO');
  console.log('='.repeat(100));

  const diagnostico = {
    sucessos: [],
    problemas: [],
    recomendacoes: [],
    debug: {}
  };

  try {
    // 1. Buscar usuário
    console.log('\n1️⃣ Verificando usuário...');
    const user = await base44.auth.me();
    if (user) {
      diagnostico.sucessos.push('✅ Usuário autenticado: ' + user.email);
      diagnostico.debug.user = { email: user.email, role: user.role };
    } else {
      diagnostico.problemas.push('❌ Usuário não autenticado');
    }

    // 2. Buscar empresa TESTE
    console.log('\n2️⃣ Buscando empresa com instance TESTE...');
    const empresasTeste = await base44.asServiceRole.entities.Empresa.filter({
      evolution_instance_name: 'TESTE'
    });
    
    if (empresasTeste.length > 0) {
      const emp = empresasTeste[0];
      diagnostico.sucessos.push('✅ Empresa com instance TESTE encontrada: ' + emp.nome);
      diagnostico.debug.empresa = {
        id: emp.id,
        nome: emp.nome,
        instance: emp.evolution_instance_name,
        evolution_url: emp.evolution_url ? '✅' : '❌',
        evolution_api_key: emp.evolution_api_key ? '✅' : '❌'
      };
    } else {
      diagnostico.problemas.push('❌ Nenhuma empresa com instance TESTE encontrada');
      diagnostico.recomendacoes.push('Configure a empresa com instance TESTE em Dados da Evolution API');
    }

    // 3. Buscar todas as conversas
    console.log('\n3️⃣ Verificando conversas...');
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.list('-created_date', 100);
    diagnostico.debug.total_conversas = conversas.length;
    
    if (conversas.length > 0) {
      diagnostico.sucessos.push(`✅ ${conversas.length} conversas encontradas no CRM`);
      const ultimas3 = conversas.slice(0, 3);
      diagnostico.debug.ultimas_conversas = ultimas3.map(c => ({
        id: c.id.substring(0, 8),
        telefone: c.cliente_telefone,
        status: c.status,
        data: c.created_date
      }));
    } else {
      diagnostico.problemas.push('❌ Nenhuma conversa encontrada');
      diagnostico.recomendacoes.push('Nenhuma mensagem foi recebida ainda - verifique se o webhook está configurado');
    }

    // 4. Buscar mensagens
    console.log('\n4️⃣ Verificando mensagens...');
    const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.list('-created_date', 100);
    diagnostico.debug.total_mensagens = mensagens.length;
    
    if (mensagens.length > 0) {
      diagnostico.sucessos.push(`✅ ${mensagens.length} mensagens encontradas`);
      const ultimas3 = mensagens.slice(0, 3);
      diagnostico.debug.ultimas_mensagens = ultimas3.map(m => ({
        id: m.id.substring(0, 8),
        remetente: m.remetente,
        tipo: m.tipo_conteudo,
        texto: m.texto?.substring(0, 30),
        data: m.created_date
      }));
    } else {
      diagnostico.problemas.push('❌ Nenhuma mensagem foi recebida');
      diagnostico.recomendacoes.push('O webhook não está recebendo mensagens da Evolution API');
    }

    // 5. Verificar se há conversas mas sem mensagens
    if (conversas.length > 0 && mensagens.length === 0) {
      diagnostico.problemas.push('⚠️ Conversas existem mas sem mensagens');
      diagnostico.recomendacoes.push('Conversas foram criadas mas mensagens não foram salvas');
    }

    // 6. Verificar evolução_url e api_key
    if (empresasTeste.length > 0) {
      const emp = empresasTeste[0];
      if (!emp.evolution_url || emp.evolution_url.trim() === '') {
        diagnostico.problemas.push('❌ Evolution URL não configurada');
        diagnostico.recomendacoes.push('Configure a URL da Evolution API em Configuração WhatsApp');
      }
      if (!emp.evolution_api_key || emp.evolution_api_key.trim() === '') {
        diagnostico.problemas.push('❌ Evolution API Key não configurada');
        diagnostico.recomendacoes.push('Configure a chave API da Evolution em Configuração WhatsApp');
      }
    }

    // 7. Resumo
    console.log('\n' + '='.repeat(100));
    console.log('📊 RESUMO DO DIAGNÓSTICO');
    console.log('='.repeat(100));
    console.log(`✅ Sucessos: ${diagnostico.sucessos.length}`);
    console.log(`❌ Problemas: ${diagnostico.problemas.length}`);
    
    const resumo = diagnostico.problemas.length === 0 
      ? '✅ TUDO OK! Webhook está recebendo mensagens corretamente'
      : `❌ ${diagnostico.problemas.length} problema(s) encontrado(s)`;

    console.log(`\n${resumo}`);

    return Response.json({
      success: diagnostico.problemas.length === 0,
      resumo,
      diagnostico
    });

  } catch (error) {
    console.error('❌ ERRO NO DIAGNÓSTICO:', error);
    return Response.json({
      success: false,
      error: error.message,
      diagnostico: {
        sucessos: diagnostico.sucessos,
        problemas: [...diagnostico.problemas, '❌ Erro ao executar diagnóstico: ' + error.message],
        recomendacoes: diagnostico.recomendacoes,
        debug: diagnostico.debug
      }
    }, { status: 500 });
  }
});