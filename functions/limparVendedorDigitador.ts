import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Limpa o vendedor_id/vendedor_nome das propostas onde o "vendedor" é na verdade
// um digitador (funcionario) sem vendedor vinculado.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });
    if (!['admin', 'super_admin', 'master'].includes(user.perfil || user.role)) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await req.json();
    const { empresa_id, vendedor_nome } = body;

    if (!empresa_id || !vendedor_nome) {
      return Response.json({ error: 'empresa_id e vendedor_nome são obrigatórios' }, { status: 400 });
    }

    // Buscar o colaborador pelo nome
    const colaboradores = await base44.asServiceRole.entities.Colaborador.filter({ empresa_id, status: 'ativo' });
    const normStr = s => String(s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    const digitador = colaboradores.find(c => normStr(c.nome) === normStr(vendedor_nome));
    
    if (!digitador) {
      return Response.json({ error: `Colaborador "${vendedor_nome}" não encontrado` }, { status: 404 });
    }

    // Verificar se realmente não tem vendedor vinculado
    if (digitador.vendedor_vinculado_id) {
      return Response.json({ 
        error: `"${vendedor_nome}" possui vendedor vinculado (${digitador.vendedor_vinculado_id}). Use a função de reimportação.` 
      }, { status: 400 });
    }

    // Buscar propostas com esse colaborador como vendedor
    const propostas = await base44.asServiceRole.entities.Proposta.filter({
      empresa_id,
      produto: 'emprestimo',
      vendedor_id: digitador.id,
    });

    // Também buscar por vendedor_nome caso vendedor_id seja diferente
    const propostasPorNome = await base44.asServiceRole.entities.Proposta.filter({
      empresa_id,
      produto: 'emprestimo',
    });

    const todasParaLimpar = [
      ...propostas,
      ...propostasPorNome.filter(p => 
        normStr(p.vendedor_nome) === normStr(vendedor_nome) && 
        !propostas.find(x => x.id === p.id)
      )
    ];

    let atualizadas = 0;
    for (const p of todasParaLimpar) {
      await base44.asServiceRole.entities.Proposta.update(p.id, {
        vendedor_id: null,
        vendedor_nome: null,
      });
      atualizadas++;
    }

    return Response.json({
      success: true,
      atualizadas,
      mensagem: `${atualizadas} proposta(s) de "${vendedor_nome}" tiveram o vendedor removido com sucesso.`
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});