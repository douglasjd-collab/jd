import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const {
      empresa_id, evolution_url, evolution_instance_name, evolution_api_key,
      whatsapp_access_token, whatsapp_phone_number_id, whatsapp_business_account_id,
      whatsapp_verify_token, whatsapp_token_tipo, whatsapp_token_atualizado_em,
      whatsapp_api_preferida
    } = body;

    if (!empresa_id) {
      return Response.json({ success: false, error: 'empresa_id é obrigatório' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Não autenticado' }, { status: 401 });
    }

    // Validação: super_admin pode configurar qualquer empresa
    // Admin só pode configurar sua própria empresa
    if (user.perfil !== 'super_admin' && user.empresa_id !== empresa_id) {
      return Response.json({ success: false, error: 'Sem permissão para configurar esta empresa' }, { status: 403 });
    }

    // Usar asServiceRole para salvar
    await base44.asServiceRole.entities.Empresa.update(empresa_id, {
      evolution_url: evolution_url || '',
      evolution_instance_name: evolution_instance_name || '',
      evolution_api_key: evolution_api_key || '',
      whatsapp_access_token: whatsapp_access_token || '',
      whatsapp_phone_number_id: whatsapp_phone_number_id || '',
      whatsapp_business_account_id: whatsapp_business_account_id || '',
      whatsapp_verify_token: whatsapp_verify_token || 'WAZE_CRM_WEBHOOK_2024',
      whatsapp_token_tipo: whatsapp_token_tipo || 'permanente',
      whatsapp_token_atualizado_em: whatsapp_token_atualizado_em || new Date().toISOString(),
      whatsapp_api_preferida: whatsapp_api_preferida || 'auto',
      whatsapp_conectado: !!(evolution_instance_name || (whatsapp_access_token && whatsapp_phone_number_id)),
    });

    console.log(`✅ Config salva para empresa ${empresa_id} | instancia: ${evolution_instance_name}`);
    return Response.json({ success: true });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});