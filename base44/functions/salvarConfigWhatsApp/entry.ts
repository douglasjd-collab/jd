import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  // Ler o body ANTES de criar o cliente (evita conflito de stream)
  let body = {};
  try {
    body = await req.json();
  } catch (_) {
    return Response.json({ success: false, error: 'Body inválido' }, { status: 400 });
  }

  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Verificar perfil: super_admin tem role direto, outros precisam checar Colaborador
    let perfilEfetivo = user.role;
    if (user.role !== 'super_admin') {
      const colabs = await base44.asServiceRole.entities.Colaborador.filter({ user_id: user.id, status: 'ativo' }, null, 1);
      perfilEfetivo = colabs?.[0]?.perfil || user.role;
    }

    if (!['admin', 'super_admin', 'master'].includes(perfilEfetivo)) {
      return Response.json({ error: 'Sem permissão' }, { status: 403 });
    }

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
      whatsapp_api_preferida,
    } = body;

    if (!empresa_id) {
      return Response.json({ success: false, error: 'empresa_id é obrigatório' }, { status: 400 });
    }

    // Verificar se a empresa existe
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id }, null, 1);
    if (!empresas || empresas.length === 0) {
      return Response.json({ success: false, error: 'Empresa não encontrada' }, { status: 404 });
    }

    // Salvar usando service role
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

    console.log(`✅ Config WhatsApp salva para empresa ${empresa_id} | instancia: ${evolution_instance_name || 'vazia'}`);

    return Response.json({ success: true });

  } catch (error) {
    console.error('❌ Erro ao salvar config WhatsApp:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});