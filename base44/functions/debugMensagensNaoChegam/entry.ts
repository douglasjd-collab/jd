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
    console.log('🔍 DEBUG: MENSAGENS NÃO CHEGAM');
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

    const diagnostico = {
      passo1_cliente: null,
      passo2_conversa: null,
      passo3_mensagens: null,
      passo4_webhook_logs: null,
      passo5_sugestoes: [],
    };

    // ════════════════════════════════════════════════════════════════════
    // [PASSO 1] Cliente existe?
    // ════════════════════════════════════════════════════════════════════
    console.log('[PASSO 1] 🔎 Procurando Cliente...');
    const clientes = await base44.asServiceRole.entities.Cliente.filter({
      empresa_id: empresaId,
      celular: telefone,
    }, null, 10);

    if (clientes.length > 0) {
      console.log(`   ✅ Cliente encontrado: ${clientes[0].nome_completo}`);
      diagnostico.passo1_cliente = {
        id: clientes[0].id,
        nome: clientes[0].nome_completo,
        telefone: clientes[0].celular,
      };
    } else {
      console.log(`   ⚠️ Cliente NÃO encontrado!`);
      diagnostico.passo5_sugestoes.push('1️⃣ CRIAR CLIENTE em Clientes');
      diagnostico.passo1_cliente = null;
    }

    // ════════════════════════════════════════════════════════════════════
    // [PASSO 2] Conversa existe?
    // ════════════════════════════════════════════════════════════════════
    console.log('\n[PASSO 2] 💬 Procurando Conversa...');
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
      cliente_telefone: telefone,
    }, null, 10);

    if (conversas.length > 0) {
      console.log(`   ✅ Conversa encontrada: ${conversas[0].id}`);
      console.log(`      Status: ${conversas[0].status}`);
      console.log(`      Instância: ${conversas[0].instancia}`);
      diagnostico.passo2_conversa = {
        id: conversas[0].id,
        status: conversas[0].status,
        whatsapp_id: conversas[0].whatsapp_id,
        instancia: conversas[0].instancia,
        ultima_mensagem_data: conversas[0].data_ultima_mensagem,
      };
    } else {
      console.log(`   ❌ Conversa NÃO encontrada!`);
      diagnostico.passo5_sugestoes.push('2️⃣ CRIAR CONVERSA manualmente ou via sincronização');
      return Response.json({
        success: false,
        diagnostico,
        avisoUrgente: '⚠️ CONVERSA NÃO EXISTE - Impossível receber mensagens sem conversa',
      });
    }

    const conversa = conversas[0];

    // ════════════════════════════════════════════════════════════════════
    // [PASSO 3] Mensagens existem?
    // ════════════════════════════════════════════════════════════════════
    console.log('\n[PASSO 3] 📨 Procurando Mensagens...');
    const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
      conversa_id: conversa.id,
    }, '-created_date', 20);

    console.log(`   📊 ${mensagens.length} mensagem(ns) encontrada(s)`);
    diagnostico.passo3_mensagens = {
      total: mensagens.length,
      ultimas: mensagens.slice(0, 5).map(m => ({
        remetente: m.remetente,
        tipo: m.tipo_conteudo,
        data: m.created_date,
        texto: m.texto ? m.texto.slice(0, 50) : null,
      })),
    };

    if (mensagens.length === 0) {
      console.log(`   ❌ NENHUMA mensagem foi importada!`);
      diagnostico.passo5_sugestoes.push('3️⃣ WEBHOOK NÃO ESTÁ RECEBENDO MENSAGENS');
      diagnostico.passo5_sugestoes.push('4️⃣ VERIFIQUE: Configuração do Webhook na Evolution');
    } else {
      console.log(`   ✅ ${mensagens.length} mensagens no histórico`);
    }

    // ════════════════════════════════════════════════════════════════════
    // [PASSO 4] Logs de Webhook
    // ════════════════════════════════════════════════════════════════════
    console.log('\n[PASSO 4] 🪝 Procurando Logs de Webhook...');
    const webhookLogs = await base44.asServiceRole.entities.LogRecebimentoWebhook.filter({
      empresa_id: empresaId,
    }, '-created_date', 100);

    const logsContato = webhookLogs.filter(l => {
      const body = l.body_json ? JSON.parse(l.body_json) : {};
      const jsonStr = JSON.stringify(body).toLowerCase();
      return jsonStr.includes(telefone);
    });

    console.log(`   🔍 ${logsContato.length} log(s) de webhook para este contato`);
    diagnostico.passo4_webhook_logs = {
      total_para_contato: logsContato.length,
      ultimos: logsContato.slice(0, 3).map(l => ({
        data: l.created_date,
        evento: l.evento,
        status_http: l.status_http,
      })),
    };

    if (logsContato.length === 0) {
      console.log(`   ❌ NENHUM webhook recebido para este contato!`);
      diagnostico.passo5_sugestoes.push('5️⃣ WEBHOOK NÃO ESTÁ CONFIGURADO na Evolution API');
      diagnostico.passo5_sugestoes.push('6️⃣ CONFIGURE: https://app.base44.dev/ConfiguracaoWhatsApp');
    }

    // ════════════════════════════════════════════════════════════════════
    // [RESUMO E RECOMENDAÇÕES]
    // ════════════════════════════════════════════════════════════════════
    console.log(`\n${'='.repeat(80)}`);
    console.log('📋 CHECKLIST - ENCONTREI O PROBLEMA:');
    console.log(`${'='.repeat(80)}`);

    const checklist = [
      ['Cliente existe', clientes.length > 0],
      ['Conversa existe', conversas.length > 0],
      ['Mensagens chegam', mensagens.length > 0],
      ['Webhooks recebidos', logsContato.length > 0],
    ];

    checklist.forEach(([item, ok]) => {
      console.log(`${ok ? '✅' : '❌'} ${item}`);
    });

    console.log('\n🔧 SOLUÇÕES:\n');
    diagnostico.passo5_sugestoes.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s}`);
    });

    // Mensagem final
    if (mensagens.length === 0 && logsContato.length === 0) {
      console.log(`\n🚨 CRÍTICO: Webhook não configurado ou não está recebendo!`);
      console.log(`   → Vá em: Configurações → Configuração WhatsApp`);
      console.log(`   → Registre o webhook URL lá`);
    } else if (mensagens.length === 0 && logsContato.length > 0) {
      console.log(`\n⚠️ Webhook está recebendo MAS mensagens não estão sendo salvas`);
      console.log(`   → Pode haver erro na função receberWebhookWhatsAppRobusto`);
      console.log(`   → Verifique os logs do sistema`);
    } else {
      console.log(`\n✅ Tudo funcionando! Mensagens estão chegando.`);
    }

    console.log(`${'='.repeat(80)}\n`);

    return Response.json({
      success: true,
      diagnostico,
      proximos_passos: diagnostico.passo5_sugestoes,
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});