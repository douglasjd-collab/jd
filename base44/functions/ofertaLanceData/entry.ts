import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Somente os campos usados na tela de Oferta de Lance. As entidades têm dezenas
// de campos: trazer o registro completo de milhares de cartas sobrecarrega o banco
// e é uma das causas de timeout na hora de gravar a oferta.
const CAMPOS_VENDA = [
  'cliente_id', 'cliente_nome', 'cliente_cpf', 'empresa_id', 'grupo', 'cota',
  'status', 'prazo', 'valorCredito', 'administradora_nome', 'vendedor_nome', 'observacao_lance',
];
const CAMPOS_PROPOSTA = [
  'cliente_id', 'cliente_nome', 'cliente_cpf', 'empresa_id', 'grupo', 'cota',
  'status', 'valor_credito', 'administradora_nome', 'vendedor_nome', 'produto',
];
const CAMPOS_OFERTA = [
  'venda_id', 'cliente_id', 'cliente_nome', 'empresa_id', 'grupo', 'cota', 'competencia',
  'percentual_lance', 'valor_lance', 'tipo_lance', 'valor_carta', 'data_oferta',
  'usuario_nome', 'observacao', 'historico_alteracoes',
];

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
    const vendasLegado = await base44.asServiceRole.entities.Venda.list({
      sort: '-created_date',
      limit: 2000,
      fields: CAMPOS_VENDA,
    });

    // Buscar propostas de consórcio da entidade Proposta (atual)
    const propostas = await base44.asServiceRole.entities.Proposta.filter(
      { produto: 'consorcio' },
      { sort: '-created_date', limit: 2000, fields: CAMPOS_PROPOSTA }
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
    const ofertas = await base44.asServiceRole.entities.OfertaLance.list({
      sort: '-data_oferta',
      limit: 2000,
      fields: CAMPOS_OFERTA,
    });

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