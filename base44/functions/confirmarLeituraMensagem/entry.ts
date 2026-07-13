import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { mensagem_id, conversa_id } = await req.json();
    if (!mensagem_id) {
      return Response.json({ error: 'mensagem_id obrigatório' }, { status: 400 });
    }

    // Buscar mensagem
    const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter({ id: mensagem_id });
    const mensagem = mensagens?.[0];
    if (!mensagem) {
      return Response.json({ error: 'Mensagem não encontrada' }, { status: 404 });
    }

    // Só marca como lida se for mensagem recebida do cliente
    if (mensagem.remetente === 'cliente' && mensagem.status !== 'lida') {
      await base44.asServiceRole.entities.MensagemWhatsapp.update(mensagem_id, {
        status: 'lida'
      });
      console.log(`✅ Mensagem ${mensagem_id} marcada como lida`);
    }

    // Opcionalmente enviar confirmação de leitura para Evolution API ou D-API
    if (mensagem.whatsapp_message_id) {
      try {
        const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({ id: conversa_id || mensagem.conversa_id });
        const conversa = conversas?.[0];
        if (!conversa) return Response.json({ ok: true });

        const phoneNumber = conversa.cliente_telefone?.replace(/\D/g, '') || '';
        if (!phoneNumber) return Response.json({ ok: true });

        // Conversa via D-API: buscar conexão e confirmar leitura via POST /api/v1/chats/read
        if (mensagem.provider === 'dapi' || conversa.tipo_conexao === 'dapi') {
          let conexaoDapi = null;
          if (conversa.connection_id) {
            try {
              const conexaoEspecifica = await base44.asServiceRole.entities.WhatsappConnection.get(conversa.connection_id);
              if (conexaoEspecifica?.provider_type === 'dapi' && conexaoEspecifica.is_active) conexaoDapi = conexaoEspecifica;
            } catch (_) {}
          }
          if (!conexaoDapi) {
            const conexoes = await base44.asServiceRole.entities.WhatsappConnection.filter({
              empresa_id: mensagem.empresa_id,
              provider_type: 'dapi',
              is_active: true
            }, '-created_date', 1);
            conexaoDapi = conexoes[0] || null;
          }

          if (conexaoDapi) {
            const readResp = await base44.functions.invoke('whatsappService', {
              connectionId: conexaoDapi.id,
              action: 'markAsRead',
              phoneNumber,
              messageIds: [mensagem.whatsapp_message_id]
            });
            if (readResp?.data?.success) {
              console.log(`✅ Confirmação de leitura enviada para D-API`);
            } else {
              console.warn(`⚠️ Erro ao enviar confirmação de leitura via D-API:`, readResp?.data?.error);
            }
          }
          return Response.json({ ok: true, status: 'lida' });
        }

        // Conversa via Evolution API
        const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: mensagem.empresa_id });
        const empresa = empresas?.[0];
        if (!empresa?.evolution_url || !empresa?.evolution_api_key) {
          return Response.json({ ok: true });
        }

        const evolutionUrl = empresa.evolution_url.replace(/\/$/, '');
        const evolutionKey = empresa.evolution_api_key;
        const instanceName = empresa.evolution_instance_name;

        // Enviar confirmação de leitura via Evolution
        const readRes = await fetch(`${evolutionUrl}/message/sendRead/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: phoneNumber,
            readMessages: [mensagem.whatsapp_message_id]
          })
        });

        const readText = await readRes.text();
        if (readRes.ok) {
          console.log(`✅ Confirmação de leitura enviada para Evolution`);
        } else {
          console.warn(`⚠️ Erro ao enviar confirmação de leitura: ${readRes.status}`, readText.substring(0, 200));
        }
      } catch (e) {
        console.warn(`⚠️ Erro ao confirmar leitura:`, e.message);
      }
    }

    return Response.json({ ok: true, status: 'lida' });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});