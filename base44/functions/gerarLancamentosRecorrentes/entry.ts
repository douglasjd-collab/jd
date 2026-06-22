import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { tipo, dados, user_id, empresa_id } = await req.json();
    
    if (!tipo || !dados || !user_id || !empresa_id) {
      return Response.json({ error: 'Parâmetros obrigatórios: tipo, dados, user_id, empresa_id' }, { status: 400 });
    }

    const entidade = tipo === 'receita' ? 'MeuFinanceiroReceita' : 'MeuFinanceiroDespesa';
    const frequencia = dados.frequencia || 'mensal';
    const diaVencimento = dados.dia_vencimento || parseInt(dados.data?.split('-')[2] || '1');
    const repetirAteTipo = dados.repetir_ate_tipo || 'fim_ano';
    const valor = dados.valor || 0;

    // Determinar data limite
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    let dataLimite;

    if (repetirAteTipo === 'fim_ano') {
      dataLimite = new Date(anoAtual, 11, 31); // 31/dez/ano atual
    } else if (repetirAteTipo === 'meses') {
      const meses = dados.repetir_ate_meses || 12;
      dataLimite = new Date(hoje);
      dataLimite.setMonth(dataLimite.getMonth() + meses);
    } else if (repetirAteTipo === 'data' && dados.repetir_ate_data) {
      dataLimite = new Date(dados.repetir_ate_data + 'T00:00:00');
    } else {
      dataLimite = new Date(anoAtual, 11, 31);
    }

    // Gerar datas de vencimento
    const datas = [];
    let dataAtual = new Date(hoje.getFullYear(), hoje.getMonth(), diaVencimento);
    // Se o dia já passou neste mês, começa no próximo
    if (dataAtual <= hoje) {
      dataAtual.setMonth(dataAtual.getMonth() + 1);
    }

    while (dataAtual <= dataLimite) {
      const dia = Math.min(diaVencimento, new Date(dataAtual.getFullYear(), dataAtual.getMonth() + 1, 0).getDate());
      const dataStr = `${dataAtual.getFullYear()}-${String(dataAtual.getMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      datas.push(dataStr);
      dataAtual.setMonth(dataAtual.getMonth() + 1);
    }

    if (datas.length === 0) {
      return Response.json({ ok: true, gerados: 0, message: 'Nenhum lançamento futuro para gerar' });
    }

    // Criar os lançamentos
    const criados = [];
    const origemId = dados.origem_id || null;

    for (const dataStr of datas) {
      const payload = {
        empresa_id,
        usuario_id: user_id,
        usuario_nome: dados.usuario_nome || '',
        descricao: dados.descricao || '',
        categoria: dados.categoria || '',
        categoria_id: dados.categoria_id || null,
        subcategoria_id: dados.subcategoria_id || null,
        valor,
        data: dataStr,
        status: 'previsto',
        observacao: dados.observacao || '',
        conta_bancaria_id: dados.conta_bancaria_id || null,
        recorrencia_origem_id: origemId,
      };

      if (tipo === 'despesa') {
        payload.data_vencimento = dataStr;
      }

      const novo = await base44.asServiceRole.entities[entidade].create(payload);
      criados.push(novo.id);
    }

    console.log(`✅ ${criados.length} lançamentos recorrentes gerados (${tipo}) para ${dados.descricao}`);

    return Response.json({
      ok: true,
      gerados: criados.length,
      ids: criados,
      datas,
    });

  } catch (error) {
    console.error('❌ Erro ao gerar recorrentes:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});