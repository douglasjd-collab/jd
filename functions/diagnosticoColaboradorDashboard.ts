import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar Colaborador do usuário
    const colabs = await base44.entities.Colaborador.filter(
      { user_id: user.id },
      '-created_date'
    );

    if (!colabs || colabs.length === 0) {
      return Response.json({
        success: false,
        message: 'Nenhum colaborador encontrado para este usuário',
        user_id: user.id,
        user_email: user.email,
        user_full_name: user.full_name
      });
    }

    const colab = colabs[0];

    // Buscar vendas do colaborador
    let vendasDoCola = [];
    try {
      vendasDoCola = await base44.entities.Venda.filter(
        { vendedor_id: colab.id },
        '-created_date'
      );
    } catch (e) {
      console.log('Erro ao buscar vendas:', e.message);
    }

    // Buscar todas as vendas da empresa do colaborador
    let vendasDaEmpresa = [];
    if (colab.empresa_id) {
      try {
        vendasDaEmpresa = await base44.entities.Venda.filter(
          { empresa_id: colab.empresa_id },
          '-created_date'
        );
      } catch (e) {
        console.log('Erro ao buscar vendas da empresa:', e.message);
      }
    }

    return Response.json({
      success: true,
      colaborador: {
        id: colab.id,
        nome: colab.nome,
        email: colab.email,
        perfil: colab.perfil,
        empresa_id: colab.empresa_id,
        empresa_nome: colab.empresa_nome,
        status: colab.status,
        gerente_id: colab.gerente_id,
        gerente_nome: colab.gerente_nome
      },
      vendas: {
        do_colaborador: vendasDoCola.length,
        da_empresa: vendasDaEmpresa.length,
        vendas_colaborador_ids: vendasDoCola.map(v => v.id).slice(0, 5)
      },
      diagnostico: {
        tem_empresa_id: !!colab.empresa_id,
        tem_vendas_proprias: vendasDoCola.length > 0,
        tem_vendas_na_empresa: vendasDaEmpresa.length > 0,
        status_ativo: colab.status === 'ativo'
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});