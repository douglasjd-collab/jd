import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { transferencia_id, acao, justificativa, dados } = body;

    if (!transferencia_id) return Response.json({ error: 'transferencia_id é obrigatório' }, { status: 400 });
    if (!['aprovar', 'reprovar', 'estornar', 'atualizar'].includes(acao)) {
      return Response.json({ error: 'acao inválida (use aprovar | reprovar | estornar | atualizar)' }, { status: 400 });
    }

    const transfers = await base44.asServiceRole.entities.TransferenciaCota.filter({ id: transferencia_id });
    const transfer = transfers[0];
    if (!transfer) return Response.json({ error: 'Transferência não encontrada' }, { status: 404 });
    if (transfer.estornado) return Response.json({ error: 'Esta transferência já foi estornada' }, { status: 400 });

    const isAprovador = ['admin', 'super_admin', 'master', 'gerente'].includes(user.perfil);
    const isEstornador = ['admin', 'super_admin', 'master'].includes(user.perfil);

    // -- Atualizar dados da transferência (qualquer papel que tem acesso) ---
    if (acao === 'atualizar') {
      const patch: Record<string, unknown> = {};
      const d = dados || {};
      ['data_efetiva', 'motivo', 'observacoes', 'taxa_transferencia', 'protocolo_administradora',
        'manter_contrato', 'contrato_novo', 'valor_credito_novo', 'vendedor_responsavel_id',
        'vendedor_responsavel_nome', 'data_solicitacao', 'situacao'].forEach((k) => {
        if (d[k] !== undefined) patch[k] = d[k];
      });
      // Documentos anexados
      if (Array.isArray(d.documentos_urls)) {
        patch.documentos_urls = d.documentos_urls;
        patch.documentos_nomes = d.documentos_nomes || [];
      }
      if (Array.isArray(d.comprovante_urls)) {
        patch.comprovante_urls = d.comprovante_urls;
        patch.comprovante_nomes = d.comprovante_nomes || [];
      }
      // Validação de novo contrato quando manter_contrato = false
      if (patch.situacao === 'aguardando_aprovacao' && patch.manter_contrato === false && !patch.contrato_novo && !transfer.contrato_novo) {
        return Response.json({ error: 'Novo número de contrato é obrigatório quando a administradora gerar novo contrato.' }, { status: 400 });
      }
      if (patch.situacao === 'cancelada' && !isAprovador) {
        return Response.json({ error: 'Sem permissão para cancelar.' }, { status: 403 });
      }
      await base44.asServiceRole.entities.TransferenciaCota.update(transfer.id, patch);

      // Se mudou situação para cancelada, liberar a proposta de origem (voltar para ativa)
      if (patch.situacao === 'cancelada') {
        const origemC = (await base44.asServiceRole.entities.Venda.filter({ id: transfer.proposta_origem_id }))[0];
        if (origemC && origemC.status === 'transferencia_andamento') {
          await base44.asServiceRole.entities.Venda.update(origemC.id, { status: 'ativa', transferencia_id: null });
        }
      }
      return Response.json({ success: true, mensagem: 'Transferência atualizada.' });
    }

    // -- Aprovar: atomicamente conclui a transferência ---
    if (acao === 'aprovar') {
      if (!isAprovador) return Response.json({ error: 'Sem permissão para aprovar transferência (gerente/admin/super_admin).' }, { status: 403 });
      if (transfer.situacao === 'aprovada') return Response.json({ error: 'Transferência já aprovada.' }, { status: 400 });
      if (!['aguardando_aprovacao', 'aguardando_documentos'].includes(transfer.situacao)) {
        return Response.json({ error: 'Transferência não pode ser aprovada neste estado.' }, { status: 400 });
      }
      if (transfer.manter_contrato === false && !transfer.contrato_novo) {
        return Response.json({ error: 'Novo número de contrato é obrigatório antes de aprovar.' }, { status: 400 });
      }

      const origem = (await base44.asServiceRole.entities.Venda.filter({ id: transfer.proposta_origem_id }))[0];
      if (!origem) return Response.json({ error: 'Proposta de origem não encontrada.' }, { status: 404 });

      // --- Regra anti-duplicidade: garantir que a combinação admin+grupo+cota só tenha UMA ativa ---
      const outras = await base44.asServiceRole.entities.Venda.filter({
        empresa_id: origem.empresa_id,
        administradora_id: origem.administradora_id,
        grupo: origem.grupo,
        cota: origem.cota,
      });
      const ativasConflitantes = outras.filter((v) =>
        v.id !== origem.id &&
        ['ativa', 'transferencia_andamento', 'contemplada', 'pendente'].includes(v.status)
      );
      if (ativasConflitantes.length > 0) {
        return Response.json({ error: 'Esta cota já está vinculada a uma proposta ativa.' }, { status: 409 });
      }

      // --- 1. Encerrar vínculo ativo do cliente anterior e marcar como Transferida ---
      await base44.asServiceRole.entities.Venda.update(origem.id, {
        status: 'transferida',
        bloqueio_status: true,
        transferencia_data: new Date().toISOString(),
        transferencia_cliente_destino_nome: transfer.cliente_destino_nome,
        transferencia_cliente_destino_cpf: transfer.cliente_destino_cpf,
        // proposta_destino_id é atualizado na próxima etapa (após criar a nova proposta)
      });

      // --- 2. Criar nova proposta para o novo titular (status = ativa) ---
      const novoContrato = transfer.manter_contrato ? origem.contrato : transfer.contrato_novo;
      const valorCreditoNovo = transfer.valor_credito_novo ?? transfer.valor_credito_anterior ?? origem.valorCredito;
      const dataVenda = new Date().toISOString().split('T')[0];

      const novaVenda = await base44.asServiceRole.entities.Venda.create({
        empresa_id: origem.empresa_id,
        cliente_id: transfer.cliente_destino_id,
        cliente_nome: transfer.cliente_destino_nome,
        cliente_cpf: transfer.cliente_destino_cpf,
        administradora_id: origem.administradora_id,
        administradora_nome: origem.administradora_nome,
        tabela_id: origem.tabela_id,
        tabela_nome: origem.tabela_nome,
        plano_id: origem.plano_id,
        tipo: origem.tipo,
        grupo: origem.grupo,
        cota: origem.cota,
        contrato: novoContrato,
        prazo: origem.prazo,
        valorCredito: valorCreditoNovo,
        taxaAdministracao: origem.taxaAdministracao,
        vendedor_id: transfer.vendedor_responsavel_id || origem.vendedor_id,
        vendedor_nome: transfer.vendedor_responsavel_nome || origem.vendedor_nome,
        gerente_id: origem.gerente_id,
        gerente_nome: origem.gerente_nome,
        data_venda: dataVenda,
        status: 'ativa',
        // --- CORREÇÃO: transferência de cota NÃO é nova venda ---
        origem_proposta: 'transferencia_cota',
        proposta_origem_id: origem.id,
        transferencia_id: transfer.id,
        titular_anterior_id: origem.cliente_id,
        titular_anterior_nome: origem.cliente_nome,
        titularidade_inicio: new Date().toISOString(),
      });

      // --- 3. Vincular cota ao novo cliente + atualizar origem com proposta_destino_id ---
      await base44.asServiceRole.entities.Venda.update(origem.id, { proposta_destino_id: novaVenda.id });

      // --- 4. Atualizar registro da transferência ---
      await base44.asServiceRole.entities.TransferenciaCota.update(transfer.id, {
        situacao: 'aprovada',
        proposta_destino_id: novaVenda.id,
        contrato_novo: novoContrato,
        data_aprovacao: new Date().toISOString(),
        aprovado_por_id: user.id,
        aprovado_por_nome: user.full_name,
      });

      // --- 5. Auditoria ---
      try {
        await base44.asServiceRole.entities.LogAuditoria.create({
          empresa_id: origem.empresa_id,
          usuario_id: user.id,
          usuario_nome: user.full_name,
          acao: `Transferência de cota APROVADA - Grupo ${origem.grupo}, Cota ${origem.cota}: ${origem.cliente_nome} → ${transfer.cliente_destino_nome}`,
          entidade: 'Venda',
          entidade_id: origem.id,
          dados_novos: JSON.stringify({
            proposta_origem_id: origem.id,
            proposta_destino_id: novaVenda.id,
            contrato_anterior: origem.contrato,
            contrato_novo: novoContrato,
            valor_credito_anterior: origem.valorCredito,
            valor_credito_novo: valorCreditoNovo,
          }),
          tipo: 'transferencia_cota',
        });
      } catch (e) {
        console.log('Erro ao criar log:', e);
      }

      return Response.json({
        success: true,
        proposta_destino_id: novaVenda.id,
        mensagem: `Transferência concluída. Nova proposta criada para ${transfer.cliente_destino_nome}.`,
      });
    }

    // -- Reprovar: status volta para ativa na origem ---
    if (acao === 'reprovar') {
      if (!isAprovador) return Response.json({ error: 'Sem permissão para reprovar transferência.' }, { status: 403 });
      if (transfer.situacao === 'aprovada') return Response.json({ error: 'Transferência já aprovada — use estornar.' }, { status: 400 });

      await base44.asServiceRole.entities.TransferenciaCota.update(transfer.id, {
        situacao: 'reprovada',
        aprovado_por_id: user.id,
        aprovado_por_nome: user.full_name,
        observacoes: (transfer.observacoes || '') + (justificativa ? `\n[Reprovado] ${justificativa}` : ''),
      });

      const origem = (await base44.asServiceRole.entities.Venda.filter({ id: transfer.proposta_origem_id }))[0];
      if (origem) {
        await base44.asServiceRole.entities.Venda.update(origem.id, {
          status: 'transferencia_reprovada',
        });
      }

      try {
        await base44.asServiceRole.entities.LogAuditoria.create({
          empresa_id: transfer.empresa_id,
          usuario_id: user.id,
          usuario_nome: user.full_name,
          acao: `Transferência REPROVADA - Grupo ${transfer.grupo}, Cota ${transfer.cota}. Justificativa: ${justificativa || '-'}`,
          entidade: 'Venda',
          entidade_id: transfer.proposta_origem_id,
          tipo: 'transferencia_cota',
        });
      } catch (e) {}

      return Response.json({ success: true, mensagem: 'Transferência reprovada. Status da proposta marcado como "Transferência reprovada".' });
    }

    // -- Estornar: admin/super_admin apenas ---
    if (acao === 'estornar') {
      if (!isEstornador) return Response.json({ error: 'Estorno exclusivo para administrador ou superadministrador.' }, { status: 403 });
      if (!justificativa || !justificativa.trim()) return Response.json({ error: 'Justificativa do estorno é obrigatória.' }, { status: 400 });
      if (transfer.situacao !== 'aprovada') return Response.json({ error: 'Apenas transferências aprovadas podem ser estornadas.' }, { status: 400 });

      const origem = (await base44.asServiceRole.entities.Venda.filter({ id: transfer.proposta_origem_id }))[0];
      const destino = transfer.proposta_destino_id
        ? (await base44.asServiceRole.entities.Venda.filter({ id: transfer.proposta_destino_id }))[0]
        : null;

      if (!origem) return Response.json({ error: 'Proposta de origem não encontrada.' }, { status: 404 });

      if (destino) {
        // Verificar se houve outra transferência posterior a partir da proposta destino
        if (destino.proposta_destino_id) {
          return Response.json({ error: 'Não é possível estornar: ocorreu outra transferência posterior desta cota.' }, { status: 400 });
        }
        // Cancelar a proposta de destino (não apagar — preserva histórico)
        await base44.asServiceRole.entities.Venda.update(destino.id, {
          status: 'cancelada',
          bloqueio_status: true,
        });
      }

      // Restaurar proposta origem para Ativa
      await base44.asServiceRole.entities.Venda.update(origem.id, {
        status: 'ativa',
        bloqueio_status: false,
        transferencia_data: null,
        transferencia_cliente_destino_nome: null,
        transferencia_cliente_destino_cpf: null,
        proposta_destino_id: null,
      });

      // Marcar transferência como estornada
      await base44.asServiceRole.entities.TransferenciaCota.update(transfer.id, {
        estornado: true,
        estornado_em: new Date().toISOString(),
        estornado_por_id: user.id,
        estornado_por_nome: user.full_name,
        estorno_justificativa: justificativa,
      });

      try {
        await base44.asServiceRole.entities.LogAuditoria.create({
          empresa_id: transfer.empresa_id,
          usuario_id: user.id,
          usuario_nome: user.full_name,
          acao: `Estorno de transferência - Grupo ${origem.grupo}, Cota ${origem.cota}. Justificativa: ${justificativa}`,
          entidade: 'Venda',
          entidade_id: origem.id,
          dados_novos: JSON.stringify({
            transferencia_id: transfer.id,
            proposta_destino_id: destino?.id || null,
          }),
          tipo: 'transferencia_cota_estorno',
        });
      } catch (e) {}

      return Response.json({ success: true, mensagem: 'Transferência estornada. Proposta de origem restaurada para Ativa.' });
    }

    return Response.json({ error: 'Ação não suportada.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});