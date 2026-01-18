import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'super_admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const empresa_id = body.empresa_id;

    if (!empresa_id) {
      return Response.json({ error: 'empresa_id é obrigatório' }, { status: 400 });
    }

    // Tabela de taxas por prazo
    const taxasPorPrazo = {
      96: 20.8,
      86: 19.8,
      76: 18.8,
      66: 16.8,
      56: 15.8,
      46: 13.8,
      36: 12.8
    };

    // Buscar planos de automóvel com valor entre 25k e 50k
    const planos = await base44.asServiceRole.entities.PlanoConsorcio.filter({
      tipo_bem: 'automovel'
    });

    let updated = 0;
    const errors = [];

    for (const plano of planos) {
      try {
        const valor = plano.valor_carta || 0;
        
        // Aplicar apenas se valor estiver entre 25k e 50k
        if (valor >= 25000 && valor <= 50000) {
          const taxa = taxasPorPrazo[plano.prazo];
          
          if (taxa !== undefined) {
            await base44.asServiceRole.entities.PlanoConsorcio.update(plano.id, {
              taxa_adm: taxa,
              tipo_bem: 'automovel'
            });
            updated++;
          }
        }
      } catch (error) {
        errors.push({
          plano_id: plano.id,
          erro: error.message
        });
      }
    }

    return Response.json({
      success: true,
      atualizado: updated,
      total_processados: planos.length,
      erros: errors
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});