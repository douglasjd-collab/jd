import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Gera um link público de proposta de simulação de consórcio.
// Chamado pelo vendedor a partir da tela de impressão da simulação.
// Cria um registro PropostaLinkSimulacao com token único + snapshot da simulação
// (para que o link renderize exatamente o mesmo conteúdo do PDF, mesmo se a
// simulação for editada depois).

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { simulacao_id, base_url } = body;
    if (!simulacao_id) {
      return Response.json({ error: 'simulacao_id é obrigatório' }, { status: 400 });
    }

    // Buscar a simulação (service role garante leitura independente de RLS)
    const simulacao = await base44.asServiceRole.entities.Simulacao.get(simulacao_id);
    if (!simulacao) {
      return Response.json({ error: 'Simulação não encontrada' }, { status: 404 });
    }

    // Buscar colaborador do vendedor (para telefone de alerta e nome)
    let colab = null;
    try {
      const colabs = await base44.asServiceRole.entities.Colaborador.filter(
        { user_id: user.id }, '-created_date', 1
      );
      colab = colabs?.[0] || null;
    } catch {}

    const empresaId = simulacao.empresa_id || colab?.empresa_id || user.empresa_id;
    if (!empresaId) {
      return Response.json({ error: 'Empresa não identificada para o vendedor' }, { status: 400 });
    }

    const vendedorNome = colab?.nome || user.full_name || '';
    const vendedorTelefone = colab?.telefone || '';

    const token = crypto.randomUUID();
    const origin = base_url || new URL(req.url).origin;
    const link_url = `${origin}/proposta/${token}`;

    const link = await base44.asServiceRole.entities.PropostaLinkSimulacao.create({
      empresa_id: empresaId,
      token,
      simulacao_id,
      simulacao_snapshot_json: JSON.stringify(simulacao),
      link_url,
      vendedor_id: user.id,
      vendedor_nome: vendedorNome,
      vendedor_telefone: vendedorTelefone,
      colaborador_id: colab?.id || null,
      cliente_nome: simulacao.cliente_nome || '',
      cliente_telefone: simulacao.telefone || '',
      aberta: false,
      total_aberturas: 0,
      alerta_abertura_enviado: false,
      alerta_nao_abriu_enviado: false,
    });

    return Response.json({
      success: true,
      token,
      link_url,
      link_id: link.id
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}