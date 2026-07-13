import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Envios automáticos de campanha usam sempre a D-API (nunca a Meta Oficial)
async function enviarViaDapi(base44, empresaId, telefone, mensagem) {
  const conexoes = await base44.asServiceRole.entities.WhatsappConnection.filter(
    { empresa_id: empresaId, provider_type: 'dapi', is_active: true },
    '-created_date',
    1
  );
  const conexao = conexoes[0];
  if (!conexao) return { data: { success: false, error: 'Nenhuma conexão D-API ativa' } };
  return await base44.functions.invoke('whatsappService', {
    connectionId: conexao.id,
    action: 'sendText',
    phoneNumber: (telefone || '').replace(/\D/g, ''),
    text: mensagem
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['master', 'super_admin', 'admin'].includes(user.perfil)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const empresaId = user.empresa_id || '699696c2c9f5bffc2e67402b';
    const hoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    let campanhasEnviadas = 0;
    let erros = 0;
    const detalhes = [];

    // ── 1. RENOVAÇÕES DE EMPRÉSTIMO (CampanhaRenovacao) ──────────────────────
    const renovacoesPendentes = await base44.asServiceRole.entities.CampanhaRenovacao.filter(
      { empresa_id: empresaId, status: 'aguardando' },
      'data_agendada_envio',
      500
    );

    const renovacoesVencidas = renovacoesPendentes.filter(r => r.data_agendada_envio <= hoje);

    for (const renovacao of renovacoesVencidas) {
      try {
        if (!renovacao.cliente_telefone) {
          await base44.asServiceRole.entities.CampanhaRenovacao.update(renovacao.id, {
            status: 'erro',
            motivo_erro: 'Telefone do cliente não cadastrado',
          });
          erros++;
          detalhes.push({ renovacao_id: renovacao.id, erro: 'Sem telefone' });
          continue;
        }

        const valorFmt = renovacao.valor_credito
          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(renovacao.valor_credito)
          : 'um crédito especial';

        const mensagem = `Olá ${renovacao.cliente_nome || 'Cliente'}! 👋\n\n`
          + `Faz exatamente 1 ano desde que você realizou seu empréstimo de ${valorFmt}`
          + (renovacao.banco_nome ? ` no ${renovacao.banco_nome}` : '')
          + `. 🎉\n\n`
          + `Queremos te oferecer uma nova proposta com condições ainda melhores! `
          + `Que tal renovar e aproveitar mais crédito para realizar seus planos? 💼\n\n`
          + `Entre em contato conosco e veja o que temos para você! 😊`;

        const respMensagem = await enviarViaDapi(base44, empresaId, renovacao.cliente_telefone, mensagem);

        if (respMensagem?.data?.success) {
          await base44.asServiceRole.entities.CampanhaRenovacao.update(renovacao.id, {
            status: 'enviada',
            data_envio: new Date().toISOString(),
            mensagem_enviada: mensagem,
          });

          // Registrar também no CampanhaLog para histórico consolidado
          await base44.asServiceRole.entities.CampanhaLog.create({
            empresa_id: empresaId,
            cliente_id: renovacao.cliente_id,
            cliente_nome: renovacao.cliente_nome,
            cliente_telefone: renovacao.cliente_telefone,
            venda_id: renovacao.proposta_id,
            tipo_campanha: 'aniversario_emprestimo',
            mensagem_enviada: mensagem,
            status: 'enviada',
            data_original_quitacao: renovacao.data_pagamento,
          });

          campanhasEnviadas++;
          detalhes.push({ renovacao_id: renovacao.id, cliente: renovacao.cliente_nome, status: 'sucesso' });
        } else {
          await base44.asServiceRole.entities.CampanhaRenovacao.update(renovacao.id, {
            status: 'erro',
            motivo_erro: 'Falha ao enviar mensagem WhatsApp',
          });
          erros++;
          detalhes.push({ renovacao_id: renovacao.id, erro: 'Falha no envio' });
        }
      } catch (e) {
        erros++;
        detalhes.push({ renovacao_id: renovacao.id, erro: e.message });
        await base44.asServiceRole.entities.CampanhaRenovacao.update(renovacao.id, {
          status: 'erro',
          motivo_erro: e.message,
        });
      }
    }

    // ── 2. CONSÓRCIO (Venda) — lógica original ───────────────────────────────
    const dataUmAnoAtras = new Date();
    dataUmAnoAtras.setFullYear(dataUmAnoAtras.getFullYear() - 1);

    const vendas = await base44.asServiceRole.entities.Venda.filter({
      empresa_id: empresaId,
      status: { $in: ['quitada', 'contemplada', 'paga'] }
    }, '-updated_date', 10000);

    for (const venda of vendas) {
      try {
        const dataVenda = venda.updated_date ? new Date(venda.updated_date) : new Date(venda.created_date);
        const diasPassados = Math.floor((new Date() - dataVenda) / (1000 * 60 * 60 * 24));

        if (diasPassados < 360 || diasPassados > 375) continue;

        const clientes = await base44.asServiceRole.entities.Cliente.filter({ id: venda.cliente_id });
        if (!clientes || clientes.length === 0) { erros++; continue; }

        const cliente = clientes[0];
        const telefone = cliente.celular || cliente.pj_celular;
        if (!telefone) { erros++; continue; }

        const campanhasExistentes = await base44.asServiceRole.entities.CampanhaLog.filter({
          venda_id: venda.id,
          tipo_campanha: 'aniversario_emprestimo'
        });

        const campanhasRecentes = campanhasExistentes.filter(c => {
          const dias = Math.floor((new Date() - new Date(c.created_date)) / (1000 * 60 * 60 * 24));
          return dias < 30;
        });

        if (campanhasRecentes.length > 0) continue;

        const tipoVenda = venda.tipo === 'automovel' ? 'consórcio' : venda.tipo || 'produto';
        const mensagem = `Olá ${cliente.nome_completo || cliente.pj_razao_social || 'Cliente'}! 👋\n\nFaz um ano que você realizou seu ${tipoVenda} conosco! 🎉\n\nQueremos oferecer uma nova proposta especial para você!\n\nEntre em contato conosco para conhecer as melhores condições. 💼`;

        const respMensagem = await enviarViaDapi(base44, empresaId, telefone, mensagem);

        if (respMensagem?.data?.success) {
          await base44.asServiceRole.entities.CampanhaLog.create({
            empresa_id: empresaId,
            cliente_id: cliente.id,
            cliente_nome: cliente.nome_completo || cliente.pj_razao_social,
            cliente_telefone: telefone,
            venda_id: venda.id,
            tipo_campanha: 'aniversario_emprestimo',
            mensagem_enviada: mensagem,
            status: 'enviada',
            data_original_quitacao: venda.updated_date || venda.created_date
          });
          campanhasEnviadas++;
        } else {
          erros++;
        }
      } catch (e) {
        erros++;
      }
    }

    return Response.json({
      ok: true,
      campanhasEnviadas,
      erros,
      renovacoesProcessadas: renovacoesVencidas.length,
      detalhes,
    });

  } catch (error) {
    console.error('Erro em verificarEEnviarCampanhas:', error);
    return Response.json({ error: error.message, ok: false }, { status: 500 });
  }
});