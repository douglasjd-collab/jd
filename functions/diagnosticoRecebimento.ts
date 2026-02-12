import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  console.log('\n\n');
  console.log('='.repeat(100));
  console.log('🔍 DIAGNÓSTICO DE RECEBIMENTO DE MENSAGENS');
  console.log('='.repeat(100));
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    console.log('👤 Usuário:', user?.email);
    console.log('🏢 Empresa do usuário:', user?.empresa_id);
    
    // Pegar todas as empresas
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
    console.log('\n📋 EMPRESAS ATIVAS:');
    
    for (const emp of empresas) {
      console.log('\n' + '-'.repeat(80));
      console.log(`🏢 ${emp.nome} (${emp.codigo})`);
      console.log(`   ID: ${emp.id}`);
      console.log(`   Instance Evolution: ${emp.evolution_instance_name || 'NÃO CONFIGURADO'}`);
      console.log(`   URL Evolution: ${emp.evolution_url ? '✅' : '❌'}`);
      console.log(`   API Key: ${emp.evolution_api_key ? '✅' : '❌'}`);
      
      // Contar mensagens por empresa
      const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
        empresa_id: emp.id
      });
      console.log(`   📊 Total de mensagens: ${mensagens.length}`);
      
      if (mensagens.length > 0) {
        // Mostrar últimas 3 mensagens
        const ultimas = mensagens.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 3);
        console.log(`   📨 Últimas mensagens:`);
        ultimas.forEach(msg => {
          const data = new Date(msg.created_date).toLocaleString('pt-BR');
          console.log(`      - ${data} | ${msg.remetente} | ${msg.tipo_conteudo} | ${msg.texto?.substring(0, 50)}`);
        });
      }
      
      // Contar conversas
      const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
        empresa_id: emp.id
      });
      console.log(`   💬 Total de conversas: ${conversas.length}`);
    }
    
    // Se o usuário tem empresa, mostrar detalhes dela
    if (user?.empresa_id) {
      console.log('\n' + '='.repeat(100));
      console.log('👤 DADOS DA SUA EMPRESA:');
      console.log('='.repeat(100));
      
      const minhaEmp = empresas.find(e => e.id === user.empresa_id);
      if (minhaEmp) {
        console.log(`Nome: ${minhaEmp.nome}`);
        console.log(`Instance: ${minhaEmp.evolution_instance_name || 'NÃO CONFIGURADA'}`);
        console.log(`URL: ${minhaEmp.evolution_url || 'NÃO CONFIGURADA'}`);
        
        const minhasMensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
          empresa_id: user.empresa_id
        });
        console.log(`\nMensagens recebidas: ${minhasMensagens.length}`);
        
        if (minhasMensagens.length > 0) {
          const ultima = minhasMensagens.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
          console.log(`Última mensagem: ${new Date(ultima.created_date).toLocaleString('pt-BR')}`);
          console.log(`De: ${ultima.remetente}`);
          console.log(`Texto: ${ultima.texto?.substring(0, 100)}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(100));
    console.log('✅ DIAGNÓSTICO CONCLUÍDO');
    console.log('='.repeat(100));
    
    return Response.json({
      success: true,
      usuario_email: user?.email,
      usuario_empresa_id: user?.empresa_id,
      total_empresas: empresas.length,
      resumo: empresas.map(e => ({
        nome: e.nome,
        codigo: e.codigo,
        instance: e.evolution_instance_name,
        mensagens: (e.id === user?.empresa_id ? '(SUA EMPRESA)' : '')
      }))
    });
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});