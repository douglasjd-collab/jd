import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  console.log('🔍 DIAGNÓSTICO DE MENSAGENS RECEBIDAS');
  
  try {
    const base44 = createClientFromRequest(req);
    
    // Buscar usuário autenticado
    const me = await base44.auth.me();
    console.log('\n👤 Usuário logado:', me.email);
    
    // Buscar colaborador e empresa
    const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
    const empresaUsuario = colabs.length > 0 ? colabs[0].empresa_id : null;
    console.log('🏢 Empresa do usuário:', empresaUsuario);
    
    // Buscar TODAS as mensagens do sistema
    const todasMensagens = await base44.asServiceRole.entities.MensagemWhatsapp.list('-created_date', 50);
    console.log('\n📊 TOTAL DE MENSAGENS NO SISTEMA:', todasMensagens.length);
    
    // Agrupar por empresa
    const porEmpresa = {};
    for (const msg of todasMensagens) {
      const emp = msg.empresa_id || 'SEM_EMPRESA';
      if (!porEmpresa[emp]) porEmpresa[emp] = [];
      porEmpresa[emp].push(msg);
    }
    
    console.log('\n📋 MENSAGENS POR EMPRESA:');
    for (const [empId, msgs] of Object.entries(porEmpresa)) {
      const empresa = empId !== 'SEM_EMPRESA' ? 
        await base44.asServiceRole.entities.Empresa.filter({ id: empId }).then(r => r[0]) : 
        null;
      
      console.log(`\n${empresa ? empresa.nome : 'SEM EMPRESA'} (${empId}):`);
      console.log(`  Total: ${msgs.length} mensagens`);
      console.log(`  Últimas 5:`);
      
      for (const msg of msgs.slice(0, 5)) {
        console.log(`    - [${msg.remetente}] ${msg.texto?.substring(0, 50)} (${new Date(msg.created_date).toLocaleString('pt-BR')})`);
      }
    }
    
    // Buscar conversas
    const conversas = empresaUsuario ? 
      await base44.entities.ConversaWhatsapp.filter({ empresa_id: empresaUsuario }) :
      await base44.asServiceRole.entities.ConversaWhatsapp.list();
    
    console.log('\n💬 CONVERSAS:');
    console.log(`Total: ${conversas.length}`);
    for (const conv of conversas.slice(0, 5)) {
      const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter({ 
        conversa_id: conv.id 
      });
      console.log(`\n  Conversa: ${conv.cliente_nome} (${conv.cliente_telefone})`);
      console.log(`    Empresa: ${conv.empresa_id}`);
      console.log(`    Total de mensagens: ${msgs.length}`);
      console.log(`    Última mensagem: ${conv.ultima_mensagem}`);
    }
    
    // Verificar se há mensagens que o usuário deveria ver
    const mensagensVisiveis = empresaUsuario ?
      await base44.entities.MensagemWhatsapp.filter({ empresa_id: empresaUsuario }) :
      [];
    
    console.log('\n✅ MENSAGENS VISÍVEIS PARA O USUÁRIO:');
    console.log(`Total: ${mensagensVisiveis.length}`);
    
    const mensagensRecebidas = todasMensagens.filter(m => m.remetente === 'cliente');
    console.log('\n📥 MENSAGENS RECEBIDAS (remetente=cliente):');
    console.log(`Total: ${mensagensRecebidas.length}`);
    
    for (const msg of mensagensRecebidas.slice(0, 10)) {
      console.log(`\n  Mensagem ID: ${msg.id}`);
      console.log(`    Empresa: ${msg.empresa_id}`);
      console.log(`    Conversa: ${msg.conversa_id}`);
      console.log(`    Texto: ${msg.texto?.substring(0, 100)}`);
      console.log(`    Data: ${new Date(msg.created_date).toLocaleString('pt-BR')}`);
      console.log(`    Visível para usuário? ${msg.empresa_id === empresaUsuario ? '✅ SIM' : '❌ NÃO'}`);
    }
    
    return Response.json({
      success: true,
      diagnostico: {
        usuario: me.email,
        empresa_usuario: empresaUsuario,
        total_mensagens_sistema: todasMensagens.length,
        mensagens_por_empresa: Object.keys(porEmpresa).map(k => ({
          empresa_id: k,
          total: porEmpresa[k].length
        })),
        total_conversas: conversas.length,
        mensagens_visiveis_usuario: mensagensVisiveis.length,
        mensagens_recebidas_total: mensagensRecebidas.length,
        ultimas_recebidas: mensagensRecebidas.slice(0, 5).map(m => ({
          id: m.id,
          empresa_id: m.empresa_id,
          conversa_id: m.conversa_id,
          texto: m.texto?.substring(0, 50),
          visivel: m.empresa_id === empresaUsuario
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});