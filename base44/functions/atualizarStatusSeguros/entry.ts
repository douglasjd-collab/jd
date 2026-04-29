import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Buscar todas as empresas ativas
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' }, '-created_date', 500);
    
    const hoje = new Date();
    const hojeStr = hoje.toISOString().slice(0, 10);
    let totalAtualizados = 0;

    for (const empresa of empresas) {
      // Buscar configuração de seguros da empresa
      const cfgs = await base44.asServiceRole.entities.ConfiguracaoSeguro.filter({ empresa_id: empresa.id }, '-created_date', 1);
      const cfg = cfgs[0] || { dias_para_renovacao: 30, dias_para_atraso: 3 };
      const diasRenovacao = cfg.dias_para_renovacao || 30;
      const diasAtraso = cfg.dias_para_atraso || 3;

      // Buscar todos os seguros ativos da empresa
      const propostas = await base44.asServiceRole.entities.PropostaSeguro.filter(
        { empresa_id: empresa.id },
        '-data_vencimento',
        5000
      );

      for (const p of propostas) {
        if (p.status === 'cancelado') continue;

        let novoStatus = p.status;
        const vencimento = p.data_vencimento ? new Date(p.data_vencimento) : null;

        if (vencimento) {
          const diffDias = Math.ceil((vencimento - hoje) / (1000 * 60 * 60 * 24));

          if (diffDias < -diasAtraso) {
            // Vencido há mais de X dias
            novoStatus = 'vencido';
          } else if (diffDias < 0) {
            // Dentro do período de tolerância
            novoStatus = 'atrasado';
          } else if (diffDias <= diasRenovacao && p.tipo_plano === 'anual') {
            // Próximo do vencimento → renovação
            novoStatus = 'em_renovacao';
          } else if (p.status !== 'em_dia') {
            // Ainda tem tempo — normalizar se estava marcado errado
            if (['atrasado', 'em_renovacao', 'vencido'].includes(p.status)) {
              novoStatus = 'em_dia';
            }
          }
        }

        if (novoStatus !== p.status) {
          await base44.asServiceRole.entities.PropostaSeguro.update(p.id, { status: novoStatus });
          totalAtualizados++;
          console.log(`✅ Seguro ${p.id} (${p.cliente_nome}): ${p.status} → ${novoStatus}`);
        }
      }
    }

    console.log(`✅ Atualização concluída: ${totalAtualizados} seguros atualizados`);
    return Response.json({ ok: true, total_atualizados: totalAtualizados });
  } catch (error) {
    console.error('Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});