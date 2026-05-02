import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar empresa do usuário
    let empresaId = null;
    const colabs = await base44.entities.Colaborador.filter({ user_id: user.id }, null, 1);
    if (colabs?.[0]?.empresa_id) {
      empresaId = colabs[0].empresa_id;
    }

    if (!empresaId) {
      return Response.json({ error: 'No company found' }, { status: 400 });
    }

    // Buscar empresa e credenciais Evolution
    const empresas = await base44.entities.Empresa.filter({ id: empresaId }, null, 1);
    const empresa = empresas?.[0];

    if (!empresa?.evolution_url || !empresa?.evolution_instance_name || !empresa?.evolution_api_key) {
      return Response.json({ error: 'Evolution API not configured' }, { status: 400 });
    }

    const evolutionUrl = empresa.evolution_url.replace(/\/manager\/?$/, '');
    const headers = {
      'apikey': empresa.evolution_api_key,
      'Content-Type': 'application/json',
    };

    // 1. Buscar mensagens enviadas recentemente SEM status confirmado
    const mensagens = await base44.entities.MensagemWhatsapp.filter(
      {
        empresa_id: empresaId,
        remetente: 'vendedor',
        status: { $in: ['pendente', 'enviada'] },
      },
      '-data_envio',
      100
    );

    console.log(`📨 Encontradas ${mensagens.length} mensagens sem confirmação`);

    let atualizadas = 0;
    const erros = [];

    // 2. Para cada mensagem, consultar status na Evolution API
    for (const msg of mensagens) {
      if (!msg.whatsapp_message_id) {
        console.log(`⚠️ Mensagem ${msg.id} sem whatsapp_message_id - pulando`);
        continue;
      }

      try {
        // Buscar status via Evolution API
        const statusResp = await fetch(
          `${evolutionUrl}/message/read/${empresa.evolution_instance_name}/${msg.whatsapp_message_id}`,
          { headers }
        );

        if (!statusResp.ok) {
          // Tentar endpoint alternativo
          const statusResp2 = await fetch(
            `${evolutionUrl}/chat/messages/${empresa.evolution_instance_name}`,
            { headers, method: 'POST', body: JSON.stringify({ messageId: msg.whatsapp_message_id }) }
          );

          if (!statusResp2.ok) {
            erros.push(`${msg.id}: Status endpoint not found`);
            continue;
          }
        }

        const statusData = await statusResp.json();
        const novoStatus = statusData?.status || statusData?.state || null;

        if (novoStatus) {
          // Mapear status da Evolution para nosso padrão
          let statusMapeado = msg.status;
          if (novoStatus.includes('read') || novoStatus === 'lida') statusMapeado = 'lida';
          else if (novoStatus.includes('delivered') || novoStatus === 'entregue') statusMapeado = 'entregue';
          else if (novoStatus.includes('sent') || novoStatus === 'enviada') statusMapeado = 'enviada';

          // Atualizar apenas se houve mudança
          if (statusMapeado !== msg.status) {
            await base44.entities.MensagemWhatsapp.update(msg.id, { status: statusMapeado });
            atualizadas++;
            console.log(`✅ ${msg.id}: ${msg.status} → ${statusMapeado}`);
          }
        }
      } catch (e) {
        erros.push(`${msg.id}: ${e.message}`);
      }
    }

    return Response.json({
      sucesso: true,
      total: mensagens.length,
      atualizadas,
      erros: erros.slice(0, 5),
      mensagem: `✅ Atualizado ${atualizadas}/${mensagens.length} mensagens`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});