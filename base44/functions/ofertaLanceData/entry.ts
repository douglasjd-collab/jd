import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { competencia } = body;

    // Buscar vendas da entidade Venda (legado)
    const vendasLegado = await base44.asServiceRole.entities.Venda.list('-created_date', 2000);

    // Buscar propostas de consórcio da entidade Proposta (atual)
    const propostas = await base44.asServiceRole.entities.Proposta.filter(
      { produto: 'consorcio' },
      '-created_date',
      2000
    );

    // Normalizar propostas para o mesmo formato das vendas legadas
    const propostasNormalizadas = propostas.map(p => ({
      ...p,
      valorCredito: p.valor_credito || p.valorCredito || 0,
      cliente_cpf: p.cliente_cpf || '',
      administradora_nome: p.administradora_nome || '',
      vendedor_nome: p.vendedor_nome || '',
    }));

    // Combinar: evitar duplicatas usando id único
    const idsLegado = new Set(vendasLegado.map(v => v.id));
    const propostasUnicas = propostasNormalizadas.filter(p => !idsLegado.has(p.id));
    const vendas = [...vendasLegado, ...propostasUnicas];

    // Buscar TODAS as ofertas (não filtra por competência) — as ofertas devem persistir
    // ao virar o mês. O frontend separa por competência para determinar pendentes.
    const ofertas = await base44.asServiceRole.entities.OfertaLance.list('-data_oferta', 2000);

    // Enriquecer ofertas com dados da venda
    const ofertasEnriquecidas = ofertas.map(oferta => {
      const venda = vendas.find(v => v.id === oferta.venda_id);
      return {
        ...oferta,
        administradora_nome: venda?.administradora_nome || oferta.administradora_nome || '-'
      };
    });

    return Response.json({
      vendas,
      ofertas: ofertasEnriquecidas,
      debug: {
        total_vendas_legado: vendasLegado.length,
        total_propostas_consorcio: propostasNormalizadas.length,
        total_combinado: vendas.length,
        total_ofertas: ofertasEnriquecidas.length,
        competencia,
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});