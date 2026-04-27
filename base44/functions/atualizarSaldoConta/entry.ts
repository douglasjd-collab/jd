import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Função utilitária para atualizar saldo de conta bancária
// Chamada após criar/editar/excluir uma despesa ou receita com conta_bancaria_id

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { conta_bancaria_id } = body;

    if (!conta_bancaria_id) {
      return Response.json({ error: 'conta_bancaria_id é obrigatório' }, { status: 400 });
    }

    // Buscar conta
    const conta = await base44.asServiceRole.entities.ContaBancaria.get(conta_bancaria_id);
    if (!conta) return Response.json({ error: 'Conta não encontrada' }, { status: 404 });

    // Buscar todas despesas pagas vinculadas a esta conta
    const despesas = await base44.asServiceRole.entities.Despesa.filter({ conta_bancaria_id });
    const totalDespesas = despesas
      .filter(d => ['pago', 'paga'].includes(d.status))
      .reduce((s, d) => s + (d.valor || 0), 0);

    // Buscar todas receitas recebidas vinculadas a esta conta
    const receitas = await base44.asServiceRole.entities.Receita.filter({ conta_bancaria_id });
    const totalReceitas = receitas
      .filter(r => r.status === 'recebida')
      .reduce((s, r) => s + (r.valor || 0), 0);

    // Novo saldo = saldo_inicial + receitas recebidas - despesas pagas
    const saldo_atual = (conta.saldo_inicial || 0) + totalReceitas - totalDespesas;

    await base44.asServiceRole.entities.ContaBancaria.update(conta_bancaria_id, { saldo_atual });

    return Response.json({ success: true, saldo_anterior: conta.saldo_atual, saldo_atual });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});