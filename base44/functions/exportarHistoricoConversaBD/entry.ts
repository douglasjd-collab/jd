import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json();
    const telefoneRaw = body.telefone || '558791426333';
    const telefone = telefoneRaw.replace(/\D/g, '');

    console.log(`\n${'='.repeat(80)}`);
    console.log('📖 EXPORTAR HISTÓRICO DE CONVERSA');
    console.log(`Telefone: ${telefone}`);
    console.log(`${'='.repeat(80)}\n`);

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

    // ════════════════════════════════════════════════════════════════════
    // PASSO 1: Buscar conversa
    // ════════════════════════════════════════════════════════════════════
    console.log(`[PASSO 1] Buscando conversa para ${telefone}...`);
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: telefone,
    }, null, 10);

    if (conversas.length === 0) {
      console.log(`❌ Nenhuma conversa encontrada para ${telefone}`);
      return Response.json({
        success: false,
        error: `Nenhuma conversa encontrada para ${telefone}`,
        sugestao: 'Sincronize as conversas primeiro via receberMensagensWhatsApp ou sincronizarConversasRobusto',
      });
    }

    const conversa = conversas[0];
    console.log(`✅ Conversa encontrada: ${conversa.id}`);
    console.log(`   Cliente: ${conversa.cliente_nome}`);
    console.log(`   Status: ${conversa.status}`);
    console.log(`   Última mensagem: ${conversa.data_ultima_mensagem}\n`);

    // ════════════════════════════════════════════════════════════════════
    // PASSO 2: Buscar mensagens (enviadas E recebidas)
    // ════════════════════════════════════════════════════════════════════
    console.log(`[PASSO 2] Buscando todas as mensagens (enviadas + recebidas)...`);
    const todasMensagensRaw = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
      conversa_id: conversa.id,
    }, 'created_date', 5000);

    // Separar mensagens por remetente para debug
    const mensagensCliente = todasMensagensRaw.filter(m => m.remetente === 'cliente');
    const mensagensVendedor = todasMensagensRaw.filter(m => m.remetente === 'vendedor');
    
    console.log(`   - Recebidas (cliente): ${mensagensCliente.length}`);
    console.log(`   - Enviadas (vendedor): ${mensagensVendedor.length}`);
    
    const mensagens = todasMensagensRaw;
    console.log(`✅ ${mensagens.length} mensagens no total`);

    if (mensagens.length === 0) {
      console.log(`\n⚠️ AVISO: Nenhuma mensagem foi sincronizada ainda.`);
      console.log(`   A Evolution API v2.3.7 só fornece mensagens via webhooks.`);
      console.log(`   Para sincronizar histórico, configure o webhook em:`);
      console.log(`   https://doc.evolution-api.com/intro`);
    }

    console.log(`\n[PASSO 3] Formatando histórico...`);

    // Formatar mensagens
    const historico = mensagens.map((msg, idx) => ({
      sequencia: idx + 1,
      data_hora: new Date(msg.created_date).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo'
      }),
      remetente: msg.remetente === 'cliente' ? '👤 Cliente' : '💼 Vendedor',
      tipo: msg.tipo_conteudo === 'texto' ? '📝' : msg.tipo_conteudo === 'imagem' ? '📸' : msg.tipo_conteudo === 'audio' ? '🎵' : msg.tipo_conteudo === 'video' ? '🎬' : '📎',
      conteudo: msg.texto || `[${msg.tipo_conteudo.toUpperCase()}]`,
      usuario: msg.usuario_nome || '-',
      status: msg.status,
    }));

    // Gerar resumo
    const clienteMsgs = mensagens.filter(m => m.remetente === 'cliente').length;
    const vendedorMsgs = mensagens.filter(m => m.remetente === 'vendedor').length;
    const primeiraMsg = mensagens[0];
    const ultimaMsg = mensagens[mensagens.length - 1];

    const resumo = {
      telefone,
      cliente_nome: conversa.cliente_nome,
      cliente_id: conversa.cliente_id,
      total_mensagens: mensagens.length,
      mensagens_cliente: clienteMsgs,
      mensagens_vendedor: vendedorMsgs,
      primeira_mensagem: primeiraMsg ? new Date(primeiraMsg.created_date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null,
      ultima_mensagem: ultimaMsg ? new Date(ultimaMsg.created_date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null,
      duracao_dias: primeiraMsg && ultimaMsg ? Math.floor((new Date(ultimaMsg.created_date) - new Date(primeiraMsg.created_date)) / (1000 * 60 * 60 * 24)) : 0,
    };

    console.log(`${'='.repeat(80)}`);
    console.log('✅ RESUMO DO HISTÓRICO');
    console.log(`${'='.repeat(80)}`);
    console.log(`Cliente: ${resumo.cliente_nome}`);
    console.log(`Total de mensagens: ${resumo.total_mensagens}`);
    console.log(`  - Cliente: ${resumo.mensagens_cliente}`);
    console.log(`  - Vendedor: ${resumo.mensagens_vendedor}`);
    console.log(`Período: ${resumo.primeira_mensagem} até ${resumo.ultima_mensagem}`);
    console.log(`Duração: ${resumo.duracao_dias} dias`);
    console.log(`${'='.repeat(80)}\n`);

    return Response.json({
      success: true,
      resumo,
      historico: historico.slice(0, 50), // Limitar para 50 últimas
      totalRegistrosRetornados: Math.min(historico.length, 50),
      avisos: mensagens.length === 0 ? [
        'Nenhuma mensagem sincronizada',
        'A Evolution API v2.3.7 fornece histórico apenas via webhooks',
        'Configure o webhook para começar a sincronizar mensagens',
      ] : [],
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});