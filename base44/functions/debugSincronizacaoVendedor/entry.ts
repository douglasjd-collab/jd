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

    // Buscar todas as propostas de empréstimo
    const todasPropostas = await base44.asServiceRole.entities.Proposta.filter(
      { empresa_id, produto: 'emprestimo' },
      null,
      5000
    );

    console.log(`\n=== DEBUG SINCRONIZAÇÃO ===`);
    console.log(`Total propostas: ${todasPropostas.length}\n`);

    // Listar todas as propostas com seus dados
    const debug = [];
    for (const p of todasPropostas) {
      const cpfNorm = normCpf(p.cliente_cpf);
      debug.push({
        cliente: p.cliente_nome,
        cpf: p.cliente_cpf,
        cpfNorm,
        vendedorId: p.vendedor_id || 'VAZIO',
        vendedorNome: p.vendedor_nome || 'SEM VENDEDOR',
        contrato: p.contrato,
      });
      
      if (p.cliente_nome?.includes('MARIA')) {
        console.log(`>>> FOUND MARIA:`);
        console.log(`    Cliente: ${p.cliente_nome}`);
        console.log(`    CPF: ${p.cliente_cpf} (normalizado: ${cpfNorm})`);
        console.log(`    Vendedor ID: ${p.vendedor_id || 'VAZIO'}`);
        console.log(`    Vendedor Nome: ${p.vendedor_nome || 'SEM'}`);
        console.log(`    Contrato: ${p.contrato}\n`);
      }
    }

    // Agrupar por CPF normalizado
    const porCpf = {};
    for (const p of todasPropostas) {
      const cpf = normCpf(p.cliente_cpf);
      if (cpf) {
        if (!porCpf[cpf]) porCpf[cpf] = [];
        porCpf[cpf].push({
          nome: p.cliente_nome,
          vendedorId: p.vendedor_id,
          vendedorNome: p.vendedor_nome,
        });
      }
    }

    console.log(`\n=== AGRUPADO POR CPF ===`);
    for (const [cpf, propostas] of Object.entries(porCpf)) {
      if (propostas.length > 1) {
        console.log(`\nCPF: ${cpf}`);
        propostas.forEach((p, i) => {
          console.log(`  [${i + 1}] ${p.nome} - Vendedor: ${p.vendedorId || 'VAZIO'} (${p.vendedorNome || 'SEM'})`);
        });
      }
    }

    return Response.json({ success: true, debug, porCpf });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});