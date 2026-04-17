import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    // Ler o body uma vez
    const body = await req.json();
    const { empresa_id, evolution_url, evolution_instance_name, evolution_api_key,
      whatsapp_access_token, whatsapp_phone_number_id, whatsapp_business_account_id,
      whatsapp_verify_token, whatsapp_token_tipo, whatsapp_token_atualizado_em,
      whatsapp_api_preferida } = body;

    if (!empresa_id) {
      return Response.json({ success: false, error: 'empresa_id é obrigatório' }, { status: 400 });
    }

    // Criar cliente base44 — o SDK lê o token do header Authorization (não do body)
    const base44 = createClientFromRequest(req);

    // Autenticar usuário
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Verificar perfil: buscar todos os Colaboradores do usuário e priorizar o da empresa alvo
    let perfilEfetivo = user.role;
    if (user.role !== 'super_admin') {
      const colabs = await base44.asServiceRole.entities.Colaborador.filter(
        { user_id: user.id, status: 'ativo' }, null, 20
      );
      // Priorizar Colaborador da empresa alvo
      const colabEmpresa = colabs?.find(c => c.empresa_id === empresa_id);
      const colabAdmin = colabs?.find(c => ['admin', 'master', 'super_admin'].includes(c.perfil));
      const colab = colabEmpresa || colabAdmin || colabs?.[0];
      perfilEfetivo = colab?.perfil || user.role;
      console.log(`🔍 Colabs: ${colabs?.length} | empresa_id alvo: ${empresa_id} | colabEmpresa: ${colabEmpresa?.perfil} | perfil usado: ${perfilEfetivo}`);
    }

    console.log(`👤 User: ${user.email} | role: ${user.role} | perfilEfetivo: ${perfilEfetivo}`);

    if (!['admin', 'super_admin', 'master'].includes(perfilEfetivo)) {
      return Response.json({ error: 'Sem permissão' }, { status: 403 });
    }

    // Salvar usando service role (bypass de RLS)
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