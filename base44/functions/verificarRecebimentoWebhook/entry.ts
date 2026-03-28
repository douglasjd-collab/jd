import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { telefone } = await req.json();

    if (!telefone) {
      return Response.json({ error: 'Telefone não fornecido' }, { status: 400 });
    }

    const telefoneLimpo = telefone.replace(/\D/g, '');

    console.log(`[VERIFICAR RECEBIMENTO] ${telefoneLimpo}`);

    // ════════════════════════════════════════════════════════════════════
    // [1] Verificar se webhook está configurado
    // ════════════════════════════════════════════════════════════════════
    let webhookConfigurado = false;
    let ultimoWebhook = null;

    try {
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' }, null, 1);
      if (empresas.length > 0) {
        const logs = await base44.asServiceRole.entities.LogRecebimentoWebhook.filter(
          { empresa_id: empresas[0].id },
          '-created_date',
          10
        );

        if (logs.length > 0) {
          webhookConfigurado = true;
          ultimoWebhook = logs[0].created_date;
          console.log(`✅ Webhook foi acionado em ${ultimoWebhook}`);
        }
      }
    } catch (e) {
      console.warn('Erro ao verificar webhook:', e.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // [2] Verificar se conversa existe
    // ════════════════════════════════════════════════════════════════════
    let conversaExiste = false;
    let ultimaMensagem = null;
    let mensagensRecentes = [];

    try {
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' }, null, 1);
      if (empresas.length > 0) {
        const empresaId = empresas[0].id;

        // Buscar conversa
        const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
          empresa_id: empresaId,
          cliente_telefone: telefoneLimpo,
        }, '-updated_date', 1);

        if (conversas.length > 0) {
          conversaExiste = true;
          ultimaMensagem = conversas[0].ultima_mensagem;
          console.log(`✅ Conversa encontrada: ${conversas[0].id}`);

          // Buscar últimas mensagens
          const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
            conversa_id: conversas[0].id,
          }, '-created_date', 20);

          mensagensRecentes = msgs.map(m => ({
            id: m.id,
            remetente: m.remetente,
            conteudo: m.texto?.slice(0, 100) || '[Arquivo]',
            data: new Date(m.data_envio).toLocaleString('pt-BR'),
            tipo: m.tipo_conteudo,
          }));
        } else {
          console.log(`❌ Nenhuma conversa para este telefone`);
        }
      }
    } catch (e) {
      console.warn('Erro ao verificar conversa:', e.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // [3] Diagnóstico
    // ════════════════════════════════════════════════════════════════════
    let diagnostico = [];

    if (!webhookConfigurado) {
      diagnostico.push('❌ Webhook não está configurado');
    } else {
      diagnostico.push('✅ Webhook está ativo');
    }

    if (!conversaExiste) {
      diagnostico.push('❌ Nenhuma conversa com este contato');
    } else {
      diagnostico.push('✅ Conversa existe');
    }

    if (mensagensRecentes.length === 0 && conversaExiste) {
      diagnostico.push('⚠️ Conversa existe mas sem mensagens');
    }

    console.log('DIAGNÓSTICO:', diagnostico.join(' | '));

    return Response.json({
      status: {
        telefone: telefoneLimpo,
        webhookConfigurado,
        ultimoWebhook,
        conversaExiste,
        ultimaMensagem,
        diagnostico,
      },
      mensagensRecentes,
    });

  } catch (error) {
    console.error('[ERRO]:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});