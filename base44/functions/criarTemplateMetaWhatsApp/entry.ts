import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { empresa_id, nome, categoria, idioma, cabecalho, corpo, rodape, botoes, tipo_cabecalho, cabecalho_midia_url, cabecalho_media_id } = body;

    // Buscar configuração da empresa para pegar o access token e phone_number_id
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id });
    const empresa = empresas[0];

    if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

    const accessToken = empresa.whatsapp_access_token || Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
    const businessAccountId = empresa.whatsapp_business_account_id;

    if (!accessToken) return Response.json({ error: 'Access token da Meta não configurado' }, { status: 400 });
    if (!businessAccountId) return Response.json({ error: 'Business Account ID não configurado na empresa' }, { status: 400 });

    // Construir payload do template para a API da Meta
    const components = [];

    // Cabeçalho (opcional)
    const tipoHeader = (tipo_cabecalho || 'TEXT').toUpperCase();
    if (tipoHeader !== 'NONE') {
      if (tipoHeader === 'TEXT' && cabecalho && cabecalho.trim()) {
        components.push({ type: 'HEADER', format: 'TEXT', text: cabecalho });
      } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(tipoHeader)) {
        // A Meta exige example.header_handle com o media_id obtido via upload
        const headerComp = { type: 'HEADER', format: tipoHeader };
        if (cabecalho_media_id) {
          // media_id obtido via upload para a Meta — usar como header_handle
          headerComp.example = { header_handle: [String(cabecalho_media_id)] };
        } else if (cabecalho_midia_url && cabecalho_midia_url.startsWith('http')) {
          // URL pública direta como fallback (a Meta aceita URLs públicas permanentes como exemplo)
          headerComp.example = { header_handle: [cabecalho_midia_url] };
        }
        // Se não há exemplo, a Meta pode rejeitar — mas tentamos sem ele em último caso
        components.push(headerComp);
      }
    }

    // Corpo (obrigatório)
    if (corpo && corpo.trim()) {
      components.push({
        type: 'BODY',
        text: corpo,
      });
    }

    // Rodapé (opcional)
    if (rodape && rodape.trim()) {
      components.push({
        type: 'FOOTER',
        text: rodape,
      });
    }

    // Botões (opcional)
    if (botoes && botoes.length > 0) {
      const botoesFormatados = botoes.map(b => {
        if (b.tipo === 'URL') {
          return { type: 'URL', text: b.texto, url: b.url };
        } else if (b.tipo === 'PHONE_NUMBER') {
          return { type: 'PHONE_NUMBER', text: b.texto, phone_number: b.telefone };
        } else if (b.tipo === 'COPY_CODE') {
          return { type: 'COPY_CODE', example: [b.codigo || ''] };
        } else {
          return { type: 'QUICK_REPLY', text: b.texto };
        }
      });
      components.push({ type: 'BUTTONS', buttons: botoesFormatados });
    }

    // Validar nome do template (Meta exige: minúsculas, underscore, alfanumérico, máx 60 chars)
    let templateName = (nome || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    // Remover underscope inicial, garantir que começa com letra
    templateName = templateName.replace(/^_+/, '').replace(/^[0-9]+/, '');
    if (!templateName || templateName.length < 3) {
      return Response.json({ ok: false, error: 'Nome do template inválido. Use pelo menos 3 caracteres (apenas letras minúsculas, números e underscore).' }, { status: 400 });
    }
    if (templateName.length > 60) {
      templateName = templateName.substring(0, 60);
    }

    const payload = {
      name: templateName,
      category: categoria.toUpperCase(), // MARKETING, UTILITY, AUTHENTICATION
      language: idioma || 'pt_BR',
      allow_category_change: true,
      components,
    };

    console.log('[criarTemplateMetaWhatsApp] Payload enviado à Meta:', JSON.stringify(payload));

    // Chamar API da Meta para criar o template
    const metaUrl = `https://graph.facebook.com/v21.0/${businessAccountId}/message_templates`;
    const metaResp = await fetch(metaUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const metaData = await metaResp.json();

    if (!metaResp.ok || metaData.error) {
      const errMsg = metaData.error?.error_user_msg
        || metaData.error?.error_data?.details
        || metaData.error?.message
        || metaData.error?.error_data?.messaging_product_whatsapp?.message
        || `Erro Meta (código ${metaData.error?.code || metaResp.status})`;
      console.error('[criarTemplateMetaWhatsApp] Erro Meta:', JSON.stringify(metaData));
      return Response.json({
        ok: false,
        error: errMsg,
        details: metaData,
      }, { status: 400 });
    }

    // Salvar no CRM com status pendente (será atualizado via sincronização)
    const templateCrm = await base44.asServiceRole.entities.CampanhaLog.create({
      empresa_id,
      tipo_campanha: 'meta_template_definition',
      cliente_nome: payload.name,
      cliente_telefone: categoria,
      status: 'pendente',
      motivo_erro: JSON.stringify({
        nome: payload.name,
        categoria: categoria.toLowerCase(),
        idioma: idioma || 'pt_BR',
        cabecalho: cabecalho || '',
        corpo: corpo || '',
        rodape: rodape || '',
        tipo_cabecalho: tipo_cabecalho || 'TEXT',
        cabecalho_midia_url: cabecalho_midia_url || '',
        status_meta: 'pendente',
        meta_template_id: metaData.id,
        meta_status: metaData.status,
      }),
    });

    return Response.json({
      ok: true,
      template_id: metaData.id,
      status: metaData.status,
      crm_id: templateCrm.id,
      message: `Template "${payload.name}" enviado para aprovação da Meta com sucesso!`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});