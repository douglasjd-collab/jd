import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'super_admin', 'master'].includes(user.perfil)) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const resultado = {
      vendaConsorcio: 0,
      venda: 0,
      vendaBase: 0,
      proposta: 0,
      detalhes: {
        vendaConsorcioCount: null,
        vendaConsorcioSample: null,
        vendaCount: null,
        vendaSample: null,
        vendaBaseCount: null,
        vendaBaseSample: null,
        propostaConsorcioCount: null
      }
    };

    // Buscar em VendaConsorcio
    try {
      const vendaConsorcio = await base44.asServiceRole.entities.VendaConsorcio.list();
      resultado.detalhes.vendaConsorcioCount = vendaConsorcio.length;
      if (vendaConsorcio.length > 0) {
        resultado.vendaConsorcio = vendaConsorcio.length;
        resultado.detalhes.vendaConsorcioSample = vendaConsorcio[0];
      }
    } catch (e) {
      resultado.detalhes.vendaConsorcioError = e.message;
    }

    // Buscar em Venda (tabela genérica antiga)
    try {
      const venda = await base44.asServiceRole.entities.Venda.list();
      resultado.detalhes.vendaCount = venda.length;
      const vendaConsorcioNaTabela = venda.filter(v => v.produto === 'CONSORCIO' || v.tipo === 'CONSORCIO');
      resultado.venda = vendaConsorcioNaTabela.length;
      if (vendaConsorcioNaTabela.length > 0) {
        resultado.detalhes.vendaSample = vendaConsorcioNaTabela[0];
      }
    } catch (e) {
      resultado.detalhes.vendaError = e.message;
    }

    // Buscar em VendaBase
    try {
      const vendaBase = await base44.asServiceRole.entities.VendaBase.list();
      resultado.detalhes.vendaBaseCount = vendaBase.length;
      const vendaConsorcioNaBase = vendaBase.filter(v => v.produto === 'CONSORCIO');
      resultado.vendaBase = vendaConsorcioNaBase.length;
      if (vendaConsorcioNaBase.length > 0) {
        resultado.detalhes.vendaBaseSample = vendaConsorcioNaBase[0];
      }
    } catch (e) {
      resultado.detalhes.vendaBaseError = e.message;
    }

    // Verificar Proposta consolidada
    try {
      const proposta = await base44.asServiceRole.entities.Proposta.list();
      const propostaConsorcio = proposta.filter(p => p.produto === 'consorcio');
      resultado.proposta = propostaConsorcio.length;
      resultado.detalhes.propostaConsorcioCount = propostaConsorcio.length;
    } catch (e) {
      resultado.detalhes.propostaError = e.message;
    }

    return Response.json({
      status: 'success',
      resultado,
      resumo: `VendaConsorcio: ${resultado.vendaConsorcio} | Venda (CONSORCIO): ${resultado.venda} | VendaBase (CONSORCIO): ${resultado.vendaBase} | Proposta (consorcio): ${resultado.proposta}`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});