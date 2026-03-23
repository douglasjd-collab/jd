import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Apenas admin ou super_admin podem executar migração
    if (!user || !['admin', 'super_admin', 'master'].includes(user.perfil)) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const stats = {
      consorcio_migrados: 0,
      emprestimo_migrados: 0,
      financiamento_migrados: 0,
      erros: []
    };

    // ===== MIGRAR CONSÓRCIOS =====
    try {
      const vendasConsorcio = await base44.asServiceRole.entities.VendaConsorcio.list();
      
      for (const venda of vendasConsorcio) {
        try {
          const venda_base = await base44.asServiceRole.entities.VendaBase.get(venda.venda_base_id);
          
          const proposta = {
            empresa_id: venda.empresa_id || venda_base.empresa_id,
            produto: 'consorcio',
            cliente_id: venda_base.cliente_id,
            cliente_nome: venda_base.cliente_nome,
            vendedor_id: venda_base.vendedor_id,
            vendedor_nome: venda_base.vendedor_nome,
            administradora_id: venda.administradora_id,
            administradora_nome: venda.administradora_nome,
            grupo: venda.grupo,
            cota: venda.cota,
            contrato: venda.contrato,
            status: venda_base.status || 'em_andamento',
            data_venda: venda_base.data_venda,
            valor_credito: venda.valorCredito,
            valor_comissao: venda.valorComissao,
            origem_tabela: 'VendaConsorcio',
            origem_id: venda.id,
            
            // Campos específicos de consórcio
            consorcio_tabela_id: venda.tabela_id,
            consorcio_tabela_nome: venda.tabela_nome,
            consorcio_plano_id: venda.plano_id,
            consorcio_tipo_bem: venda.tipo_bem,
            consorcio_prazo: venda.prazo,
            consorcio_taxa_adm: venda.taxaAdministracao,
            consorcio_percentual_comissao: venda.percentualComissao
          };

          await base44.asServiceRole.entities.Proposta.create(proposta);
          stats.consorcio_migrados++;
        } catch (e) {
          stats.erros.push(`VendaConsorcio ${venda.id}: ${e.message}`);
        }
      }
    } catch (e) {
      stats.erros.push(`Erro ao migrar consórcios: ${e.message}`);
    }

    // ===== MIGRAR EMPRÉSTIMOS =====
    try {
      const vendasEmprestimo = await base44.asServiceRole.entities.VendaConsignado.list();
      
      for (const venda of vendasEmprestimo) {
        try {
          const venda_base = await base44.asServiceRole.entities.VendaBase.get(venda.venda_base_id);
          
          const proposta = {
            empresa_id: venda_base.empresa_id,
            produto: 'emprestimo',
            cliente_id: venda_base.cliente_id,
            cliente_nome: venda_base.cliente_nome,
            vendedor_id: venda_base.vendedor_id,
            vendedor_nome: venda_base.vendedor_nome,
            administradora_id: venda.convenio_id,
            administradora_nome: venda.convenio_nome,
            contrato: venda.numero_contrato,
            status: venda.status || 'em_andamento',
            data_venda: venda_base.data_venda,
            valor_credito: venda.valor_liberado,
            valor_comissao: venda.comissao_empresa_prevista,
            origem_tabela: 'VendaConsignado',
            origem_id: venda.id,
            
            // Campos específicos de empréstimo
            emprestimo_tipo: venda.tipo_consignado,
            emprestimo_convenio_id: venda.convenio_id,
            emprestimo_convenio_nome: venda.convenio_nome,
            emprestimo_numero_beneficio: venda.numero_beneficio,
            emprestimo_numero_ade: venda.numero_ade,
            emprestimo_prazo: venda.prazo,
            emprestimo_banco_anterior: venda.banco_anterior,
            emprestimo_saldo_devedor: venda.saldo_devedor,
            emprestimo_data_liberacao: venda.data_liberacao
          };

          await base44.asServiceRole.entities.Proposta.create(proposta);
          stats.emprestimo_migrados++;
        } catch (e) {
          stats.erros.push(`VendaConsignado ${venda.id}: ${e.message}`);
        }
      }
    } catch (e) {
      stats.erros.push(`Erro ao migrar empréstimos: ${e.message}`);
    }

    // ===== MIGRAR FINANCIAMENTOS =====
    try {
      const vendasFinanciamento = await base44.asServiceRole.entities.VendaFinanciamento.list();
      
      for (const venda of vendasFinanciamento) {
        try {
          const venda_base = await base44.asServiceRole.entities.VendaBase.get(venda.venda_base_id);
          
          const proposta = {
            empresa_id: venda_base.empresa_id,
            produto: 'financiamento',
            cliente_id: venda_base.cliente_id,
            cliente_nome: venda_base.cliente_nome,
            vendedor_id: venda_base.vendedor_id,
            vendedor_nome: venda_base.vendedor_nome,
            administradora_id: undefined, // Será preenchido com banco
            administradora_nome: venda.banco,
            contrato: venda.numero_contrato,
            status: venda.status || 'em_andamento',
            data_venda: venda_base.data_venda,
            valor_credito: venda.valor_bem,
            origem_tabela: 'VendaFinanciamento',
            origem_id: venda.id,
            
            // Campos específicos de financiamento
            financiamento_tipo: venda.tipo_financiamento,
            financiamento_banco: venda.banco,
            financiamento_valor_bem: venda.valor_bem,
            financiamento_valor_financiado: venda.valor_financiado,
            financiamento_entrada: venda.entrada,
            financiamento_prazo: venda.prazo,
            financiamento_parcela: venda.parcela,
            financiamento_data_liberacao: venda.data_liberacao
          };

          await base44.asServiceRole.entities.Proposta.create(proposta);
          stats.financiamento_migrados++;
        } catch (e) {
          stats.erros.push(`VendaFinanciamento ${venda.id}: ${e.message}`);
        }
      }
    } catch (e) {
      stats.erros.push(`Erro ao migrar financiamentos: ${e.message}`);
    }

    const total = stats.consorcio_migrados + stats.emprestimo_migrados + stats.financiamento_migrados;
    
    return Response.json({
      status: 'success',
      mensagem: `Migração concluída: ${total} propostas criadas`,
      stats,
      erros: stats.erros.length > 0 ? stats.erros : null
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});