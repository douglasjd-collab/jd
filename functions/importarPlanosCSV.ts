import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['admin', 'super_admin', 'master'].includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { csv_data } = await req.json();

    if (!csv_data) {
      return Response.json({ error: 'CSV data required' }, { status: 400 });
    }

    const lines = csv_data.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    // Validar headers obrigatórios
    const requiredHeaders = ['plano', 'produto', 'nome_bem', 'reajuste_tipo', 'valor_bem', 'prazo_meses', 'parcela'];
    const hasRequiredHeaders = requiredHeaders.every(h => headers.includes(h));
    
    if (!hasRequiredHeaders) {
      return Response.json({ 
        error: `Headers obrigatórios faltando. Esperado: ${requiredHeaders.join(', ')}` 
      }, { status: 400 });
    }

    let criados = 0;
    let atualizados = 0;
    const errors = [];

    // Obter empresa_id do usuário
    const colaboradores = await base44.asServiceRole.entities.Colaborador.filter({
      user_id: user.id,
      status: 'ativo'
    });

    const empresa_id = colaboradores?.[0]?.empresa_id;
    
    if (!empresa_id) {
      return Response.json({ 
        error: 'Usuário não vinculado a nenhuma empresa' 
      }, { status: 400 });
    }

    // Processar linhas
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const values = line.split(',').map(v => v.trim());
        const row = {};
        
        headers.forEach((header, idx) => {
          row[header] = values[idx];
        });

        // Validar dados obrigatórios
        if (!row.plano || !row.produto || !row.nome_bem) {
          errors.push(`Linha ${i + 1}: Campos obrigatórios vazios`);
          continue;
        }

        // Preparar dados
        const planData = {
          empresa_id,
          origem: 'MANUAL',
          plano: row.plano,
          produto: row.produto,
          nome_bem: row.nome_bem,
          reajuste_tipo: row.reajuste_tipo || 'IPCA',
          sem_reserva: row.sem_reserva?.toLowerCase() === 'true',
          valor_bem: parseFloat(row.valor_bem) || 0,
          prazo_meses: parseInt(row.prazo_meses) || 0,
          parcela: parseFloat(row.parcela) || 0,
          status: 'ativo',
          hash_chave: `${empresa_id}-${row.plano}-${row.produto}-${row.nome_bem}-${row.prazo_meses}-${row.reajuste_tipo}-${row.sem_reserva}`,
          ultima_sincronizacao: new Date().toISOString()
        };

        // Validar dados
        if (planData.valor_bem <= 0 || planData.prazo_meses <= 0 || planData.parcela <= 0) {
          errors.push(`Linha ${i + 1}: Valores inválidos`);
          continue;
        }

        // Verificar se existe (upsert)
        const existing = await base44.asServiceRole.entities.PlanoConsorcio.filter({
          hash_chave: planData.hash_chave
        });

        if (existing && existing.length > 0) {
          await base44.asServiceRole.entities.PlanoConsorcio.update(existing[0].id, planData);
          atualizados++;
        } else {
          await base44.asServiceRole.entities.PlanoConsorcio.create(planData);
          criados++;
        }
      } catch (err) {
        errors.push(`Linha ${i + 1}: ${err.message}`);
      }
    }

    return Response.json({
      success: true,
      criados,
      atualizados,
      total: criados + atualizados,
      erros: errors.length,
      errors: errors.length > 0 ? errors : null
    });
  } catch (error) {
    return Response.json(
      { error: error.message || 'Erro ao importar CSV' },
      { status: 500 }
    );
  }
});