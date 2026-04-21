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

    // Buscar tudo em paralelo
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

    // Mapas de registros relacionados
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

    // Helpers
    const temTelefone = (c) => !!(c.celular || c.telefone_fixo || c.telefone);
    const normCpf = (v) => (v || '').replace(/\D/g, '');
    const normNome = (v) =>
      (v || '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');

    // IDs já excluídos nesta rodada (para não tentar excluir duas vezes)
    const idsExcluidos = new Set();

    // Processar um grupo: mantém o melhor registro, exclui os demais
    const processarGrupo = async (grupo) => {
      // Filtrar IDs que já foram excluídos em passos anteriores
      const ativos = grupo.filter(c => !idsExcluidos.has(c.id));
      if (ativos.length <= 1) return 0;

      // Principal: prefere quem tem telefone, depois mais antigo
      ativos.sort((a, b) => {
        const aT = temTelefone(a);
        const bT = temTelefone(b);
        if (aT && !bT) return -1;
        if (!aT && bT) return 1;
        return new Date(a.created_date || 0) - new Date(b.created_date || 0);
      });

      const principal = ativos[0];
      const duplicados = ativos.slice(1);

      // Mesclar campos faltantes no principal
      const atualizar = {};
      for (const dup of duplicados) {
        if (!principal.celular && !atualizar.celular && dup.celular) atualizar.celular = dup.celular;
        if (!principal.telefone_fixo && !atualizar.telefone_fixo && dup.telefone_fixo) atualizar.telefone_fixo = dup.telefone_fixo;
        if (!principal.email && !atualizar.email && dup.email) atualizar.email = dup.email;
        if (!principal.cpf && !atualizar.cpf && dup.cpf) atualizar.cpf = normCpf(dup.cpf);
        if (!principal.data_nascimento && !atualizar.data_nascimento && dup.data_nascimento) atualizar.data_nascimento = dup.data_nascimento;
        if (!principal.nome_mae && !atualizar.nome_mae && dup.nome_mae) atualizar.nome_mae = dup.nome_mae;
        if (!principal.rg && !atualizar.rg && dup.rg) atualizar.rg = dup.rg;
        if (!principal.res_cep && !atualizar.res_cep && dup.res_cep) atualizar.res_cep = dup.res_cep;
        if (!principal.res_endereco && !atualizar.res_endereco && dup.res_endereco) atualizar.res_endereco = dup.res_endereco;
        if (!principal.res_cidade && !atualizar.res_cidade && dup.res_cidade) atualizar.res_cidade = dup.res_cidade;
        if (!principal.res_uf && !atualizar.res_uf && dup.res_uf) atualizar.res_uf = dup.res_uf;
      }

      if (Object.keys(atualizar).length > 0) {
        await base44.asServiceRole.entities.Cliente.update(principal.id, atualizar);
      }

      let excluidos = 0;
      for (const dup of duplicados) {
        if (idsExcluidos.has(dup.id)) continue;
        const nomeP = principal.nome_completo || principal.pj_razao_social || principal.nome;

        for (const p of propostasPorCliente[dup.id] || []) {
          await base44.asServiceRole.entities.Proposta.update(p.id, { cliente_id: principal.id, cliente_nome: nomeP || p.cliente_nome });
        }
        for (const o of oportunidadesPorCliente[dup.id] || []) {
          await base44.asServiceRole.entities.Oportunidade.update(o.id, { cliente_id: principal.id, cliente_nome: nomeP || o.cliente_nome });
        }
        for (const t of tarefasPorCliente[dup.id] || []) {
          await base44.asServiceRole.entities.Tarefa.update(t.id, { cliente_id: principal.id, cliente_nome: nomeP || t.cliente_nome });
        }

        await base44.asServiceRole.entities.Cliente.delete(dup.id);
        idsExcluidos.add(dup.id);
        excluidos++;
      }

      return excluidos;
    };

    let excluidos = 0;

    // ── PASSO 1: Deduplicar por CPF válido ──
    const grupoPorCpf = {};
    for (const c of clientes) {
      if (c.tipo_pessoa === 'Jurídica') continue;
      const cpf = normCpf(c.cpf);
      if (!cpf || cpf.length < 11) continue;
      const chave = `${c.empresa_id || ''}::${cpf}`;
      if (!grupoPorCpf[chave]) grupoPorCpf[chave] = [];
      grupoPorCpf[chave].push(c);
    }
    for (const grupo of Object.values(grupoPorCpf)) {
      excluidos += await processarGrupo(grupo);
    }

    // ── PASSO 2: Deduplicar por CNPJ válido ──
    const grupoPorCnpj = {};
    for (const c of clientes) {
      if (c.tipo_pessoa !== 'Jurídica') continue;
      const cnpj = normCpf(c.pj_cnpj);
      if (!cnpj || cnpj.length < 14) continue;
      const chave = `${c.empresa_id || ''}::${cnpj}`;
      if (!grupoPorCnpj[chave]) grupoPorCnpj[chave] = [];
      grupoPorCnpj[chave].push(c);
    }
    for (const grupo of Object.values(grupoPorCnpj)) {
      excluidos += await processarGrupo(grupo);
    }

    // ── PASSO 3: Deduplicar por Nome normalizado (TODOS os clientes, inclusive os com CPF) ──
    // Agrupa por empresa + nome exato normalizado
    const grupoPorNome = {};
    for (const c of clientes) {
      if (idsExcluidos.has(c.id)) continue; // já foi excluído no passo anterior
      const nome = normNome(c.nome_completo || c.pj_razao_social || c.nome || '');
      if (!nome || nome.length < 3) continue;
      const chave = `${c.empresa_id || ''}::${nome}`;
      if (!grupoPorNome[chave]) grupoPorNome[chave] = [];
      grupoPorNome[chave].push(c);
    }
    for (const grupo of Object.values(grupoPorNome)) {
      excluidos += await processarGrupo(grupo);
    }

    return Response.json({
      success: true,
      excluidos,
      message: `${excluidos} cliente(s) duplicado(s) removido(s). Dados mesclados no registro principal.`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});