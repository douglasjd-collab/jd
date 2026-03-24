import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { termo } = await req.json();

    if (!termo || termo.trim().length === 0) {
      return Response.json({ data: [] });
    }

    const searchTerm = termo.toLowerCase().trim();

    // Buscar vendas de consórcio (sem filtro de status, traz todos)
    const vendas = await base44.asServiceRole.entities.Venda.filter({});
    
    // Normalizar busca: remove caracteres especiais
    const normalizar = (str) => {
      return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    };

    const termoBuscaNorm = normalizar(searchTerm);

    const contratosEncontrados = vendas.filter((venda) => {
      // Verificar se é consórcio
      if (venda.tipo !== 'automovel' && venda.tipo !== 'imovel' && venda.tipo !== 'motocicleta' && 
          venda.tipo !== 'servico' && venda.tipo !== 'bens_moveis') {
        return false;
      }

      const nomeNorm = normalizar(venda.cliente_nome);
      const contratoNorm = normalizar(venda.contrato);
      const grupoNorm = normalizar(venda.grupo);
      const cotaNorm = normalizar(venda.cota);
      const cpfNorm = normalizar(venda.cliente_cpf);
      const grupoCtaNorm = normalizar(`${venda.grupo}${venda.cota}`);

      return (
        nomeNorm.includes(termoBuscaNorm) ||
        contratoNorm.includes(termoBuscaNorm) ||
        grupoNorm.includes(termoBuscaNorm) ||
        cotaNorm.includes(termoBuscaNorm) ||
        grupoCtaNorm.includes(termoBuscaNorm) ||
        cpfNorm.includes(termoBuscaNorm)
      );
    });

    // Formatar resposta
    const data = contratosEncontrados.slice(0, 20).map((venda) => ({
      id: venda.id,
      venda_id: venda.id,
      cliente_id: venda.cliente_id,
      vendedor_id: venda.vendedor_id,
      administradora_id: venda.administradora_id,
      empresa_id: venda.empresa_id,
      numero_contrato: venda.contrato || `${venda.grupo}/${venda.cota}`,
      cliente_nome: venda.cliente_nome,
      administradora_nome: venda.administradora_nome,
      vendedor_nome: venda.vendedor_nome,
      grupo: venda.grupo,
      cota: venda.cota,
      // Usar valor da comissão como base para cálculo em percentual
      valor_base_comissao: venda.valorComissao || venda.valor_comissao || 0,
    }));

    return Response.json({ data });
  } catch (error) {
    console.error('Erro em buscarContratosComissao:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});