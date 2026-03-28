import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json();
    const telefoneRaw = body.telefone || '558799424630';
    const telefone = telefoneRaw.replace(/\D/g, '');

    console.log(`\n${'='.repeat(80)}`);
    console.log('🔍 DIAGNÓSTICO DE CONTATO');
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

    const diagnostico = {};

    // ════════════════════════════════════════════════════════════════════
    // [1] Verificar cliente
    // ════════════════════════════════════════════════════════════════════
    console.log('[1] 🔎 Procurando Cliente...');
    const clientes = await base44.asServiceRole.entities.Cliente.filter({
      empresa_id: empresaId,
      celular: telefone,
    }, null, 10);

    diagnostico.cliente = clientes.length > 0 ? {
      id: clientes[0].id,
      nome: clientes[0].nome_completo,
      status: clientes[0].status,
      telefone: clientes[0].celular,
    } : null;

    if (diagnostico.cliente) {
      console.log(`   ✅ Cliente encontrado: ${diagnostico.cliente.nome}`);
    } else {
      console.log(`   ❌ Cliente NÃO encontrado`);
    }

    // ════════════════════════════════════════════════════════════════════
    // [2] Verificar Conversa WhatsApp
    // ════════════════════════════════════════════════════════════════════
    console.log('\n[2] 💬 Procurando Conversa WhatsApp...');
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: telefone,
    }, null, 10);

    diagnostico.conversa = conversas.length > 0 ? {
      id: conversas[0].id,
      status: conversas[0].status,
      whatsapp_id: conversas[0].whatsapp_id,
      instancia: conversas[0].instancia,
      ultima_mensagem: conversas[0].ultima_mensagem,
      data_ultima_mensagem: conversas[0].data_ultima_mensagem,
    } : null;

    if (diagnostico.conversa) {
      console.log(`   ✅ Conversa encontrada: ${diagnostico.conversa.id}`);
      console.log(`      Status: ${diagnostico.conversa.status}`);
      console.log(`      Última mensagem: ${diagnostico.conversa.data_ultima_mensagem}`);
    } else {
      console.log(`   ❌ Conversa NÃO encontrada - Mensagens NÃO serão sincronizadas!`);
    }

    // ════════════════════════════════════════════════════════════════════
    // [3] Verificar Mensagens
    // ════════════════════════════════════════════════════════════════════
    console.log('\n[3] 📨 Procurando Mensagens...');
    let mensagens = [];
    if (diagnostico.conversa) {
      mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
        conversa_id: diagnostico.conversa.id,
      }, '-created_date', 100);
    }

    diagnostico.mensagens = {
      total: mensagens.length,
      ultima: mensagens.length > 0 ? {
        remetente: mensagens[0].remetente,
        tipo: mensagens[0].tipo_conteudo,
        data: mensagens[0].created_date,
      } : null,
    };

    if (mensagens.length > 0) {
      console.log(`   ✅ ${mensagens.length} mensagens encontradas`);
      console.log(`      Última: ${mensagens[0].remetente} - ${mensagens[0].tipo_conteudo}`);
    } else {
      console.log(`   ❌ Nenhuma mensagem encontrada`);
    }

    // ════════════════════════════════════════════════════════════════════
    // [4] Verificar Webhook Logs
    // ════════════════════════════════════════════════════════════════════
    console.log('\n[4] 🪝 Procurando Logs de Webhook...');
    const webhookLogs = await base44.asServiceRole.entities.LogRecebimentoWebhook.filter({
      empresa_id: empresaId,
    }, '-created_date', 50);

    const logsContato = webhookLogs.filter(l => (l.body_json || '').includes(telefone));
    diagnostico.webhookLogs = logsContato.length;

    if (logsContato.length > 0) {
      console.log(`   ✅ ${logsContato.length} logs de webhook para este contato`);
      if (logsContato[0]) {
        console.log(`      Último: ${logsContato[0].created_date}`);
      }
    } else {
      console.log(`   ⚠️ Nenhum webhook recebido para este contato`);
      console.log(`      Se isso é novo, o webhook pode não estar configurado ou recebendo`);
    }

    // ════════════════════════════════════════════════════════════════════
    // [5] Verificar configuração Evolution
    // ════════════════════════════════════════════════════════════════════
    console.log('\n[5] ⚙️ Configuração Evolution...');
    const evUrl = Deno.env.get('EVOLUTION_API_URL');
    const evKey = Deno.env.get('EVOLUTION_API_KEY');
    const instancia = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    diagnostico.evolution = {
      url: evUrl ? '✅ Configurada' : '❌ Não configurada',
      key: evKey ? '✅ Configurada' : '❌ Não configurada',
      instancia: instancia || 'JDPROMOTORA',
    };

    console.log(`   URL: ${diagnostico.evolution.url}`);
    console.log(`   KEY: ${diagnostico.evolution.key}`);
    console.log(`   Instância: ${diagnostico.evolution.instancia}`);

    // ════════════════════════════════════════════════════════════════════
    // [6] Resumo e Recomendações
    // ════════════════════════════════════════════════════════════════════
    console.log(`\n${'='.repeat(80)}`);
    console.log('⚠️ DIAGNÓSTICO COMPLETO');
    console.log(`${'='.repeat(80)}`);

    const problemas = [];

    if (!diagnostico.cliente) {
      problemas.push('❌ Cliente não existe no sistema');
    }
    if (!diagnostico.conversa) {
      problemas.push('❌ Conversa não foi criada - Webhook não foi disparado ou não sincronizado');
    }
    if (diagnostico.mensagens.total === 0 && diagnostico.conversa) {
      problemas.push('⚠️ Conversa existe mas não há mensagens - Nenhuma mensagem foi recebida/sincronizada');
    }
    if (diagnostico.webhookLogs === 0) {
      problemas.push('⚠️ Nenhum webhook foi recebido para este contato');
    }

    if (problemas.length === 0) {
      console.log('✅ Tudo parece estar funcionando!');
    } else {
      console.log('\nProblemas encontrados:');
      problemas.forEach(p => console.log(`   ${p}`));
    }

    console.log('\n📋 Recomendações:');
    if (!diagnostico.conversa && logsContato.length === 0) {
      console.log('   1. Verifique se o webhook da Evolution está configurado');
      console.log('   2. Teste enviando uma mensagem para este número e veja se chega');
      console.log('   3. Verifique os logs: https://app.base44.dev/logs');
    }
    if (!diagnostico.cliente) {
      console.log('   1. Crie o cliente primeiro em Clientes');
      console.log('   2. Sincronize as conversas via receberMensagensWhatsApp');
    }
    if (diagnostico.conversa && diagnostico.mensagens.total === 0) {
      console.log('   1. Peça ao cliente para enviar uma mensagem');
      console.log('   2. Ou sincronize manualmente via sincronizarConversasRobusto');
    }

    console.log(`${'='.repeat(80)}\n`);

    return Response.json({
      success: true,
      telefone,
      diagnostico,
      problemas,
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});