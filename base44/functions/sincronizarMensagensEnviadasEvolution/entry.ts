import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instancia = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'JDPROMOTORA';

    if (!evolutionUrl || !evolutionKey) {
      return Response.json({ error: 'Evolution API não configurada' }, { status: 400 });
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('📤 SINCRONIZAR MENSAGENS ENVIADAS DO WHATSAPP');
    console.log(`${'='.repeat(80)}\n`);

    // ════════════════════════════════════════════════════════════════════
    // [1] Buscar todas as conversas
    // ════════════════════════════════════════════════════════════════════
    console.log('[1] Buscando conversas...');
    
    let empresaId = null;
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
    if (empresas.length > 0) {
      empresaId = empresas[0].id;
    }

    if (!empresaId) {
      return Response.json({ error: 'Nenhuma empresa encontrada' }, { status: 400 });
    }

    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: empresaId,
    }, null, 1000);

    console.log(`✅ ${conversas.length} conversas encontradas\n`);

    let totalMensagensAdicionadas = 0;
    let totalErros = 0;

    // ════════════════════════════════════════════════════════════════════
    // [2] Para cada conversa, buscar mensagens enviadas
    // ════════════════════════════════════════════════════════════════════
    for (const conversa of conversas) {
      if (!conversa.cliente_telefone) continue;

      const telefone = conversa.cliente_telefone.replace(/\D/g, '');
      const jid = `${telefone}@s.whatsapp.net`;

      try {
        console.log(`[CONVERSA] ${conversa.cliente_nome} (${telefone})`);

        // Buscar histórico de mensagens do Evolution API
        let historicoUrl = `${evolutionUrl}/chats/getMessages/${instancia}`;
        const response = await fetch(historicoUrl, {
          method: 'POST',
          headers: {
            'apikey': evolutionKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatId: jid,
            limit: 50,
          }),
        });

        if (!response.ok) {
          console.log(`  ⚠️  Erro ao buscar mensagens (status ${response.status})`);
          continue;
        }

        const data = await response.json();
        const mensagens = data.messages || data.data || [];

        console.log(`  📨 ${mensagens.length} mensagens encontradas no Evolution`);

        // ════════════════════════════════════════════════════════════════════
        // [3] Para cada mensagem, verificar se é enviada e salvar
        // ════════════════════════════════════════════════════════════════════
        for (const msg of mensagens) {
          try {
            // Detectar se é mensagem ENVIADA
            const fromMe = msg.fromMe || msg.from_me || msg.me || msg.key?.fromMe;
            if (!fromMe) continue; // Ignorar mensagens recebidas

            const messageId = msg.id || msg.key?.id;
            const textoMsg = msg.body || msg.text || msg.message?.conversation || '';

            if (!textoMsg) continue;

            // Verificar se já existe
            const msgExistente = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
              conversa_id: conversa.id,
              whatsapp_message_id: messageId,
            }, null, 1);

            if (msgExistente.length > 0) {
              continue; // Já existe
            }

            // Salvar mensagem enviada
            await base44.asServiceRole.entities.MensagemWhatsapp.create({
              conversa_id: conversa.id,
              empresa_id: empresaId,
              remetente: 'vendedor',
              tipo_conteudo: 'texto',
              texto: textoMsg.slice(0, 1000),
              whatsapp_message_id: messageId || null,
              data_envio: msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString(),
              status: 'entregue',
            });

            totalMensagensAdicionadas++;
            console.log(`  ✅ Mensagem adicionada: "${textoMsg.slice(0, 30)}..."`);

          } catch (err) {
            totalErros++;
            console.log(`  ❌ Erro ao processar mensagem: ${err.message}`);
          }
        }

      } catch (err) {
        totalErros++;
        console.log(`  ❌ Erro na conversa: ${err.message}`);
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ SINCRONIZAÇÃO CONCLUÍDA');
    console.log(`${'='.repeat(80)}`);
    console.log(`Total de mensagens adicionadas: ${totalMensagensAdicionadas}`);
    console.log(`Total de erros: ${totalErros}\n`);

    return Response.json({
      success: true,
      mensagensAdicionadas: totalMensagensAdicionadas,
      erros: totalErros,
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});