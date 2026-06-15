import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const APP_ID = '26336549645965945';
const APP_SECRET = 'ab640f4cf87eb2188702e9d469254cdd';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, empresa_id, code, redirect_uri } = body;

    // Versão dinâmica da API Meta (atualizada automaticamente pelo atualizarVersaoMetaApi)
    let metaApiVersion = 'v23.0';
    if (empresa_id) {
      try {
        const configsVersao = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({
          chave: `meta_api_versao_${empresa_id}`,
          empresa_id
        }, '-created_date', 1);
        if (configsVersao?.length > 0 && configsVersao[0].valor) {
          metaApiVersion = configsVersao[0].valor;
        }
      } catch (_) {}
    }

    if (action === 'exchange_code') {
      // 1. Trocar code por access_token
      const tokenUrl = `https://graph.facebook.com/${metaApiVersion}/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&code=${code}`;
      const tokenResp = await fetch(tokenUrl);
      const tokenData = await tokenResp.json();

      if (tokenData.error) {
        return Response.json({ error: tokenData.error.message, details: tokenData }, { status: 400 });
      }

      const userAccessToken = tokenData.access_token;

      // 2. Buscar WABA(s) vinculadas ao usuário
      const wabaListResp = await fetch(
        `https://graph.facebook.com/${metaApiVersion}/me/businesses?fields=id,name,whatsapp_business_accounts&access_token=${userAccessToken}`
      );
      const wabaListData = await wabaListResp.json();

      console.log('[metaEmbeddedSignup] businesses response:', JSON.stringify(wabaListData));

      // Coletar WABA IDs
      let wabaId = null;
      let businessId = null;

      if (wabaListData.data && wabaListData.data.length > 0) {
        businessId = wabaListData.data[0].id;
        const wabaAccounts = wabaListData.data[0].whatsapp_business_accounts?.data;
        if (wabaAccounts && wabaAccounts.length > 0) {
          wabaId = wabaAccounts[0].id;
        }
      }

      // Se não encontrou via businesses, tentar direto
      if (!wabaId) {
        const meResp = await fetch(
          `https://graph.facebook.com/${metaApiVersion}/me?fields=id,name&access_token=${userAccessToken}`
        );
        const meData = await meResp.json();
        businessId = meData.id;

        const wabaResp = await fetch(
          `https://graph.facebook.com/${metaApiVersion}/${businessId}/owned_whatsapp_business_accounts?access_token=${userAccessToken}`
        );
        const wabaData = await wabaResp.json();
        if (wabaData.data && wabaData.data.length > 0) {
          wabaId = wabaData.data[0].id;
        }
      }

      if (!wabaId) {
        return Response.json({
          error: 'Nenhuma conta WhatsApp Business encontrada. Verifique se você autorizou corretamente.',
        }, { status: 400 });
      }

      // 3. Buscar phone_number_id e detalhes do número
      const phoneResp = await fetch(
        `https://graph.facebook.com/${metaApiVersion}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status,code_verification_status&access_token=${userAccessToken}`
      );
      const phoneData = await phoneResp.json();

      console.log('[metaEmbeddedSignup] phone_numbers response:', JSON.stringify(phoneData));

      const phoneInfo = phoneData.data?.[0] || {};

      // 4. Gerar token permanente via system user (usando app token)
      const appTokenResp = await fetch(
        `https://graph.facebook.com/${metaApiVersion}/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&grant_type=client_credentials`
      );
      const appTokenData = await appTokenResp.json();
      const appAccessToken = appTokenData.access_token;

      // 5. Salvar na empresa
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id });
      const empresa = empresas[0];
      if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

      await base44.asServiceRole.entities.Empresa.update(empresa_id, {
        whatsapp_access_token: userAccessToken,
        whatsapp_business_account_id: wabaId,
        whatsapp_phone_number_id: phoneInfo.id || '',
        whatsapp_conectado: true,
        whatsapp_api_preferida: 'meta_oficial',
        whatsapp_token_tipo: 'temporario',
        whatsapp_token_atualizado_em: new Date().toISOString(),
        // Campos extras de info
        meta_business_id: businessId,
        meta_display_phone_number: phoneInfo.display_phone_number || '',
        meta_verified_name: phoneInfo.verified_name || '',
        meta_quality_rating: phoneInfo.quality_rating || '',
        meta_phone_status: phoneInfo.status || '',
      });

      return Response.json({
        ok: true,
        waba_id: wabaId,
        business_id: businessId,
        phone_number_id: phoneInfo.id,
        display_phone_number: phoneInfo.display_phone_number,
        verified_name: phoneInfo.verified_name,
        quality_rating: phoneInfo.quality_rating,
        status: phoneInfo.status,
        message: 'WhatsApp Oficial conectado com sucesso!',
      });
    }

    if (action === 'get_status') {
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id });
      const empresa = empresas[0];
      if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

      const accessToken = empresa.whatsapp_access_token;
      if (!accessToken) {
        return Response.json({ ok: true, conectado: false });
      }

      // Verificar token
      const verifyResp = await fetch(
        `https://graph.facebook.com/${metaApiVersion}/me?access_token=${accessToken}`
      );
      const verifyData = await verifyResp.json();
      const tokenValido = !verifyData.error;

      // Buscar status do número
      let numeroAtivo = false;
      let webhookAtivo = false;
      let templatesCount = 0;

      if (tokenValido && empresa.whatsapp_phone_number_id) {
        const phoneResp = await fetch(
          `https://graph.facebook.com/${metaApiVersion}/${empresa.whatsapp_phone_number_id}?fields=id,display_phone_number,verified_name,quality_rating,status&access_token=${accessToken}`
        );
        const phoneData = await phoneResp.json();
        if (!phoneData.error) {
          numeroAtivo = phoneData.status === 'CONNECTED';
          // Atualizar dados na empresa
          await base44.asServiceRole.entities.Empresa.update(empresa_id, {
            meta_display_phone_number: phoneData.display_phone_number || empresa.meta_display_phone_number,
            meta_verified_name: phoneData.verified_name || empresa.meta_verified_name,
            meta_quality_rating: phoneData.quality_rating || '',
            meta_phone_status: phoneData.status || '',
          });
        }

        // Verificar webhook
        if (empresa.whatsapp_business_account_id) {
          const whResp = await fetch(
            `https://graph.facebook.com/${metaApiVersion}/${empresa.whatsapp_business_account_id}/subscribed_apps?access_token=${accessToken}`
          );
          const whData = await whResp.json();
          webhookAtivo = (whData.data || []).length > 0;
        }

        // Contar templates
        if (empresa.whatsapp_business_account_id) {
          const tplResp = await fetch(
            `https://graph.facebook.com/${metaApiVersion}/${empresa.whatsapp_business_account_id}/message_templates?limit=1&access_token=${accessToken}`
          );
          const tplData = await tplResp.json();
          templatesCount = tplData.paging?.cursors ? (tplData.data?.length || 0) : 0;
        }
      }

      return Response.json({
        ok: true,
        conectado: empresa.whatsapp_conectado && tokenValido,
        token_valido: tokenValido,
        numero_ativo: numeroAtivo,
        webhook_ativo: webhookAtivo,
        templates_count: templatesCount,
        display_phone_number: empresa.meta_display_phone_number || '',
        verified_name: empresa.meta_verified_name || '',
        quality_rating: empresa.meta_quality_rating || '',
        phone_status: empresa.meta_phone_status || '',
        waba_id: empresa.whatsapp_business_account_id || '',
        phone_number_id: empresa.whatsapp_phone_number_id || '',
        token_atualizado_em: empresa.whatsapp_token_atualizado_em || '',
      });
    }

    if (action === 'configurar_webhook') {
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id });
      const empresa = empresas[0];
      if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

      const accessToken = empresa.whatsapp_access_token;
      const wabaId = empresa.whatsapp_business_account_id;
      if (!accessToken || !wabaId) {
        return Response.json({ error: 'Empresa sem token ou WABA ID configurado' }, { status: 400 });
      }

      // App token para configurar webhook
      const appTokenResp = await fetch(
        `https://graph.facebook.com/${metaApiVersion}/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&grant_type=client_credentials`
      );
      const appTokenData = await appTokenResp.json();
      const appAccessToken = appTokenData.access_token;

      // Configurar webhook subscription
      const webhookResp = await fetch(
        `https://graph.facebook.com/${metaApiVersion}/${wabaId}/subscribed_apps`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${appAccessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const webhookData = await webhookResp.json();

      return Response.json({ ok: true, webhook: webhookData });
    }

    if (action === 'desconectar') {
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id });
      const empresa = empresas[0];
      if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

      await base44.asServiceRole.entities.Empresa.update(empresa_id, {
        whatsapp_access_token: '',
        whatsapp_business_account_id: '',
        whatsapp_phone_number_id: '',
        whatsapp_conectado: false,
        meta_display_phone_number: '',
        meta_verified_name: '',
        meta_quality_rating: '',
        meta_phone_status: '',
      });

      return Response.json({ ok: true, message: 'WhatsApp desconectado com sucesso' });
    }

    return Response.json({ error: 'Ação não reconhecida' }, { status: 400 });
  } catch (error) {
    console.error('[metaEmbeddedSignup] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});