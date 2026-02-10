import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin' && user.perfil !== 'admin' && user.perfil !== 'super_admin') {
      return Response.json({ error: 'Apenas administradores podem editar' }, { status: 403 });
    }

    const { evolutionUrl, instanceName, apiKey } = await req.json();

    if (!evolutionUrl || !instanceName || !apiKey) {
      return Response.json({ error: 'Todos os campos são obrigatórios' }, { status: 400 });
    }

    // Usar serviço de secrets do Base44 para atualizar
    // Por enquanto, apenas retorna sucesso (você pode implementar atualização de secrets via dashboard)
    console.log('Configurações WhatsApp atualizadas:', {
      evolutionUrl,
      instanceName,
      apiKey: '***'
    });

    return Response.json({ 
      success: true,
      message: 'Para aplicar as mudanças, atualize os secrets no dashboard do Base44'
    });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});