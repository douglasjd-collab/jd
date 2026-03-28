import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

    // Mapear CPF → vendedor_id/nome (das propostas que TÊM vendedor)
    const cpfVendedorMap = {};
    for (const p of todasPropostas) {
      const cpf = String(p.cliente_cpf || '').replace(/\D/g, '');
      if (cpf && p.vendedor_id && p.vendedor_nome) {
        cpfVendedorMap[cpf] = { vendedor_id: p.vendedor_id, vendedor_nome: p.vendedor_nome };
      }
    }

    console.log(`Mapa de CPF → Vendedor: ${Object.keys(cpfVendedorMap).length} CPFs mapeados`);

    // Vincular vendedor nas propostas SEM vendedor que encontrem CPF no mapa
    let vinculadas = 0;
    const updates = [];

    for (const p of todasPropostas) {
      const cpf = String(p.cliente_cpf || '').replace(/\D/g, '');
      
      // Pular se não tem CPF ou já tem vendedor
      if (!cpf || p.vendedor_id) continue;
      
      // Pular se o CPF não está no mapa
      const vInfo = cpfVendedorMap[cpf];
      if (!vInfo) continue;

      updates.push({
        id: p.id,
        vendedor_id: vInfo.vendedor_id,
        vendedor_nome: vInfo.vendedor_nome,
      });
      vinculadas++;
    }

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
    }

    return Response.json({ success: true, vinculadas });
  } catch (error) {
    console.error('Erro na sincronização:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});