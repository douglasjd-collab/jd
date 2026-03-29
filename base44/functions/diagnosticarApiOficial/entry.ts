import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Buscar todas as empresas
    const empresas = await base44.asServiceRole.entities.Empresa.filter({}, null, 20);

    const resultado = empresas.map(e => ({
      id: e.id,
      nome: e.nome,
      tem_access_token: !!e.whatsapp_access_token,
      access_token_preview: e.whatsapp_access_token ? e.whatsapp_access_token.slice(0, 20) + '...' : null,
      tem_phone_number_id: !!e.whatsapp_phone_number_id,
      phone_number_id: e.whatsapp_phone_number_id || null,
      tem_business_account_id: !!e.whatsapp_business_account_id,
      token_tipo: e.whatsapp_token_tipo || 'não definido',
      token_atualizado_em: e.whatsapp_token_atualizado_em || null,
      webhook_verify_token: e.whatsapp_verify_token || null,
    }));

    // Testar conexão para empresa que tem credenciais
    const empresaComToken = empresas.find(e => e.whatsapp_access_token && e.whatsapp_phone_number_id);
    let testeConexao = null;

    if (empresaComToken) {
      try {
        const resp = await fetch(
          `https://graph.facebook.com/v18.0/${empresaComToken.whatsapp_phone_number_id}?fields=display_phone_number,verified_name,quality_rating,status`,
          { headers: { Authorization: `Bearer ${empresaComToken.whatsapp_access_token}` } }
        );
        const data = await resp.json();
        if (data.error) {
          testeConexao = { 
            empresa: empresaComToken.nome, 
            erro: data.error.message, 
            code: data.error.code,
            token_expirado: data.error.code === 190
          };
        } else {
          testeConexao = { empresa: empresaComToken.nome, ok: true, ...data };
        }
      } catch (e) {
        testeConexao = { empresa: empresaComToken.nome, erro: e.message };
      }
    }

    return Response.json({
      total_empresas: empresas.length,
      empresas: resultado,
      teste_conexao: testeConexao,
      diagnostico: empresaComToken 
        ? (testeConexao?.token_expirado ? '❌ TOKEN EXPIRADO - Precisa renovar' : '✅ Token válido')
        : '❌ Nenhuma empresa com credenciais configuradas'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});