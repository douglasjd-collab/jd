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

    // Buscar perfil do colaborador para verificar permissão
    const colabs = await base44.asServiceRole.entities.Colaborador.filter(
      { user_id: user.id, status: 'ativo' }, '-created_date', 1
    );
    const perfil = colabs?.[0]?.perfil || user.perfil || '';
    const empresaDoColab = colabs?.[0]?.empresa_id || user.empresa_id || '';

    const isSuper = user.role === 'admin' || ['super_admin', 'master'].includes(perfil);
    const isAdminDaEmpresa = ['admin'].includes(perfil) && empresaDoColab === empresa_id;

    if (!isSuper && !isAdminDaEmpresa) {
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
    
    // 🔥 LOG: URL do webhook gerada
    const webhookUrlGerada = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${encodeURIComponent(evolution_instance_name || '')}`;
    console.log(`🔗 URL do webhook gerada: ${webhookUrlGerada}`);
    console.log(`📋 URL base fixa: https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp`);
    console.log(`🏷️ Parâmetro instance: ${evolution_instance_name || 'NENHUM'}`);
    
    return Response.json({ 
      success: true,
      webhook_url: webhookUrlGerada,
      message: 'Configurações salvas. URL do webhook gerada automaticamente.'
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});