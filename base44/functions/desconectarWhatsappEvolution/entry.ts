import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { instance_name = 'JDPROMOTORA' } = await req.json();

    const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return Response.json({
        success: false,
        error: 'Variáveis de ambiente não configuradas'
      }, { status: 500 });
    }

    console.log(`🔌 Desconectando WhatsApp da instância: ${instance_name}`);

    // Chamar endpoint de logout da Evolution API
    const logoutResponse = await fetch(
      `${EVOLUTION_API_URL}/instance/logout/${instance_name}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': EVOLUTION_API_KEY
        }
      }
    );

    const result = await logoutResponse.json();

    if (logoutResponse.status === 200 || logoutResponse.status === 201) {
      console.log(`✅ WhatsApp desconectado com sucesso: ${instance_name}`);
      return Response.json({
        success: true,
        message: '✅ WhatsApp desconectado com sucesso',
        instance: instance_name,
        resultado: result
      });
    } else {
      console.log(`❌ Erro ao desconectar: ${logoutResponse.status}`, result);
      return Response.json({
        success: false,
        error: result?.message || 'Falha ao desconectar WhatsApp',
        status_code: logoutResponse.status,
        detalhes: result
      }, { status: logoutResponse.status });
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ 
      success: false,
      error: error.message,
      dica: 'Erro ao desconectar WhatsApp'
    }, { status: 500 });
  }
});