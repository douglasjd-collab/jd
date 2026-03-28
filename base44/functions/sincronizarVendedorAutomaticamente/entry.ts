import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const normCpf = (cpf) => String(cpf || '').replace(/\D/g, '');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json();
    const { empresa_id } = body;

    if (!empresa_id) {
      return Response.json({ error: 'empresa_id é obrigatório' }, { status: 400 });
    }

    // Buscar todas as propostas de empréstimo da empresa
    const todasPropostas = await base44.asServiceRole.entities.Proposta.filter(
      { empresa_id, produto: 'emprestimo' },
      null,
      5000
    );

    console.log(`Total de propostas na empresa: ${todasPropostas.length}`);

    // Mapear CPF → vendedor_id/nome (das propostas que TÊM vendedor)
    const cpfVendedorMap = {};
    let comVendedor = 0;

    for (const p of todasPropostas) {
      const cpf = normCpf(p.cliente_cpf);
      if (cpf && p.vendedor_id) {
        cpfVendedorMap[cpf] = { vendedor_id: p.vendedor_id, vendedor_nome: p.vendedor_nome };
        comVendedor++;
      }
    }

    console.log(`Propostas com vendedor: ${comVendedor}`);
    console.log(`CPFs únicos com vendedor: ${Object.keys(cpfVendedorMap).length}`);
    console.log(`Mapa: ${JSON.stringify(Object.keys(cpfVendedorMap).slice(0, 5))}`);

    // Sincronizar propostas SEM vendedor com as que TÊM vendedor (por CPF)
    let vinculadas = 0;
    const updates = [];

    for (const p of todasPropostas) {
      // Pular se já tem vendedor
      if (p.vendedor_id) continue;

      const cpf = normCpf(p.cliente_cpf);
      if (!cpf) continue;

      const vInfo = cpfVendedorMap[cpf];
      if (!vInfo) continue;

      updates.push({
        id: p.id,
        vendedor_id: vInfo.vendedor_id,
        vendedor_nome: vInfo.vendedor_nome,
      });
      vinculadas++;

      console.log(`Vinculando ${p.cliente_nome} (CPF: ${cpf}) → ${vInfo.vendedor_nome}`);
    }

    console.log(`Total a sincronizar: ${vinculadas}`);

    // Executar todos os updates em paralelo
    if (updates.length > 0) {
      await Promise.all(
        updates.map(u =>
          base44.asServiceRole.entities.Proposta.update(u.id, {
            vendedor_id: u.vendedor_id,
            vendedor_nome: u.vendedor_nome,
          })
        )
      );
      console.log(`✅ ${vinculadas} proposta(s) sincronizada(s) com sucesso`);
    } else {
      console.log('⚠️ Nenhuma proposta encontrada para sincronizar');
    }

    return Response.json({ success: true, vinculadas, debugInfo: { comVendedor, cpfsUnicos: Object.keys(cpfVendedorMap).length } });
  } catch (error) {
    console.error('Erro na sincronização:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});