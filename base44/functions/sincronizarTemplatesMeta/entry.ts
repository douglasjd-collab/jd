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
    // 1) Credenciais da própria empresa (multi-tenant) — entidade Empresa
    // 2) Fallback: app secrets — single-tenant
    const accessToken = empresa.whatsapp_access_token || Deno.env.get('META_WHATSAPP_ACCESS_TOKEN') || '';
    const wabaId = empresa.whatsapp_business_account_id || Deno.env.get('META_WABA_ID') || '';
    const phoneNumberId = empresa.whatsapp_phone_number_id || Deno.env.get('META_PHONE_NUMBER_ID') || '';

    if (!accessToken || !wabaId) {
      return Response.json({ error: 'Credenciais Meta não configuradas. Configure o Access Token e Business Account ID na empresa ou nos secrets do app (META_WHATSAPP_ACCESS_TOKEN, META_WABA_ID).' }, { status: 400 });
    }

    // Versão dinâmica da API Meta
    let metaApiVersion = 'v23.0';
    try {
      const configsVersao = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({
        chave: `meta_api_versao_${empresa_id}`,
        empresa_id
      }, '-created_date', 1);
      if (configsVersao?.length > 0 && configsVersao[0].valor) {
        metaApiVersion = configsVersao[0].valor;
      }
    } catch (_) {}

    // Detectar conexão D-API Cloud API ativa (provider_type=dapi, session_id
    // começando em "cloud-"). Quando existe, o envio do template pelo
    // whatsappService/dispararCampanhaMetaOficial roteia pela WABA gerenciada
    // pela D-API — que geralmente NÃO coincide com a WABA configurada na
    // empresa (Embedded Signup separado) nem com os secrets globais do app.
    // Para a lista de templates refletir os que realmente funcionarão no
    // envio, usamos o endpoint próprio da D-API Cloud API:
    //   GET /api/v1/connections/cloud-api/{sessionId}/templates
    // (documentado em https://docs.d-api.cloud/api-reference/cloud-api/list-approved-waba-templates)
    const connFilter = empresa_id ? { empresa_id, provider_type: 'dapi' } : { provider_type: 'dapi' };
    const conns = await base44.asServiceRole.entities.WhatsappConnection.filter(
      connFilter, '-created_date', 100
    );
    const conexaoCloudApi = (conns || []).find(c =>
      c.is_active !== false &&
      c.status === 'conectado' &&
      typeof c.session_id === 'string' && c.session_id.startsWith('cloud-')
    );

    let metaTemplates: any[] = [];

    if (conexaoCloudApi && conexaoCloudApi.session_id) {
      // Rota 1 — D-API Cloud API: lista templates APROVADOS da WABA Cloud que
      // a D-API usa no envio. Resposta é um array de objetos Meta-compatíveis
      // (name, language, category, status, components).
      const apiKey = Deno.env.get('DAPI_USER_API_KEY');
      if (!apiKey) {
        return Response.json({ error: 'DAPI_USER_API_KEY não configurado no backend para sincronizar a conexão Cloud API.' }, { status: 400 });
      }
      const dapiUrl = `https://api.d-api.cloud/api/v1/connections/cloud-api/${encodeURIComponent(conexaoCloudApi.session_id)}/templates?limit=250`;
      const dapiResp = await fetch(dapiUrl, { headers: { 'Authorization': apiKey, 'Accept': 'application/json' } });
      const dapiData = await dapiResp.json().catch(() => ({}));
      if (!dapiResp.ok) {
        return Response.json({ error: `Erro D-API Cloud API: ${dapiData?.error || dapiData?.message || 'HTTP ' + dapiResp.status}` }, { status: 400 });
      }
      const rawList = Array.isArray(dapiData?.data) ? dapiData.data : (Array.isArray(dapiData?.templates) ? dapiData.templates : []);
      // Normaliza para o mesmo formato que o loop abaixo já conhece
      // (tmpl.name, tmpl.language, tmpl.status, tmpl.category, tmpl.components).
      // A D-API pode devolver tanto o formato {components:[...]} (igual Meta)
      // quanto {header, body, footer, buttons} (formato simplificado) — cobrimos ambos.
      metaTemplates = (rawList as any[]).map((d: any) => {
        const componentes: any[] = Array.isArray(d.components) ? d.components : [];
        if (componentes.length === 0) {
          // Formato simplificado D-API: monta components a partir de header/body/footer/buttons
          if (d.header) {
            if (typeof d.header === 'string') componentes.push({ type: 'HEADER', format: 'TEXT', text: d.header });
            else if (typeof d.header === 'object') {
              const h: any = { type: 'HEADER', format: d.header.format || 'TEXT' };
              if (typeof d.header.text === 'string') h.text = d.header.text;
              if (d.header.example) h.example = d.header.example;
              componentes.push(h);
            }
          }
          if (d.body) {
            const b: any = { type: 'BODY', text: d.body };
            if (d.bodyExample) b.example = { body_text: [d.bodyExample] };
            componentes.push(b);
          }
          if (d.footer) componentes.push({ type: 'FOOTER', text: d.footer });
          if (Array.isArray(d.buttons) && d.buttons.length > 0) componentes.push({ type: 'BUTTONS', buttons: d.buttons });
        }
        return {
          id: d.id || d.templateId || d.meta_template_id || null,
          name: d.name,
          language: d.language || 'pt_BR',
          status: d.status || 'APPROVED',
          category: d.category || 'MARKETING',
          quality_rating: d.quality_rating || null,
          rejected_reason: d.rejected_reason || d.rejection_reason || null,
          components: componentes,
        };
      });
    } else {
      // Rota 2 — Fallback: Meta Graph API direta (WABA configurada na empresa).
      // Usada quando não há conexão D-API Cloud ativa (multi-tenant com token próprio).
      if (!accessToken || !wabaId) {
        return Response.json({ error: 'Nenhuma conexão D-API Cloud ativa nem credenciais Meta configuradas. Conecte a WhatsApp API Oficial (Meta) via D-API Cloud primeiro.' }, { status: 400 });
      }
      const url = `https://graph.facebook.com/${metaApiVersion}/${wabaId}/message_templates?fields=id,name,status,language,category,components&limit=100&access_token=${accessToken}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.error) {
        return Response.json({ error: `Erro Meta API: ${data.error.message}` }, { status: 400 });
      }
      metaTemplates = data.data || [];
    }

    const viaDapi = !!(conexaoCloudApi && conexaoCloudApi.session_id);
    let salvos = 0;
    let atualizados = 0;
    // Conjunto de (nome|idioma) retornados nesta sincronização — usado no
    // final para marcar como "removido_meta" qualquer entrada antiga do
    // CampanhaLog que não veio mais da D-API/Meta (template foi pausado,
    // rejeitado ou excluído). Esconde do modal "Enviar Template Meta".
    const nomesThisSync = new Set<string>();

    for (const tmpl of metaTemplates) {
      const idiomaNorm = String(tmpl.language || 'pt_BR').toLowerCase().replace('-', '_');
      nomesThisSync.add(`${(tmpl.name || '').toLowerCase()}|${idiomaNorm}`);
      // Extrair componentes
      const header = tmpl.components?.find(c => c.type === 'HEADER');
      const body = tmpl.components?.find(c => c.type === 'BODY');
      const footer = tmpl.components?.find(c => c.type === 'FOOTER');
      const buttonsComp = tmpl.components?.find(c => c.type === 'BUTTONS');

      // Tipo de cabeçalho (TEXT, IMAGE, VIDEO, DOCUMENT, NONE)
      const tipoCabecalho = header?.format || (header ? 'TEXT' : 'NONE');

      // URL da mídia do cabeçalho (quando disponível via example)
      // Prioridade: header_handle (já é media_id permanente) > header_url (temporária, precisa upload)
      const ehVideo = tipoCabecalho === 'VIDEO';
      let cabecalhoMidiaUrl = '';
      let cabecalhoMediaId = '';

      if (header?.example?.header_handle?.[0]) {
        // header_handle pode ser URL CDN ou handle numérico
        const handleVal = header.example.header_handle[0];
        if (/^\d{10,}$/.test(String(handleVal).trim())) {
          // Handle numérico permanente — baixar mídia da Meta e fazer upload para URL pública
          cabecalhoMediaId = handleVal;
          cabecalhoMidiaUrl = handleVal; // fallback (handle numérico)
          try {
            // Buscar URL temporária da Meta para o media handle
            const mediaUrlMeta = `https://graph.facebook.com/${metaApiVersion}/${handleVal}`;
            const mediaR = await fetch(mediaUrlMeta, {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            });
            const mediaData = await mediaR.json();
            if (mediaData.url) {
              // Baixar mídia da URL temporária
              const mediaFetch = await fetch(mediaData.url);
              if (mediaFetch.ok) {
                const buf = await mediaFetch.arrayBuffer();
                const ct = mediaFetch.headers.get('content-type') || (ehVideo ? 'video/mp4' : 'image/jpeg');
                let ext;
                if (ehVideo) {
                  ext = ct.includes('mp4') ? 'mp4' : ct.includes('webm') ? 'webm' : 'mp4';
                } else {
                  ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
                }
                // Upload para storage Base44
                const blob = new Blob([buf], { type: ct });
                const fileObj = new File([blob], `template_${tmpl.name}.${ext}`, { type: ct });
                const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file: fileObj });
                cabecalhoMidiaUrl = file_url;
                console.log(`✅ ${ehVideo ? 'Vídeo' : 'Imagem'} do template ${tmpl.name} salvo no storage: ${file_url}`);
              }
            }
          } catch (e) {
            console.warn(`⚠️ Falha ao baixar mídia do handle ${handleVal}:`, e.message);
          }
        } else {
          // URL CDN — fazer upload para storage Base44 (URL pública permanente) + Meta (media_id)
          cabecalhoMidiaUrl = handleVal; // manter URL original como fallback
          try {
            const mediaFetch = await fetch(handleVal);
            if (mediaFetch.ok) {
              const buf = await mediaFetch.arrayBuffer();
              const ct = mediaFetch.headers.get('content-type') || (ehVideo ? 'video/mp4' : 'image/jpeg');
              let ext;
              if (ehVideo) {
                ext = ct.includes('mp4') ? 'mp4' : ct.includes('webm') ? 'webm' : 'mp4';
              } else {
                ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
              }
              // Upload para storage Base44 (URL pública permanente para preview)
              try {
                const blob = new Blob([buf], { type: ct });
                const fileObj = new File([blob], `template_${tmpl.name}.${ext}`, { type: ct });
                const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file: fileObj });
                cabecalhoMidiaUrl = file_url;
                console.log(`✅ ${ehVideo ? 'Vídeo' : 'Imagem'} template ${tmpl.name} salvo no storage: ${file_url}`);
              } catch (storageErr) {
                console.warn(`⚠️ Storage upload falhou para ${tmpl.name}, usando URL CDN:`, storageErr.message);
              }
              // Upload para Meta (media_id para disparos)
              const fd = new FormData();
              fd.append('messaging_product', 'whatsapp');
              fd.append('type', ct);
              fd.append('file', new Blob([buf], { type: ct }), `header.${ext}`);
              const upR = await fetch(`https://graph.facebook.com/${metaApiVersion}/${phoneNumberId}/media`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: fd,
              });
              const upData = await upR.json();
              if (upData.id) {
                cabecalhoMediaId = upData.id;
                console.log(`✅ Upload Meta ${tmpl.name}: media_id=${upData.id}`);
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
        cabecalho_media_id: cabecalhoMediaId,
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

    // Limpeza: entradas de CampanhaLog (meta_template_definition) cujos
    // (nome|idioma) não voltaram nesta sincronização são marcadas como
    // removidas da Meta — seus `status_meta` viram 'removido_meta' para que o
    // modal "Enviar Template Meta" pare de mostrá-las como Aprovado, evitando
    // disparos que falham com #132001 (Template name does not exist in the
    // translation) pq o template na verdade foi excluído/pausado na WABA.
    let removidos = 0;
    try {
      const todos = await base44.asServiceRole.entities.CampanhaLog.filter({
        empresa_id,
        tipo_campanha: 'meta_template_definition',
      }, '-created_date', 300);
      for (const entry of todos) {
        let d: any = {};
        try { d = JSON.parse(entry.motivo_erro || '{}'); } catch {}
        const idioma = String(d.idioma || 'pt_BR').toLowerCase().replace('-', '_');
        const key = `${(d.nome || entry.cliente_nome || '').toLowerCase()}|${idioma}`;
        if (nomesThisSync.has(key)) continue;
        if (d.status_meta === 'removido_meta') continue; // já marcado
        d.status_meta = 'removido_meta';
        d.removido_em = new Date().toISOString();
        await base44.asServiceRole.entities.CampanhaLog.update(entry.id, {
          motivo_erro: JSON.stringify(d),
          status: 'pendente',
        });
        removidos++;
      }
    } catch (e) {
      console.warn('⚠️ Falha ao limpar templates obsoletos:', e?.message);
    }

    return Response.json({
      ok: true,
      total: metaTemplates.length,
      novos: salvos,
      atualizados,
      removidos,
      via: viaDapi ? 'dapi_cloud_api' : 'meta_graph_api',
      message: `${metaTemplates.length} templates sincronizados (${salvos} novos, ${atualizados} atualizados, ${removidos} removidos) via ${viaDapi ? 'D-API Cloud' : 'Meta Graph'}.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});