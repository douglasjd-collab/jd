import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verifica se é admin ou gerente
    if (!['admin', 'gerente', 'master', 'super_admin'].includes(user.perfil)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const CHAVE = 'PROTOCOLO_RECEBIMENTO';
    const PREFIX = 'RCB';

    // Busca ou cria o contador (usando service role para garantir acesso)
    const counters = await base44.asServiceRole.entities.Contador.filter({ chave: CHAVE });

    let nextVal;
    if (!counters || counters.length === 0) {
      // Cria o primeiro contador
      const created = await base44.asServiceRole.entities.Contador.create({
        chave: CHAVE,
        valor: 1
      });
      nextVal = 1;
    } else {
      // Incrementa o contador existente
      const counter = counters[0];
      nextVal = (counter.valor || 0) + 1;
      await base44.asServiceRole.entities.Contador.update(counter.id, {
        valor: nextVal
      });
    }

    const protocolo = `${PREFIX}${String(nextVal).padStart(6, '0')}`;

    return Response.json({ protocolo, numero: nextVal });

  } catch (error) {
    console.error('Erro ao gerar protocolo:', error);
    return Response.json({ 
      error: 'Erro ao gerar protocolo',
      details: error.message 
    }, { status: 500 });
  }
});