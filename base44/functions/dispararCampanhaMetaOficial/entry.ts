import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { empresa_id, template_name, template_language = 'pt_BR', variaveis = {}, contatos = [], template_header_type, template_header_url, template_botoes = [] } = await req.json();

    if (!empresa_id || !template_name || contatos.length === 0) {
      return Response.json({ error: 'empresa_id, template_name e contatos são obrigatórios' }, { status: 400 });
    }

    const empresa = await base44.asServiceRole.entities.Empresa.get(empresa_id);
    if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

    const accessToken = empresa.whatsapp_access_token;
    const phoneNumberId = empresa.whatsapp_phone_number_id;

    if (!accessToken || !phoneNumberId) {
      return Response.json({ error: 'Credenciais Meta (access_token e phone_number_id) não configuradas na empresa' }, { status: 400 });
    }

    const metaUrl = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

    let enviados = 0;
    let erros = 0;
    const resultados = [];

    for (const telefone of contatos) {
      const numeroLimpo = String(telefone).replace(/\D/g, '');
      if (numeroLimpo.length < 10) {
        erros++;
        resultados.push({ telefone, status: 'erro', motivo: 'Número inválido' });
        continue;
      }

      // Montar componentes de variáveis
      // Nota: para templates com imagem/vídeo fixos, a Meta não exige componente header no envio —
      // a mídia já está registrada no template. Só body variables e botões são necessários.
      const components = [];

      // Body variables
      const varsKeys = Object.keys(variaveis);
      if (varsKeys.length > 0) {
        const parametros = varsKeys.map(k => ({ type: 'text', text: variaveis[k] || '' }));
        components.push({ type: 'body', parameters: parametros });
      }

      // Botões QUICK_REPLY (índice de cada botão)
      if (Array.isArray(template_botoes) && template_botoes.length > 0) {
        template_botoes.forEach((btn, idx) => {
          if (btn.tipo === 'QUICK_REPLY') {
            components.push({
              type: 'button',
              sub_type: 'quick_reply',
              index: String(idx),
              parameters: [{ type: 'payload', payload: btn.texto || String(idx) }],
            });
          }
        });
      }

      const payload = {
        messaging_product: 'whatsapp',
        to: numeroLimpo,
        type: 'template',
        template: {
          name: template_name,
          language: { code: template_language },
          ...(components.length > 0 ? { components } : {}),
        },
      };

      try {
        const resp = await fetch(metaUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await resp.json();

        if (!resp.ok) {
          const errDetail = data?.error?.error_data?.details || data?.error?.message || `HTTP ${resp.status}`;
          console.error(`❌ Meta API error para ${numeroLimpo}:`, JSON.stringify(data?.error));
          throw new Error(errDetail);
        }

        // Registrar no CampanhaLog
        await base44.asServiceRole.entities.CampanhaLog.create({
          empresa_id,
          tipo_campanha: 'meta_oficial',
          cliente_telefone: numeroLimpo,
          cliente_nome: numeroLimpo,
          status: 'enviada',
          numero_sequencia: 1,
        });

        enviados++;
        resultados.push({ telefone: numeroLimpo, status: 'enviada', message_id: data?.messages?.[0]?.id });

      } catch (e) {
        erros++;
        console.error(`❌ Erro ao enviar para ${numeroLimpo}:`, e.message);

        await base44.asServiceRole.entities.CampanhaLog.create({
          empresa_id,
          tipo_campanha: 'meta_oficial',
          cliente_telefone: numeroLimpo,
          cliente_nome: numeroLimpo,
          status: 'erro',
          motivo_erro: e.message,
        }).catch(() => {});

        resultados.push({ telefone: numeroLimpo, status: 'erro', motivo: e.message });
      }

      // Delay de 100ms entre envios para evitar rate limit
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`✅ Campanha Meta Oficial: ${enviados} enviados, ${erros} erros`);

    return Response.json({
      ok: true,
      enviados,
      erros,
      total: contatos.length,
      resultados,
    });

  } catch (error) {
    console.error('❌ Erro crítico:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});