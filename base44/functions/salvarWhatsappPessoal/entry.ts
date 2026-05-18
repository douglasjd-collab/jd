import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json();
    const {
      colaborador_id,
      evolution_url,
      instance_name,
      api_key,
      access_token,
      phone_number_id,
      api_preferida,
    } = body;

    // Buscar colaborador do usuário autenticado
    const colabs = await base44.asServiceRole.entities.Colaborador.filter(
      { user_id: user.id, status: 'ativo' }, '-created_date', 1
    );
    const colab = colabs?.[0];

    if (!colab) {
      return Response.json({ success: false, error: 'Colaborador não encontrado' }, { status: 404 });
    }

    // Garante que só pode salvar no próprio perfil (ou admin salvando em outro)
    const idAlvo = colaborador_id || colab.id;
    const perfil = colab.perfil || '';
    const isAdmin = ['master', 'super_admin', 'admin'].includes(perfil);

    if (idAlvo !== colab.id && !isAdmin) {
      return Response.json({ success: false, error: 'Sem permissão para editar este colaborador' }, { status: 403 });
    }

    // Se admin editando outro colaborador, validar que é da mesma empresa
    if (idAlvo !== colab.id && isAdmin) {
      const colabAlvo = await base44.asServiceRole.entities.Colaborador.get(idAlvo);
      if (colabAlvo?.empresa_id !== colab.empresa_id && !['master', 'super_admin'].includes(perfil)) {
        return Response.json({ success: false, error: 'Colaborador de outra empresa' }, { status: 403 });
      }
    }

    const conectado = !!(instance_name || (access_token && phone_number_id));

    await base44.asServiceRole.entities.Colaborador.update(idAlvo, {
      whatsapp_pessoal_evolution_url: evolution_url || '',
      whatsapp_pessoal_instance_name: instance_name || '',
      whatsapp_pessoal_api_key: api_key || '',
      whatsapp_pessoal_access_token: access_token || '',
      whatsapp_pessoal_phone_number_id: phone_number_id || '',
      whatsapp_pessoal_api_preferida: api_preferida || 'auto',
      whatsapp_pessoal_conectado: conectado,
    });

    // Se tem instância Evolution, configurar webhook automaticamente
    if (instance_name && evolution_url && api_key) {
      try {
        const webhookUrl = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${encodeURIComponent(instance_name)}`;
        const baseUrl = evolution_url.replace(/\/manager\/?$/, '').replace(/\/$/, '');
        
        const resWebhook = await fetch(`${baseUrl}/webhook/set/${instance_name}`, {
          method: 'POST',
          headers: { 'apikey': api_key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: webhookUrl,
            webhook_by_events: false,
            webhook_base64: false,
            events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
          }),
        });

        const webhookData = await resWebhook.json();
        const webhookOk = resWebhook.ok || webhookData?.webhook?.url;
        
        await base44.asServiceRole.entities.Colaborador.update(idAlvo, {
          whatsapp_pessoal_webhook_configurado: webhookOk,
        });

        console.log(`✅ Webhook pessoal configurado para instância "${instance_name}" | ok: ${webhookOk}`);
        return Response.json({ success: true, webhook_configurado: webhookOk, webhook_url: webhookUrl });
      } catch (e) {
        console.warn('⚠️ Webhook não configurado automaticamente:', e.message);
        return Response.json({ success: true, webhook_configurado: false, aviso: e.message });
      }
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});