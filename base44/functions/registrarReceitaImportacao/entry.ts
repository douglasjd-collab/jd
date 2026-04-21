import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// IDs das categorias padrão por produto
const CATEGORIA_IDS = {
  consorcio: '69797622be76bff3afbfdefd',      // Consórcio
  emprestimos: '69797761ae788b05e2821b4d',     // Empréstimo Consignado
};

const CATEGORIA_NOMES = {
  consorcio: 'Consórcio',
  emprestimos: 'Empréstimo Consignado',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { acao, importacao_id, empresa_id, produto, valor_total, data_recebimento, arquivo_nome, usuario_id, usuario_nome } = body;

    // ── CRIAR receita ao concluir importação ──
    if (acao === 'criar') {
      if (!importacao_id || !empresa_id || !produto || !valor_total) {
        return Response.json({ error: 'Parâmetros insuficientes' }, { status: 400 });
      }

      // Verificar se já existe receita para esta importação (idempotência)
      const existentes = await base44.asServiceRole.entities.Receita.filter({ importacao_id });
      if (existentes.length > 0) {
        return Response.json({ success: true, receita_id: existentes[0].id, ja_existia: true });
      }

      const categoriaId = CATEGORIA_IDS[produto] || CATEGORIA_IDS.consorcio;
      const categoriaNome = CATEGORIA_NOMES[produto] || produto;
      const dataHoje = data_recebimento || new Date().toISOString().slice(0, 10);
      const descricao = `Comissão recebida - ${arquivo_nome || 'Importação'} (${produto === 'consorcio' ? 'Consórcio' : 'Empréstimo'})`;

      const receita = await base44.asServiceRole.entities.Receita.create({
        empresa_id,
        descricao,
        categoria_id: categoriaId,
        categoria_nome: categoriaNome,
        valor: valor_total,
        data: dataHoje,
        data_recebimento: dataHoje,
        status: 'recebida',
        origem: `Importação ${produto === 'consorcio' ? 'Comissão Consórcio' : 'Comissão Empréstimo'}`,
        importacao_id,
        usuario_id: usuario_id || user.id,
        usuario_nome: usuario_nome || user.full_name,
      });

      return Response.json({ success: true, receita_id: receita.id });
    }

    // ── EXCLUIR receita ao excluir importação ──
    if (acao === 'excluir') {
      if (!importacao_id) return Response.json({ error: 'importacao_id obrigatório' }, { status: 400 });

      const receitas = await base44.asServiceRole.entities.Receita.filter({ importacao_id });
      for (const r of receitas) {
        await base44.asServiceRole.entities.Receita.delete(r.id);
      }

      return Response.json({ success: true, excluidos: receitas.length });
    }

    return Response.json({ error: 'Ação inválida. Use "criar" ou "excluir".' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});