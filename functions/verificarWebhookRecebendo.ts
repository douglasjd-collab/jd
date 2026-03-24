import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  console.log('\n' + '='.repeat(100));
  console.log('🔍 VERIFICAÇÃO: WEBHOOK ESTÁ RECEBENDO?');
  console.log('='.repeat(100));

  try {
    // Obter todos os dados do webhook
    const user = await base44.auth.me();
    
    // 1. Verificar se há conversas recentes
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.list('-created_date', 10);
    const conversasRecentes = conversas.filter(c => {
      const dataCriacao = new Date(c.created_date);
      const agora = new Date();
      const diferenciaMinutos = (agora - dataCriacao) / (1000 * 60);
      return diferenciaMinutos < 30; // últimos 30 minutos
    });

    console.log('✅ Total de conversas:', conversas.length);
    console.log('✅ Conversas nos últimos 30 min:', conversasRecentes.length);

    // 2. Verificar se há mensagens recentes
    const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.list('-created_date', 10);
    const mensagensRecentes = mensagens.filter(m => {
      const dataCriacao = new Date(m.created_date);
      const agora = new Date();
      const diferenciaMinutos = (agora - dataCriacao) / (1000 * 60);
      return diferenciaMinutos < 30; // últimos 30 minutos
    });

    console.log('✅ Total de mensagens:', mensagens.length);
    console.log('✅ Mensagens nos últimos 30 min:', mensagensRecentes.length);

    // 3. Verificar instância configurada
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
    const empresasComInstance = empresas.filter(e => e.evolution_instance_name);
    
    console.log('\n📋 EMPRESAS COM INSTÂNCIA CONFIGURADA:');
    empresasComInstance.forEach(e => {
      console.log(`  - ${e.nome}: ${e.evolution_instance_name}`);
    });

    // 4. Verificação final
    console.log('\n' + '='.repeat(100));
    if (mensagensRecentes.length > 0) {
      console.log('✅✅✅ WEBHOOK ESTÁ FUNCIONANDO! Mensagens sendo recebidas!');
      console.log('Última mensagem:', new Date(mensagensRecentes[0].created_date).toLocaleString());
    } else if (conversasRecentes.length > 0) {
      console.log('⚠️ CONVERSAS SIM, MAS MENSAGENS NÃO');
      console.log('Problema: As conversas estão sendo criadas mas as mensagens não estão sendo salvas');
    } else {
      console.log('❌ WEBHOOK NÃO ESTÁ RECEBENDO');
      console.log('\n🔧 PRÓXIMOS PASSOS:');
      console.log('1. Verifique se a URL do webhook está correta na Evolution API');
      console.log('2. Teste enviando uma mensagem manualmente via WhatsApp');
      console.log('3. Verifique os logs da Evolution API para erros');
      console.log('4. Confirme que a instância no URL do webhook bate com a configurada');
    }
    console.log('='.repeat(100));

    return Response.json({
      webhook_funcionando: mensagensRecentes.length > 0,
      total_conversas: conversas.length,
      conversas_30min: conversasRecentes.length,
      total_mensagens: mensagens.length,
      mensagens_30min: mensagensRecentes.length,
      ultimas_mensagens: mensagensRecentes.slice(0, 3).map(m => ({
        id: m.id.substring(0, 8),
        conversa: m.conversa_id.substring(0, 8),
        texto: m.texto?.substring(0, 30),
        hora: new Date(m.created_date).toLocaleString()
      })),
      empresas_com_instance: empresasComInstance.map(e => ({
        nome: e.nome,
        instance: e.evolution_instance_name
      }))
    });

  } catch (error) {
    console.error('❌ Erro na verificação:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});