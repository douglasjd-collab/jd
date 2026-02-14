import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  console.log('\n\n');
  console.log('█'.repeat(100));
  console.log('🔍 DIAGNÓSTICO COMPLETO DO WEBHOOK');
  console.log('█'.repeat(100));
  
  try {
    const base44 = createClientFromRequest(req);
    
    // 1. Verificar secrets
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const evolutionInstance = Deno.env.get('EVOLUTION_INSTANCE_NAME');
    
    console.log('\n📋 SECRETS CONFIGURADOS:');
    console.log('   EVOLUTION_API_URL:', evolutionUrl ? '✅ Configurado' : '❌ Faltando');
    console.log('   EVOLUTION_API_KEY:', evolutionKey ? '✅ Configurado' : '❌ Faltando');
    console.log('   EVOLUTION_INSTANCE_NAME:', evolutionInstance || '❌ FALTANDO!');
    
    // 2. Listar todas as empresas e suas instâncias
    console.log('\n🏢 EMPRESAS CADASTRADAS NO CRM:');
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
    
    if (!empresas || empresas.length === 0) {
      console.log('❌ Nenhuma empresa ativa!');
    } else {
      empresas.forEach((e, i) => {
        const match = e.evolution_instance_name === evolutionInstance ? '✅ CORRESPONDE!' : '';
        console.log(`   [${i+1}] ${e.nome}`);
        console.log(`       ID: ${e.id}`);
        console.log(`       Instance: "${e.evolution_instance_name || 'SEM CONFIGURAR'}" ${match}`);
      });
    }
    
    // 3. Verificar conversas e mensagens
    console.log('\n💬 CONVERSAS CADASTRADAS:');
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({}, '-created_date', 10);
    console.log(`   Total: ${conversas.length}`);
    conversas.forEach((c, i) => {
      console.log(`   [${i+1}] ${c.cliente_telefone || 'SEM TELEFONE'} - ${c.cliente_nome || 'SEM NOME'}`);
    });
    
    // 4. Verificar mensagens
    console.log('\n📨 MENSAGENS CADASTRADAS:');
    const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter({}, '-created_date', 10);
    console.log(`   Total: ${mensagens.length}`);
    mensagens.forEach((m, i) => {
      console.log(`   [${i+1}] ${m.remetente} - ${m.tipo_conteudo}`);
    });
    
    // 5. Diagnóstico final
    console.log('\n⚠️ DIAGNÓSTICO:');
    
    const diagnostico = [];
    
    if (!evolutionInstance) {
      diagnostico.push('❌ EVOLUTION_INSTANCE_NAME não está configurado!');
      diagnostico.push('   → Vá em Dashboard → Code → Secrets');
      diagnostico.push('   → Procure por "EVOLUTION_INSTANCE_NAME"');
      diagnostico.push('   → Cole o VALOR EXATO da instância da Evolution API');
    } else if (empresas.length > 0 && !empresas.some(e => e.evolution_instance_name === evolutionInstance)) {
      diagnostico.push(`❌ EVOLUTION_INSTANCE_NAME="${evolutionInstance}" não existe no CRM!`);
      diagnostico.push('   Instâncias disponíveis:');
      empresas.forEach(e => {
        diagnostico.push(`   - "${e.evolution_instance_name || 'SEM CONFIGURAR'}"`);
      });
      diagnostico.push('   → Configure a Evolution com uma instância que existe no CRM!');
    } else {
      diagnostico.push('✅ EVOLUTION_INSTANCE_NAME está correto');
    }
    
    if (conversas.length === 0 && mensagens.length === 0) {
      diagnostico.push('❌ Nenhuma conversa ou mensagem recebida ainda');
    }
    
    diagnostico.forEach(d => console.log(d));
    
    console.log('█'.repeat(100));
    
    return Response.json({
      secrets: {
        evolution_url: !!evolutionUrl,
        evolution_key: !!evolutionKey,
        evolution_instance: evolutionInstance || 'FALTANDO'
      },
      empresas: empresas.map(e => ({
        nome: e.nome,
        id: e.id,
        instance: e.evolution_instance_name,
        correspondePenSecret: e.evolution_instance_name === evolutionInstance
      })),
      conversas_count: conversas.length,
      mensagens_count: mensagens.length,
      diagnostico: diagnostico
    });
    
  } catch (error) {
    console.error('❌ ERRO:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});