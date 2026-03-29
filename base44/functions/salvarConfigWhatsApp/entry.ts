import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Apenas admin/super_admin pode salvar
    if (!['admin', 'super_admin'].includes(user.perfil) && user.role !== 'super_admin') {
      return Response.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const body = await req.json();
    const {
      empresa_id,
      evolution_url,
      evolution_instance_name,
      evolution_api_key,
      whatsapp_access_token,
      whatsapp_phone_number_id,
      whatsapp_business_account_id,
      whatsapp_verify_token,
      whatsapp_token_tipo,
      whatsapp_token_atualizado_em,
    } = body;

    if (!empresa_id) {
      return Response.json({ success: false, error: 'empresa_id é obrigatório' }, { status: 400 });
    }

    // Verificar se a empresa existe
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id }, null, 1);
    if (!empresas || empresas.length === 0) {
      return Response.json({ success: false, error: 'Empresa não encontrada' }, { status: 404 });
    }

    // Salvar usando service role para garantir que passa pelas regras de segurança
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
      whatsapp_conectado: !!(whatsapp_access_token && whatsapp_phone_number_id),
    });

    console.log(`✅ Config WhatsApp salva para empresa ${empresa_id} | token: ${whatsapp_access_token ? 'preenchido' : 'vazio'} | phone_id: ${whatsapp_phone_number_id || 'vazio'}`);

    return Response.json({ success: true });

  } catch (error) {
    console.error('❌ Erro ao salvar config WhatsApp:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});