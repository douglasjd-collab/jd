import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const empresa_id = body.empresa_id;
    if (!empresa_id) return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });

    // Buscar empresa para pegar credenciais Meta
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id });
    if (!empresas.length) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

    const empresa = empresas[0];
    const accessToken = empresa.whatsapp_access_token;
    const wabaId = empresa.whatsapp_business_account_id;
    const phoneNumberId = empresa.whatsapp_phone_number_id;

    if (!accessToken || !wabaId) {
      return Response.json({ error: 'Credenciais Meta não configuradas. Configure o Access Token e Business Account ID nas configurações do WhatsApp.' }, { status: 400 });
    }

    // Buscar templates da Meta
    const url = `https://graph.facebook.com/v18.0/${wabaId}/message_templates?fields=id,name,status,language,category,components&limit=100&access_token=${accessToken}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.error) {
      return Response.json({ error: `Erro Meta API: ${data.error.message}` }, { status: 400 });
    }

    const metaTemplates = data.data || [];
    let salvos = 0;
    let atualizados = 0;

    for (const tmpl of metaTemplates) {
      // Extrair componentes
      const header = tmpl.components?.find(c => c.type === 'HEADER');
      const body = tmpl.components?.find(c => c.type === 'BODY');
      const footer = tmpl.components?.find(c => c.type === 'FOOTER');
      const buttonsComp = tmpl.components?.find(c => c.type === 'BUTTONS');

      // Tipo de cabeçalho (TEXT, IMAGE, VIDEO, DOCUMENT, NONE)
      const tipoCabecalho = header?.format || (header ? 'TEXT' : 'NONE');

      // URL da mídia do cabeçalho (quando disponível via example)
      // Prioridade: header_handle (já é media_id permanente) > header_url (temporária, precisa upload)
      let cabecalhoMidiaUrl = '';
      let cabecalhoMediaId = '';

      if (header?.example?.header_handle?.[0]) {
        // header_handle pode ser URL CDN ou handle numérico
        const handleVal = header.example.header_handle[0];
        if (/^\d{10,}$/.test(String(handleVal).trim())) {
          // Handle numérico permanente — usar diretamente
          cabecalhoMediaId = handleVal;
          cabecalhoMidiaUrl = handleVal;
        } else {
          // URL CDN — fazer upload para obter media_id permanente
          cabecalhoMidiaUrl = handleVal;
          try {
            const imgR = await fetch(handleVal);
            if (imgR.ok) {
              const buf = await imgR.arrayBuffer();
              const ct = imgR.headers.get('content-type') || 'image/jpeg';
              const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
              const fd = new FormData();
              fd.append('messaging_product', 'whatsapp');
              fd.append('type', ct);
              fd.append('file', new Blob([buf], { type: ct }), `header.${ext}`);
              const upR = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/media`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: fd,
              });
              const upData = await upR.json();
              if (upData.id) {
                cabecalhoMediaId = upData.id;
                cabecalhoMidiaUrl = upData.id; // salvar o media_id como "url" para uso no disparo
                console.log(`✅ Upload header ${tmpl.name}: media_id=${upData.id}`);
              }
            }
          } catch (upErr) {
            console.warn(`⚠️ Upload header falhou para ${tmpl.name}:`, upErr.message);
          }
        }
      } else if (header?.example?.header_url?.[0]) {
        cabecalhoMidiaUrl = header.example.header_url[0];
      }

      // Botões
      const botoes = (buttonsComp?.buttons || []).map(btn => {
        if (btn.type === 'QUICK_REPLY') return { tipo: 'QUICK_REPLY', texto: btn.text };
        if (btn.type === 'URL') return { tipo: 'URL', texto: btn.text, url: btn.url };
        if (btn.type === 'PHONE_NUMBER') return { tipo: 'PHONE_NUMBER', texto: btn.text, telefone: btn.phone_number };
        if (btn.type === 'COPY_CODE') return { tipo: 'COPY_CODE', texto: btn.text, codigo: btn.example?.[0] || '' };
        return { tipo: btn.type, texto: btn.text };
      });

      const templateDados = {
        nome: tmpl.name,
        categoria: (tmpl.category || 'marketing').toLowerCase(),
        idioma: tmpl.language,
        corpo: body?.text || '',
        cabecalho: header?.text || '',
        rodape: footer?.text || '',
        tipo_cabecalho: tipoCabecalho,
        cabecalho_midia_url: cabecalhoMidiaUrl,
        botoes,
        status_meta: (tmpl.status || 'PENDING').toLowerCase() === 'approved' ? 'aprovado' :
                     (tmpl.status || '').toLowerCase() === 'rejected' ? 'rejeitado' : 'pendente',
        meta_id: tmpl.id,
      };

      // Verificar se já existe
      const existentes = await base44.asServiceRole.entities.CampanhaLog.filter({
        empresa_id,
        tipo_campanha: 'meta_template_definition',
        cliente_nome: tmpl.name,
      });

      if (existentes.length > 0) {
        await base44.asServiceRole.entities.CampanhaLog.update(existentes[0].id, {
          motivo_erro: JSON.stringify(templateDados),
          status: templateDados.status_meta === 'aprovado' ? 'enviada' : 'pendente',
        });
        atualizados++;
      } else {
        await base44.asServiceRole.entities.CampanhaLog.create({
          empresa_id,
          tipo_campanha: 'meta_template_definition',
          cliente_nome: tmpl.name,
          cliente_telefone: templateDados.categoria,
          status: templateDados.status_meta === 'aprovado' ? 'enviada' : 'pendente',
          motivo_erro: JSON.stringify(templateDados),
        });
        salvos++;
      }
    }

    return Response.json({
      ok: true,
      total: metaTemplates.length,
      novos: salvos,
      atualizados,
      message: `${metaTemplates.length} templates sincronizados (${salvos} novos, ${atualizados} atualizados)`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});