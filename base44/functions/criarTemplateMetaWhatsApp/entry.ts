import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { empresa_id, nome, categoria, idioma, cabecalho, corpo, rodape, botoes, tipo_cabecalho } = body;

    // Buscar configuração da empresa para pegar o access token e phone_number_id
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id });
    const empresa = empresas[0];

    if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

    const accessToken = empresa.whatsapp_access_token || Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = empresa.whatsapp_phone_number_id;
    const businessAccountId = empresa.whatsapp_business_account_id;

    if (!accessToken) return Response.json({ error: 'Access token da Meta não configurado' }, { status: 400 });
    if (!businessAccountId) return Response.json({ error: 'Business Account ID não configurado na empresa' }, { status: 400 });

    // Construir payload do template para a API da Meta
    const components = [];

    // Cabeçalho (opcional)
    if (cabecalho && cabecalho.trim()) {
      const tipoHeader = tipo_cabecalho || 'TEXT';
      components.push({
        type: 'HEADER',
        format: tipoHeader.toUpperCase(),
        text: tipoHeader.toUpperCase() === 'TEXT' ? cabecalho : undefined,
      });
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
        } else {
          return { type: 'QUICK_REPLY', text: b.texto };
        }
      });
      components.push({ type: 'BUTTONS', buttons: botoesFormatados });
    }

    const payload = {
      name: nome.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      category: categoria.toUpperCase(), // MARKETING, UTILITY, AUTHENTICATION
      language: idioma || 'pt_BR',
      components,
    };

    // Chamar API da Meta para criar o template
    const metaUrl = `https://graph.facebook.com/v18.0/${businessAccountId}/message_templates`;
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
      return Response.json({
        error: metaData.error?.message || 'Erro ao criar template na Meta',
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