import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { empresa_id, contatos, mensagem_texto, nome_campanha, delay_segundos = 7, api_preferida = 'meta' } = body;

    if (!empresa_id) return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });
    if (!mensagem_texto?.trim()) return Response.json({ error: 'mensagem_texto obrigatório' }, { status: 400 });
    if (!contatos || contatos.length === 0) return Response.json({ error: 'contatos obrigatório' }, { status: 400 });

    // Buscar empresa para pegar credenciais
    const empresa = await base44.asServiceRole.entities.Empresa.get(empresa_id);
    if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

    const evolutionApiKey = empresa.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY');
    const evolutionApiUrl = empresa.evolution_url || Deno.env.get('EVOLUTION_API_URL');
    const instanceName = empresa.evolution_instance_name || Deno.env.get('EVOLUTION_INSTANCE_NAME');
    const accessToken = empresa.whatsapp_access_token;
    const phoneNumberId = empresa.whatsapp_phone_number_id;

    const temEvolution = !!(evolutionApiKey && evolutionApiUrl && instanceName);
    const temMeta = !!(accessToken && phoneNumberId);

    if (!temEvolution && !temMeta) {
      return Response.json({ error: 'Nenhuma API configurada. Configure a Evolution API ou a API Oficial Meta nas configurações.' }, { status: 400 });
    }

    let enviados = 0;
    let erros = 0;
    const delayMs = Math.max(1, Number(delay_segundos)) * 1000;

    for (const telefone of contatos) {
      const numeroLimpo = String(telefone).replace(/\D/g, '');
      if (!numeroLimpo || numeroLimpo.length < 10) {
        erros++;
        continue;
      }

      try {
        // Tentar enviar via Evolution primeiro, depois Meta como fallback
        let enviou = false;

        if (api_preferida === 'meta' && temMeta) {
          // Enviar via API Oficial Meta primeiro
          const metaUrl = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
          const resp = await fetch(metaUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: numeroLimpo,
              type: 'text',
              text: { body: mensagem_texto.trim() },
            }),
          });
          if (resp.ok) enviou = true;
        } else if (api_preferida === 'evolution' && temEvolution) {
          // Enviar via Evolution API
          const baseUrl = evolutionApiUrl.replace(/\/$/, '');
          const endpoint = `${baseUrl}/message/sendText/${instanceName}`;
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
            body: JSON.stringify({ number: numeroLimpo, text: mensagem_texto.trim() }),
          });
          if (resp.ok) enviou = true;
        }

        // Fallback: se a API preferida falhou ou não está configurada, tenta a outra
        if (!enviou && temMeta && api_preferida !== 'meta') {
          const metaUrl = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
          const resp = await fetch(metaUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: numeroLimpo,
              type: 'text',
              text: { body: mensagem_texto.trim() },
            }),
          });
          if (resp.ok) enviou = true;
        }

        if (!enviou && temEvolution && api_preferida !== 'evolution') {
          const baseUrl = evolutionApiUrl.replace(/\/$/, '');
          const endpoint = `${baseUrl}/message/sendText/${instanceName}`;
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
            body: JSON.stringify({ number: numeroLimpo, text: mensagem_texto.trim() }),
          });
          if (resp.ok) enviou = true;
        }

        if (enviou) {
          // Registrar log do disparo
          await base44.asServiceRole.entities.CampanhaLog.create({
            empresa_id,
            tipo_campanha: 'meta_oficial',
            cliente_telefone: numeroLimpo,
            cliente_nome: nome_campanha || 'Campanha Texto',
            status: 'enviada',
          });

          // Criar ou marcar conversa como campanha
          const convs = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
            { empresa_id, cliente_telefone: numeroLimpo }, '-data_ultima_mensagem', 1
          );
          if (convs.length > 0) {
            await base44.asServiceRole.entities.ConversaWhatsapp.update(convs[0].id, {
              status: 'campanha',
              origem: 'campanha',
              ultima_mensagem: mensagem_texto.trim().substring(0, 200),
              data_ultima_mensagem: new Date().toISOString(),
              ultimo_remetente: 'vendedor',
              tipo_conexao: 'meta_oficial',
              canal_origem: 'meta',
              provider: 'whatsapp_meta',
            }).catch(() => {});
          } else {
            const phoneNumberId = empresa.whatsapp_phone_number_id;
            await base44.asServiceRole.entities.ConversaWhatsapp.create({
              empresa_id,
              cliente_telefone: numeroLimpo,
              cliente_nome: numeroLimpo,
              status: 'campanha',
              origem: 'campanha',
              tipo_conexao: 'meta_oficial',
              canal_origem: 'meta',
              provider: 'whatsapp_meta',
              phone_number_id_meta: phoneNumberId || null,
              data_ultima_mensagem: new Date().toISOString(),
              ultima_mensagem: mensagem_texto.trim().substring(0, 200),
              ultimo_remetente: 'vendedor',
            }).catch(() => {});
          }

          enviados++;
        } else {
          erros++;
        }
      } catch {
        erros++;
      }

      // Delay entre mensagens
      if (delayMs > 0 && contatos.indexOf(telefone) < contatos.length - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    return Response.json({ ok: true, enviados, erros, total: contatos.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});