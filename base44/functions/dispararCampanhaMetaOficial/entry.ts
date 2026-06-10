import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { empresa_id, template_name, template_language = 'pt_BR', variaveis = {}, contatos = [], template_header_type, template_header_url, template_botoes = [], conversa_id, texto_preview, delay_segundos = 5, pausar_apos = 0, duracao_pausa = 60 } = await req.json();

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

    // Buscar definição do template para obter header type e URL da mídia
    let templateHeaderType = template_header_type || null;
    let templateHeaderUrl = template_header_url || null;
    try {
      const defs = await base44.asServiceRole.entities.CampanhaLog.filter({
        empresa_id,
        tipo_campanha: 'meta_template_definition',
      }, '-created_date', 200);
      const def = defs.find(d => {
        try { return JSON.parse(d.motivo_erro || '{}').nome === template_name; } catch { return false; }
      });
      if (def) {
        const parsed = JSON.parse(def.motivo_erro || '{}');
        // Chaves salvas pelo sincronizarTemplatesMeta: tipo_cabecalho e cabecalho_midia_url
        if (!templateHeaderType) templateHeaderType = parsed.tipo_cabecalho || parsed.header_type || null;
        if (!templateHeaderUrl) templateHeaderUrl = parsed.cabecalho_midia_url || parsed.header_url || null;
        console.log('📋 Template def encontrado — tipo_cabecalho:', templateHeaderType, '| cabecalho_midia_url:', templateHeaderUrl?.substring(0, 80));
      }
    } catch (e) {
      console.warn('⚠️ Erro ao buscar definição do template:', e.message);
    }

    for (const telefone of contatos) {
      const numeroLimpo = String(telefone).replace(/\D/g, '');
      if (numeroLimpo.length < 10) {
        erros++;
        resultados.push({ telefone, status: 'erro', motivo: 'Número inválido' });
        continue;
      }

      const components = [];

      // Header com mídia — apenas quando há URL pública fornecida pelo usuário
      // Se cabecalho_midia_url é handle numérico da Meta (imagem aprovada junto ao template),
      // NÃO enviar componente header — a Meta resolve a mídia automaticamente pelo template.
      const headerType = (templateHeaderType || '').toUpperCase();
      if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && templateHeaderUrl) {
        const isHandle = /^\d+$/.test(String(templateHeaderUrl).trim());
        if (isHandle) {
          // Handle numérico = mídia vinculada ao template na Meta, não enviar header component
          console.log(`📎 Header ${headerType}: handle numérico detectado — omitindo componente header (Meta resolve automaticamente)`);
        } else {
          // URL pública fornecida pelo usuário — enviar como link
          const mediaKey = headerType === 'IMAGE' ? 'image' : headerType === 'VIDEO' ? 'video' : 'document';
          console.log(`📎 Header ${headerType}: link = ${String(templateHeaderUrl).substring(0, 80)}`);
          components.push({
            type: 'header',
            parameters: [{ type: mediaKey, [mediaKey]: { link: templateHeaderUrl } }],
          });
        }
      }

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

        // Salvar como MensagemWhatsapp para aparecer no chat
        if (conversa_id) {
          const whatsappMsgId = data?.messages?.[0]?.id;
          const textoMensagem = texto_preview || `📋 Template enviado: ${template_name}`;
          await base44.asServiceRole.entities.MensagemWhatsapp.create({
            conversa_id,
            empresa_id,
            remetente: 'vendedor',
            usuario_id: user.id,
            usuario_nome: user.full_name || '',
            tipo_conteudo: 'texto',
            texto: textoMensagem,
            whatsapp_message_id: whatsappMsgId || null,
            data_envio: new Date().toISOString(),
            status: 'enviada',
          });

          // Atualizar última mensagem da conversa
          await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa_id, {
            ultima_mensagem: textoMensagem,
            data_ultima_mensagem: new Date().toISOString(),
            ultimo_remetente: 'vendedor',
          }).catch(() => {});
        }

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

      // Delay configurável entre envios
      const delayMs = Math.max(1000, (Number(delay_segundos) || 5) * 1000);
      await new Promise(r => setTimeout(r, delayMs));

      // Pausa automática a cada N mensagens
      if (pausar_apos > 0 && (enviados + erros) % pausar_apos === 0 && (enviados + erros) > 0) {
        const pausaMs = Math.max(10000, (Number(duracao_pausa) || 60) * 1000);
        console.log(`⏸️ Pausa automática de ${pausaMs / 1000}s após ${enviados + erros} mensagens`);
        await new Promise(r => setTimeout(r, pausaMs));
      }
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