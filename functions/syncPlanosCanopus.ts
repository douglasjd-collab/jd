import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verificar se é admin
    if (!['admin', 'super_admin', 'master'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { empresa_id } = await req.json();
    const empresaIdFinal = empresa_id || user.empresa_id;

    if (!empresaIdFinal) {
      return Response.json({ 
        error: 'empresa_id não encontrado' 
      }, { status: 400 });
    }

    const startedAt = new Date().toISOString();
    const errors = [];
    let successCount = 0;
    let updatedCount = 0;

    // Buscar integração Canopus
    const integracoes = await base44.asServiceRole.entities.IntegracaoCanopus.filter({
      empresa_id: empresaIdFinal,
      status: 'ativa'
    });

    if (integracoes.length === 0) {
      return Response.json({
        error: 'Integração Canopus não configurada para esta empresa',
        success: false
      }, { status: 400 });
    }

    const integracao = integracoes[0];
    const apiUrl = integracao.url_api || 'https://api.canopus.com.br';
    const apiKey = integracao.api_key;

    if (!apiKey) {
      return Response.json({
        error: 'API Key não configurada',
        success: false
      }, { status: 400 });
    }

    // Chamar API Canopus para obter planos
    const response = await fetch(`${apiUrl}/v1/planos`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Erro ao conectar API Canopus: ${response.statusText}`);
    }

    const planos = await response.json();

    if (!Array.isArray(planos)) {
      throw new Error('Resposta inválida da API Canopus');
    }

    // Buscar administradora Canopus
    const adminCanopus = await base44.asServiceRole.entities.Administradora.filter({
      empresa_id: empresaIdFinal,
      nome_fantasia: 'Canopus'
    });

    let administradora_id = adminCanopus.length > 0 ? adminCanopus[0].id : null;

    // Se não encontrar, usar a primeira administradora ativa
    if (!administradora_id) {
      const admins = await base44.asServiceRole.entities.Administradora.filter({
        empresa_id: empresaIdFinal,
        status: 'ativa'
      });
      if (admins.length > 0) {
        administradora_id = admins[0].id;
      }
    }

    if (!administradora_id) {
      return Response.json({
        error: 'Nenhuma administradora encontrada para vincular os planos',
        success: false
      }, { status: 400 });
    }

    // Processar planos
    for (let i = 0; i < planos.length; i++) {
      const plano = planos[i];

      try {
        // Validações
        if (!plano.nome || !plano.prazo_meses || !plano.parcela) {
          errors.push({
            index: i,
            nome: plano.nome,
            message: 'Campos obrigatórios ausentes (nome, prazo_meses, parcela)',
            raw_data: plano
          });
          continue;
        }

        // Gerar hash para upsert
        const hashChave = `${empresa_id}|${plano.nome}|${plano.produto || ''}|${plano.nome_bem || ''}|${plano.prazo_meses}|${plano.reajuste_tipo || 'IPCA'}|${plano.sem_reserva ? 'sim' : 'nao'}`;

        // Verificar se já existe
        const existente = await base44.asServiceRole.entities.PlanoCanopus.filter({
          hash_chave: hashChave
        });

        const planoData = {
          empresa_id: empresaIdFinal,
          origem: 'CANOPUS',
          plano: plano.nome,
          produto: plano.produto || '',
          nome_bem: plano.nome_bem || '',
          reajuste_tipo: plano.reajuste_tipo || 'IPCA',
          sem_reserva: plano.sem_reserva || false,
          valor_bem: parseFloat(plano.valor_bem || 0),
          prazo_meses: parseInt(plano.prazo_meses),
          parcela: parseFloat(plano.parcela),
          status: 'ativo',
          hash_chave: hashChave,
          ultima_sincronizacao: new Date().toISOString()
        };

        if (existente.length > 0) {
          await base44.asServiceRole.entities.PlanoCanopus.update(existente[0].id, planoData);
          updatedCount++;
        } else {
          await base44.asServiceRole.entities.PlanoCanopus.create(planoData);
          successCount++;
        }
      } catch (error) {
        errors.push({
          index: i,
          nome: plano.nome,
          message: error.message || 'Erro ao processar plano',
          raw_data: plano
        });
      }
    }

    const finishedAt = new Date().toISOString();
    const total = planos.length;
    const failed = errors.length;

    return Response.json({
      success: true,
      summary: {
        total,
        successCount,
        updatedCount,
        errorCount: failed
      },
      errors: errors.length > 0 ? errors : undefined,
      message: `Sincronização concluída: ${successCount} criados, ${updatedCount} atualizados, ${failed} erros`
    });

  } catch (error) {
    return Response.json({
      error: error.message || 'Erro ao sincronizar planos',
      success: false
    }, { status: 500 });
  }
});