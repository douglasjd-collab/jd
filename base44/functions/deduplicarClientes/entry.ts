import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = ['admin', 'gerente', 'master', 'super_admin'].includes(user.perfil || user.role);
    if (!isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const empresa_id = body.empresa_id || null;

    // Buscar todos os clientes da empresa
    const clientes = empresa_id
      ? await base44.asServiceRole.entities.Cliente.filter({ empresa_id })
      : await base44.asServiceRole.entities.Cliente.list(null, 10000);

    // Agrupar por CPF (normalizado: só dígitos)
    const grupoPorCpf = {};
    for (const c of clientes) {
      const cpf = (c.cpf || '').replace(/\D/g, '');
      if (!cpf || cpf.length < 11) continue;
      if (!grupoPorCpf[cpf]) grupoPorCpf[cpf] = [];
      grupoPorCpf[cpf].push(c);
    }

    let mesclados = 0;
    let excluidos = 0;

    for (const [cpf, grupo] of Object.entries(grupoPorCpf)) {
      if (grupo.length <= 1) continue;

      // Escolher o "principal": prefere o que tem celular/telefone, depois o mais antigo
      grupo.sort((a, b) => {
        const aTemTel = !!(a.celular || a.telefone_fixo || a.telefone);
        const bTemTel = !!(b.celular || b.telefone_fixo || b.telefone);
        if (aTemTel && !bTemTel) return -1;
        if (!aTemTel && bTemTel) return 1;
        // Mais antigo primeiro
        return new Date(a.created_date || 0) - new Date(b.created_date || 0);
      });

      const principal = grupo[0];
      const duplicados = grupo.slice(1);

      // Mesclar dados do principal com dados dos duplicados (preencher campos vazios)
      const atualizar = {};
      for (const dup of duplicados) {
        if (!principal.celular && dup.celular) atualizar.celular = dup.celular;
        if (!principal.telefone_fixo && dup.telefone_fixo) atualizar.telefone_fixo = dup.telefone_fixo;
        if (!principal.email && dup.email) atualizar.email = dup.email;
        if (!principal.data_nascimento && dup.data_nascimento) atualizar.data_nascimento = dup.data_nascimento;
        if (!principal.nome_mae && dup.nome_mae) atualizar.nome_mae = dup.nome_mae;
        if (!principal.rg && dup.rg) atualizar.rg = dup.rg;
        if (!principal.cep && dup.cep) atualizar.cep = dup.cep;
        if (!principal.logradouro && dup.logradouro) atualizar.logradouro = dup.logradouro;
        if (!principal.numero && dup.numero) atualizar.numero = dup.numero;
        if (!principal.bairro && dup.bairro) atualizar.bairro = dup.bairro;
        if (!principal.cidade && dup.cidade) atualizar.cidade = dup.cidade;
        if (!principal.estado && dup.estado) atualizar.estado = dup.estado;
      }

      if (Object.keys(atualizar).length > 0) {
        await base44.asServiceRole.entities.Cliente.update(principal.id, atualizar);
        mesclados++;
      }

      // Redirecionar propostas/vendas/tarefas do duplicado para o principal
      for (const dup of duplicados) {
        // Atualizar Propostas
        const propostas = await base44.asServiceRole.entities.Proposta.filter({ cliente_id: dup.id });
        for (const p of propostas) {
          await base44.asServiceRole.entities.Proposta.update(p.id, {
            cliente_id: principal.id,
            cliente_nome: principal.nome_completo || principal.nome || p.cliente_nome,
          });
        }

        // Atualizar Oportunidades
        const oportunidades = await base44.asServiceRole.entities.Oportunidade.filter({ cliente_id: dup.id });
        for (const o of oportunidades) {
          await base44.asServiceRole.entities.Oportunidade.update(o.id, {
            cliente_id: principal.id,
            cliente_nome: principal.nome_completo || principal.nome || o.cliente_nome,
          });
        }

        // Atualizar Tarefas
        const tarefas = await base44.asServiceRole.entities.Tarefa.filter({ cliente_id: dup.id });
        for (const t of tarefas) {
          await base44.asServiceRole.entities.Tarefa.update(t.id, {
            cliente_id: principal.id,
            cliente_nome: principal.nome_completo || principal.nome || t.cliente_nome,
          });
        }

        // Excluir duplicado
        await base44.asServiceRole.entities.Cliente.delete(dup.id);
        excluidos++;
      }
    }

    return Response.json({
      success: true,
      mesclados,
      excluidos,
      message: `${excluidos} cliente(s) duplicado(s) removido(s), ${mesclados} atualizado(s) com dados mesclados.`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});