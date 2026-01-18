import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Permitir super_admin, admin e gerente
    const userRole = user.perfil || user.role;
    if (!['super_admin', 'master', 'admin', 'gerente'].includes(userRole)) {
      return Response.json({ error: 'Forbidden: Requires admin or manager access' }, { status: 403 });
    }

    // Mapa de taxas por prazo
    const taxasPorPrazo = {
      96: 20.8,
      86: 19.8,
      76: 18.8,
      66: 16.8,
      56: 15.8,
      46: 13.8,
      36: 12.8
    };

    // Buscar todos os planos de automóvel
    const planos = await base44.asServiceRole.entities.PlanoConsorcio.filter({
      tipo_bem: 'automovel'
    });

    let atualizados = 0;
    const erros = [];

    // Aplicar taxas nos planos que atendem aos critérios
    for (const plano of planos) {
      const valor = plano.valor_carta || 0;
      const prazo = plano.prazo;

      // Verificar se está entre 25k e 50k
      if (valor >= 25000 && valor <= 50000 && taxasPorPrazo[prazo]) {
        const taxa = taxasPorPrazo[prazo];
        
        try {
          await base44.asServiceRole.entities.PlanoConsorcio.update(plano.id, {
            taxa_adm: taxa
          });
          atualizados++;
        } catch (e) {
          erros.push({
            planoId: plano.id,
            prazo: prazo,
            valor: valor,
            erro: e.message
          });
        }
      }
    }

    return Response.json({
      sucesso: true,
      atualizados,
      total: planos.length,
      erros
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
});