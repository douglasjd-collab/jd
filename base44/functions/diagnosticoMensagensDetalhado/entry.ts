import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const telefone = body.telefone || '558791426333';
    const telefoneLimpo = telefone.replace(/\D/g, '');

    console.log(`\n${'='.repeat(100)}`);
    console.log('🔍 DIAGNÓSTICO DETALHADO DE MENSAGENS');
    console.log(`Telefone: ${telefoneLimpo}`);
    console.log(`${'='.repeat(100)}\n`);

    // ════════════════════════════════════════════════════════════════════
    // [1] Verificar Empresa
    // ════════════════════════════════════════════════════════════════════
    console.log('[1️⃣] VERIFICANDO EMPRESA');
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
    if (!empresas.length) {
      console.log('❌ ERRO: Nenhuma empresa ativa encontrada!');
      return Response.json({ error: 'Nenhuma empresa' });
    }
    const empresaId = empresas[0].id;
    console.log(`✅ Empresa encontrada: ${empresaId}\n`);

    // ════════════════════════════════════════════════════════════════════
    // [2] Verificar Cliente
    // ════════════════════════════════════════════════════════════════════
    console.log('[2️⃣] VERIFICANDO CLIENTE');
    const clientes = await base44.asServiceRole.entities.Cliente.filter({
      empresa_id: empresaId,
      celular: telefoneLimpo,
    }, null, 10);

    if (!clientes.length) {
      console.log(`❌ NENHUM CLIENTE COM TELEFONE ${telefoneLimpo}`);
      console.log('   ⚠️  Procurando por qualquer cliente com esse telefone...');
      const todosClientes = await base44.asServiceRole.entities.Cliente.filter(
        { empresa_id: empresaId },
        '-created_date',
        100
      );
      console.log(`   Total de clientes na empresa: ${todosClientes.length}`);
      const comTelefone = todosClientes.filter(c => c.celular === telefoneLimpo);
      console.log(`   Com esse telefone: ${comTelefone.length}`);
    } else {
      console.log(`✅ Cliente encontrado: ${clientes[0].id} (${clientes[0].nome_completo})\n`);
    }

    // ════════════════════════════════════════════════════════════════════
    // [3] Verificar Conversa
    // ════════════════════════════════════════════════════════════════════
    console.log('[3️⃣] VERIFICANDO CONVERSA');
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: telefoneLimpo,
    }, null, 10);

    if (!conversas.length) {
      console.log(`❌ NENHUMA CONVERSA PARA ${telefoneLimpo}`);
      console.log('   Procurando todas as conversas...');
      const todasConversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
        { empresa_id: empresaId },
        '-created_date',
        100
      );
      console.log(`   Total de conversas: ${todasConversas.length}`);
      console.log('   Telefones nas conversas:');
      todasConversas.slice(0, 5).forEach(c => {
        console.log(`     - ${c.cliente_telefone}: ${c.cliente_nome}`);
      });
    } else {
      const conversa = conversas[0];
      console.log(`✅ Conversa encontrada: ${conversa.id}`);
      console.log(`   Status: ${conversa.status}`);
      console.log(`   Última msg: ${conversa.data_ultima_mensagem}\n`);

      // ════════════════════════════════════════════════════════════════════
      // [4] Verificar Mensagens nessa Conversa
      // ════════════════════════════════════════════════════════════════════
      console.log('[4️⃣] VERIFICANDO MENSAGENS NA CONVERSA');
      const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
        conversa_id: conversa.id,
      }, '-created_date', 100);

      console.log(`✅ Total de mensagens: ${mensagens.length}\n`);
      
      if (mensagens.length > 0) {
        const recebidas = mensagens.filter(m => m.remetente === 'cliente');
        const enviadas = mensagens.filter(m => m.remetente === 'vendedor');
        
        console.log(`   Recebidas (cliente): ${recebidas.length}`);
        console.log(`   Enviadas (vendedor): ${enviadas.length}`);
        console.log(`   Outros: ${mensagens.length - recebidas.length - enviadas.length}\n`);

        console.log('📝 Últimas 3 mensagens:');
        mensagens.slice(0, 3).forEach((msg, i) => {
          console.log(`   ${i+1}. [${msg.remetente}] ${msg.created_date}`);
          console.log(`      "${msg.texto.slice(0, 50)}..."`);
          console.log(`      ID: ${msg.whatsapp_message_id}`);
        });
      }

      // ════════════════════════════════════════════════════════════════════
      // [5] Verificar Webhook Logs
      // ════════════════════════════════════════════════════════════════════
      console.log('\n[5️⃣] VERIFICANDO LOGS DE WEBHOOK RECEBIDO');
      const webhookLogs = await base44.asServiceRole.entities.LogRecebimentoWebhook.filter({}, '-created_date', 20);
      
      console.log(`Total de webhooks recebidos: ${webhookLogs.length}`);
      if (webhookLogs.length > 0) {
        console.log('Últimos 3 webhooks:');
        webhookLogs.slice(0, 3).forEach((log, i) => {
          const body = typeof log.corpo === 'string' ? JSON.parse(log.corpo).data : log.corpo;
          console.log(`   ${i+1}. ${log.created_date} - ${log.metodo}`);
          if (body?.message) {
            console.log(`      Telefone: ${body.message.from}`);
            console.log(`      Mensagem: "${body.message.body?.slice(0, 50)}..."`);
          }
        });
      }
    }

    console.log(`\n${'='.repeat(100)}`);
    console.log('🎯 CHECKLIST:');
    console.log(`${'='.repeat(100)}`);
    console.log(`✅ [1] Empresa existe: ${empresas.length > 0 ? 'SIM' : 'NÃO'}`);
    console.log(`${clientes.length > 0 ? '✅' : '❌'} [2] Cliente ${telefoneLimpo} existe: ${clientes.length > 0 ? 'SIM' : 'NÃO'}`);
    console.log(`${conversas.length > 0 ? '✅' : '❌'} [3] Conversa existe: ${conversas.length > 0 ? 'SIM' : 'NÃO'}`);
    if (conversas.length > 0) {
      const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
        conversa_id: conversas[0].id,
      }, null, 1);
      console.log(`${mensagens.length > 0 ? '✅' : '❌'} [4] Mensagens na conversa: ${mensagens.length > 0 ? 'SIM' : 'NÃO'}`);
    }
    console.log(`${webhookLogs.length > 0 ? '✅' : '❌'} [5] Webhooks chegando: ${webhookLogs.length > 0 ? 'SIM' : 'NÃO'}`);
    console.log(`\n${'='.repeat(100)}\n`);

    return Response.json({ success: true });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});