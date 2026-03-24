import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || (user.role !== 'admin' && user.perfil !== 'admin' && user.perfil !== 'super_admin')) {
      return Response.json({ error: 'Apenas administradores podem editar' }, { status: 403 });
    }

    const { evolutionUrl, instanceName, apiKey } = await req.json();

    if (!evolutionUrl || !instanceName || !apiKey) {
      return Response.json({ error: 'Todos os campos são obrigatórios' }, { status: 400 });
    }

    // Salvar configurações na entidade ConfiguracaoSistema
    const existente = await base44.asServiceRole.entities.ConfiguracaoSistema.filter(
      { chave: 'whatsapp_config' }
    );

    if (existente && existente.length > 0) {
      // Atualizar
      await base44.asServiceRole.entities.ConfiguracaoSistema.update(
        existente[0].id,
        {
          valor: JSON.stringify({
            evolutionUrl,
            instanceName,
            apiKey
          })
        }
      );
    } else {
      // Criar nova
      await base44.asServiceRole.entities.ConfiguracaoSistema.create({
        chave: 'whatsapp_config',
        valor: JSON.stringify({
          evolutionUrl,
          instanceName,
          apiKey
        })
      });
    }

    console.log('✅ Configurações WhatsApp salvas:', {
      evolutionUrl,
      instanceName,
      apiKey: apiKey.substring(0, 5) + '...'
    });

    return Response.json({ 
      success: true,
      message: 'Configurações salvas com sucesso!'
    });
  } catch (error) {
    console.error('❌ Erro ao salvar:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});