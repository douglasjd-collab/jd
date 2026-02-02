import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verificar permissão (admin ou gerente)
    if (!['super_admin', 'master', 'admin', 'gerente'].includes(user.perfil)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { file_url, assembleia_data, empresa_id, usuario_id, usuario_nome } = await req.json();

    if (!file_url || !assembleia_data || !empresa_id) {
      return Response.json({ error: 'Parâmetros obrigatórios faltando' }, { status: 400 });
    }

    // 1. Baixar arquivo
    const fileResponse = await fetch(file_url);
    const fileContent = await fileResponse.text();

    // 2. Processar CSV
    const lines = fileContent.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      return Response.json({ error: 'Arquivo vazio ou inválido' }, { status: 400 });
    }

    // Remover header
    const dataLines = lines.slice(1);

    // 3. Criar registro de histórico
    const historico = await base44.asServiceRole.entities.HistoricoLanceGrupo.create({
      empresa_id,
      assembleia_data,
      arquivo_nome: file_url.split('/').pop(),
      total_grupos: 0,
      total_registros: 0,
      criado_em: new Date().toISOString(),
      usuario_id,
      usuario_nome
    });

    // 4. Processar linhas e criar resumos
    const gruposSet = new Set();
    let totalRegistros = 0;

    for (const line of dataLines) {
      const parts = line.split(',').map(p => p.trim());
      
      if (parts.length < 5) continue;

      const [grupo, modalidade, menorLance, maiorLance, quantidade] = parts;

      if (!grupo || !modalidade) continue;

      gruposSet.add(grupo);

      const menorPercent = parseFloat(menorLance) || null;
      const maiorPercent = parseFloat(maiorLance) || null;
      const qtd = parseInt(quantidade) || 0;

      await base44.asServiceRole.entities.HistoricoLanceResumo.create({
        empresa_id,
        historico_id: historico.id,
        grupo: grupo.toString(),
        modalidade,
        menor_lance_percent: menorPercent,
        maior_lance_percent: maiorPercent,
        qtd_ocorrencias: qtd
      });

      totalRegistros++;
    }

    // 5. Atualizar totais no histórico
    await base44.asServiceRole.entities.HistoricoLanceGrupo.update(historico.id, {
      total_grupos: gruposSet.size,
      total_registros: totalRegistros
    });

    return Response.json({
      success: true,
      historico_id: historico.id,
      total_grupos: gruposSet.size,
      total_registros: totalRegistros
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});