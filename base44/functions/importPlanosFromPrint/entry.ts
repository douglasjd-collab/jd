import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Apenas admin e super_admin podem importar
    const colaborador = user.perfil === 'super_admin' 
      ? null 
      : await base44.entities.Colaborador.filter({ user_id: user.id, status: 'ativo' }).then(c => c?.[0]);

    if (user.perfil !== 'super_admin' && !colaborador?.empresa_id) {
      return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    if (user.perfil !== 'super_admin' && !['admin', 'super_admin'].includes(colaborador?.perfil)) {
      return Response.json({ error: 'Unauthorized: Only admins can import plans' }, { status: 403 });
    }

    const body = await req.json();
    const {
      empresa_id,
      origem = 'CANOPUS',
      produto = 'Automóvel',
      plano,
      nome_bem,
      valor_bem,
      tipo_venda,
      grupo_cota,
      itens = [],
    } = body;

    if (!empresa_id || !plano || !nome_bem || !itens.length) {
      return Response.json({
        success: false,
        error: 'Missing required fields: empresa_id, plano, nome_bem, itens',
      }, { status: 400 });
    }

    const created = [];
    const updated = [];
    const errors = [];

    // Mapa de taxas por prazo para automóvel
    const taxasPorPrazo = {
      96: 20.8,
      86: 19.8,
      76: 18.8,
      66: 16.8,
      56: 15.8,
      46: 13.8,
      36: 12.8
    };

    // Determinar tipo_bem baseado no produto
    const getTipoBem = (produto) => {
      const prod = (produto || '').toLowerCase();
      if (prod.includes('automóvel') || prod.includes('automovel')) return 'automovel';
      if (prod.includes('imóvel') || prod.includes('imovel')) return 'imovel';
      if (prod.includes('motocicleta')) return 'motocicleta';
      if (prod.includes('serviço') || prod.includes('servico')) return 'servico';
      return 'bens_moveis';
    };

    const tipoBem = getTipoBem(produto);

    // Obter taxa de ADM baseado no prazo para automóvel
    const getTaxaAdm = (prazo, tipoBem, valor) => {
      if (tipoBem !== 'automovel') return undefined;
      if (valor && (valor < 25000 || valor > 50000)) return undefined;
      return taxasPorPrazo[prazo] || undefined;
    };

    for (const item of itens) {
      try {
        const { prazo_meses, primeira_parcela } = item;

        if (!prazo_meses || !primeira_parcela) {
          errors.push(`Item inválido: prazo_meses=${prazo_meses}, primeira_parcela=${primeira_parcela}`);
          continue;
        }

        // Gera hash para upsert
        const hash_chave = `${empresa_id}|${plano}|${produto}|${nome_bem}|${prazo_meses}|IPCA|false`;

        // Busca se já existe
        const existing = await base44.asServiceRole.entities.PlanoCanopus.filter({
          empresa_id,
          hash_chave,
        });

        const planData = {
          empresa_id,
          origem,
          plano,
          produto,
          nome_bem,
          reajuste_tipo: 'IPCA',
          sem_reserva: false,
          valor_bem: valor_bem || 0,
          prazo_meses,
          parcela: primeira_parcela,
          status: 'ativo',
          hash_chave,
          ultima_sincronizacao: new Date().toISOString(),
        };

        if (existing && existing.length > 0) {
          // Atualizar
          await base44.asServiceRole.entities.PlanoCanopus.update(existing[0].id, planData);
          updated.push(`${prazo_meses} meses - R$ ${primeira_parcela.toFixed(2)}`);
        } else {
          // Criar
          await base44.asServiceRole.entities.PlanoCanopus.create(planData);
          created.push(`${prazo_meses} meses - R$ ${primeira_parcela.toFixed(2)}`);
        }

        // Também salvar em PlanoConsorcio com taxa_adm
        const taxaAdm = getTaxaAdm(prazo_meses, tipoBem, valor_bem);
        const planoConsorcioData = {
          empresa_id,
          nome: `${plano} - ${nome_bem}`,
          administradora_id: '', // opcional
          grupo: grupo_cota || '',
          prazo: prazo_meses,
          valor_carta: valor_bem || 0,
          tipo_bem: tipoBem,
          status: 'ativo',
        };

        // Incluir taxa_adm se aplicável
        if (taxaAdm) {
          planoConsorcioData.taxa_adm = taxaAdm;
        }

        const existingConsorcio = await base44.asServiceRole.entities.PlanoConsorcio.filter({
          empresa_id,
          nome: planoConsorcioData.nome,
          prazo: prazo_meses,
        });

        if (existingConsorcio && existingConsorcio.length > 0) {
          await base44.asServiceRole.entities.PlanoConsorcio.update(existingConsorcio[0].id, planoConsorcioData);
        } else {
          await base44.asServiceRole.entities.PlanoConsorcio.create(planoConsorcioData);
        }
      } catch (e) {
        errors.push(`Erro ao processar item ${item.prazo_meses}m: ${e.message}`);
      }
    }

    const message = `Planos importados: ${created.length} criados, ${updated.length} atualizados${errors.length ? `, ${errors.length} erros` : ''}`;

    return Response.json({
      success: true,
      message,
      created,
      updated,
      errors,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});