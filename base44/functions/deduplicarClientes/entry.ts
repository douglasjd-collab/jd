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

    // Buscar tudo em paralelo de uma vez
    const [clientes, propostas, oportunidades, tarefas] = await Promise.all([
      empresa_id
        ? base44.asServiceRole.entities.Cliente.filter({ empresa_id }, null, 10000)
        : base44.asServiceRole.entities.Cliente.list(null, 10000),
      empresa_id
        ? base44.asServiceRole.entities.Proposta.filter({ empresa_id }, null, 10000)
        : base44.asServiceRole.entities.Proposta.list(null, 10000),
      empresa_id
        ? base44.asServiceRole.entities.Oportunidade.filter({ empresa_id }, null, 5000)
        : base44.asServiceRole.entities.Oportunidade.list(null, 5000),
      empresa_id
        ? base44.asServiceRole.entities.Tarefa.filter({ empresa_id }, null, 5000)
        : base44.asServiceRole.entities.Tarefa.list(null, 5000),
    ]);

    // Agrupar por CPF normalizado
    const grupoPorCpf = {};
    for (const c of clientes) {
      const cpf = (c.cpf || '').replace(/\D/g, '');
      if (!cpf || cpf.length < 11) continue;
      if (!grupoPorCpf[cpf]) grupoPorCpf[cpf] = [];
      grupoPorCpf[cpf].push(c);
    }

    // Montar mapas em memória para evitar queries extras
    const propostasPorCliente = {};
    for (const p of propostas) {
      if (!p.cliente_id) continue;
      if (!propostasPorCliente[p.cliente_id]) propostasPorCliente[p.cliente_id] = [];
      propostasPorCliente[p.cliente_id].push(p);
    }
    const oportunidadesPorCliente = {};
    for (const o of oportunidades) {
      if (!o.cliente_id) continue;
      if (!oportunidadesPorCliente[o.cliente_id]) oportunidadesPorCliente[o.cliente_id] = [];
      oportunidadesPorCliente[o.cliente_id].push(o);
    }
    const tarefasPorCliente = {};
    for (const t of tarefas) {
      if (!t.cliente_id) continue;
      if (!tarefasPorCliente[t.cliente_id]) tarefasPorCliente[t.cliente_id] = [];
      tarefasPorCliente[t.cliente_id].push(t);
    }

    let mesclados = 0;
    let excluidos = 0;

    for (const [, grupo] of Object.entries(grupoPorCpf)) {
      if (grupo.length <= 1) continue;

      // Principal: prefere quem tem telefone, depois mais antigo
      grupo.sort((a, b) => {
        const aTemTel = !!(a.celular || a.telefone_fixo || a.telefone);
        const bTemTel = !!(b.celular || b.telefone_fixo || b.telefone);
        if (aTemTel && !bTemTel) return -1;
        if (!aTemTel && bTemTel) return 1;
        return new Date(a.created_date || 0) - new Date(b.created_date || 0);
      });

      const principal = grupo[0];
      const duplicados = grupo.slice(1);

      // Mesclar campos vazios do principal com dados dos duplicados
      const atualizar = {};
      for (const dup of duplicados) {
        if (!principal.celular && !atualizar.celular && dup.celular) atualizar.celular = dup.celular;
        if (!principal.telefone_fixo && !atualizar.telefone_fixo && dup.telefone_fixo) atualizar.telefone_fixo = dup.telefone_fixo;
        if (!principal.email && !atualizar.email && dup.email) atualizar.email = dup.email;
        if (!principal.data_nascimento && !atualizar.data_nascimento && dup.data_nascimento) atualizar.data_nascimento = dup.data_nascimento;
        if (!principal.nome_mae && !atualizar.nome_mae && dup.nome_mae) atualizar.nome_mae = dup.nome_mae;
        if (!principal.rg && !atualizar.rg && dup.rg) atualizar.rg = dup.rg;
        if (!principal.cep && !atualizar.cep && dup.cep) atualizar.cep = dup.cep;
        if (!principal.logradouro && !atualizar.logradouro && dup.logradouro) atualizar.logradouro = dup.logradouro;
        if (!principal.cidade && !atualizar.cidade && dup.cidade) atualizar.cidade = dup.cidade;
        if (!principal.estado && !atualizar.estado && dup.estado) atualizar.estado = dup.estado;
      }

      if (Object.keys(atualizar).length > 0) {
        await base44.asServiceRole.entities.Cliente.update(principal.id, atualizar);
        mesclados++;
      }

      // Reatribuir registros e excluir duplicados
      for (const dup of duplicados) {
        const nomeP = principal.nome_completo || principal.nome;

        // Propostas
        const props = propostasPorCliente[dup.id] || [];
        for (const p of props) {
          await base44.asServiceRole.entities.Proposta.update(p.id, {
            cliente_id: principal.id,
            cliente_nome: nomeP || p.cliente_nome,
          });
        }

        // Oportunidades
        const ops = oportunidadesPorCliente[dup.id] || [];
        for (const o of ops) {
          await base44.asServiceRole.entities.Oportunidade.update(o.id, {
            cliente_id: principal.id,
            cliente_nome: nomeP || o.cliente_nome,
          });
        }

        // Tarefas
        const tars = tarefasPorCliente[dup.id] || [];
        for (const t of tars) {
          await base44.asServiceRole.entities.Tarefa.update(t.id, {
            cliente_id: principal.id,
            cliente_nome: nomeP || t.cliente_nome,
          });
        }

        await base44.asServiceRole.entities.Cliente.delete(dup.id);
        excluidos++;
      }
    }

    return Response.json({
      success: true,
      mesclados,
      excluidos,
      message: `${excluidos} cliente(s) duplicado(s) removido(s), ${mesclados} registro(s) atualizado(s) com dados mesclados.`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});