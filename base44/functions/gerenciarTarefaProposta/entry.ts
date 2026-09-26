import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Status de tarefa considerados encerrados
const STATUS_TAREFA_ENCERRADA = ['concluido', 'arquivado'];

// Fallback textual quando a proposta não possui status configurado com funcao_fluxo = 'finalizado'
const REGEX_FINALIZADO = /(^|\W)(pago|paga|finalizado|finalizada|concluido|concluida|quitado|quitada)(\W|$)/;

const normalizar = (v) =>
  (v || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const brl = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { proposta_id } = await req.json();
    if (!proposta_id) return Response.json({ error: 'proposta_id é obrigatório' }, { status: 400 });

    const [proposta] = await base44.asServiceRole.entities.Proposta.filter({ id: proposta_id });
    if (!proposta) return Response.json({ error: 'Proposta não encontrada' }, { status: 404 });

    const isAdminGlobal = ['master', 'super_admin'].includes(user.perfil) || user.role === 'admin';
    if (!isAdminGlobal && proposta.empresa_id !== user.empresa_id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // A operação está finalizada? (status configurado com funcao_fluxo = 'finalizado' ou texto de status)
    let finalizada = false;
    if (proposta.status_id) {
      const [statusProposta] = await base44.asServiceRole.entities.StatusProposta.filter({
        id: proposta.status_id,
      });
      if (statusProposta?.funcao_fluxo === 'finalizado') finalizada = true;
    }
    if (!finalizada) {
      finalizada = REGEX_FINALIZADO.test(normalizar(proposta.status));
    }

    const tarefas = await base44.asServiceRole.entities.Tarefa.filter({ proposta_id: proposta.id });
    const abertas = tarefas.filter((t) => !STATUS_TAREFA_ENCERRADA.includes(t.status));
    const hoje = new Date().toISOString().slice(0, 10);

    // Operação finalizada → finaliza também as tarefas de acompanhamento da proposta
    if (finalizada) {
      for (const tarefa of abertas) {
        await base44.asServiceRole.entities.Tarefa.update(tarefa.id, {
          status: 'concluido',
          data_conclusao_real: hoje,
          concluida_por_id: user.id,
          concluida_por_nome: user.full_name || user.email || 'Sistema',
        });
      }
      return Response.json({
        success: true,
        finalizada: true,
        tarefas_concluidas: abertas.length,
      });
    }

    // Já existe tarefa de acompanhamento para esta proposta → não duplica
    if (tarefas.length > 0) {
      return Response.json({ success: true, finalizada: false, tarefa_id: tarefas[0].id, criada: false });
    }

    const [cliente] = proposta.cliente_id
      ? await base44.asServiceRole.entities.Cliente.filter({ id: proposta.cliente_id })
      : [null];

    let tipoNome = '';
    if (proposta.emprestimo_tipo) {
      const tipos = await base44.asServiceRole.entities.TipoEmprestimo.filter({
        empresa_id: proposta.empresa_id,
      });
      const tipo = tipos.find(
        (t) =>
          t.slug === proposta.emprestimo_tipo ||
          normalizar(t.slug) === normalizar(proposta.emprestimo_tipo)
      );
      tipoNome = tipo?.nome || proposta.emprestimo_tipo;
    }
    const tipoLabel = tipoNome || 'Empréstimo';

    const setores = await base44.asServiceRole.entities.SetorTarefa.filter({
      empresa_id: proposta.empresa_id,
      status: 'ativo',
    });
    const setor =
      setores.find((s) => normalizar(s.nome) === 'emprestimos') ||
      setores.find((s) => normalizar(s.nome).includes('emprestimo'));

    const previsao = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const descricao = [
      `Acompanhamento das pendências da proposta de empréstimo (${tipoLabel}).`,
      proposta.administradora_nome ? `Banco: ${proposta.administradora_nome}` : null,
      proposta.contrato ? `Contrato: ${proposta.contrato}` : null,
      `Valor bruto: R$ ${brl(proposta.valor_credito)}`,
      `Valor liberado: R$ ${brl(proposta.valor_liquido)}`,
      proposta.emprestimo_numero_beneficio ? `Benefício: ${proposta.emprestimo_numero_beneficio}` : null,
      proposta.vendedor_nome ? `Vendedor: ${proposta.vendedor_nome}` : null,
      `Status atual: ${proposta.status || 'não informado'}`,
      'Esta tarefa é finalizada automaticamente quando a proposta for finalizada.',
    ]
      .filter(Boolean)
      .join('\n');

    const tarefa = await base44.asServiceRole.entities.Tarefa.create({
      empresa_id: proposta.empresa_id,
      titulo: `${tipoLabel}${proposta.contrato ? ' ' + proposta.contrato : ''} - ${proposta.cliente_nome || 'Cliente'}`,
      descricao,
      cliente_id: proposta.cliente_id || undefined,
      cliente_nome: proposta.cliente_nome || '',
      cliente_cpf: proposta.cliente_cpf || cliente?.cpf || '',
      cliente_telefone: cliente?.celular || cliente?.telefone_fixo || '',
      responsavel_principal_id: proposta.vendedor_id || '',
      responsavel_principal_nome: proposta.vendedor_nome || '',
      responsaveis_ids: JSON.stringify(proposta.vendedor_id ? [proposta.vendedor_id] : []),
      responsaveis_nomes: JSON.stringify(proposta.vendedor_nome ? [proposta.vendedor_nome] : []),
      responsaveis_fotos: '[]',
      setor_id: setor?.id,
      setor_nome: setor?.nome,
      pendencia_com: 'banco',
      prioridade: 'media',
      status: 'a_fazer',
      origem: 'sistema',
      data_cadastro: hoje,
      data_conclusao_prevista: previsao,
      criado_por_id: user.id,
      criado_por_nome: user.full_name || 'Sistema',
      proposta_id: proposta.id,
    });

    return Response.json({ success: true, finalizada: false, tarefa_id: tarefa.id, criada: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}