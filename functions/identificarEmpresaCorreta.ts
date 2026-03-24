import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  console.log('🔍 IDENTIFICANDO EMPRESA CORRETA E INSTANCE');
  
  try {
    const base44 = createClientFromRequest(req);
    
    // Buscar todas as empresas
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
    
    console.log('\n📋 TODAS AS EMPRESAS:');
    for (const emp of empresas) {
      console.log(`\n${emp.codigo} - ${emp.nome}`);
      console.log(`   Instance: ${emp.evolution_instance_name || 'NÃO CONFIGURADA'}`);
      console.log(`   Email Admin: ${emp.email_admin || 'N/A'}`);
      
      const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter({ empresa_id: emp.id });
      console.log(`   Mensagens recebidas: ${msgs.length}`);
    }
    
    // Identificar JD Promotora
    const jd = empresas.find(e => e.nome.includes('JD') || e.nome.includes('jd') || e.codigo === 'EMP001');
    
    console.log('\n' + '='.repeat(80));
    if (jd) {
      console.log('✅ JD PROMOTORA ENCONTRADA:');
      console.log(`   ID: ${jd.id}`);
      console.log(`   Nome: ${jd.nome}`);
      console.log(`   Instance ATUAL: ${jd.evolution_instance_name || 'NÃO TEM'}`);
      console.log(`   URL Evolution: ${jd.evolution_url || 'NÃO CONFIGURADA'}`);
      console.log(`   API Key: ${jd.evolution_api_key ? '✅' : '❌'}`);
    }
    
    return Response.json({
      success: true,
      jd_promotora: jd ? {
        id: jd.id,
        nome: jd.nome,
        instance: jd.evolution_instance_name,
        url: jd.evolution_url,
        tem_api_key: !!jd.evolution_api_key
      } : null
    });
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});