import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    const empresaId = user.empresa_id;
    const diagnostico = {
      timestamp: new Date().toISOString(),
      empresa_id: empresaId,
      etapas: [],
      alertas: [],
      critico: false
    };

    // ──────────────────────────────────────────────────────────────────
    // 1. VERIFICAR CONFIGURAÇÃO DA EMPRESA
    // ──────────────────────────────────────────────────────────────────
    try {
      const empresa = await base44.asServiceRole.entities.Empresa.filter({
        id: empresaId
      });

      if (empresa?.length === 0) {
        diagnostico.etapas.push({
          etapa: 'Verificação Empresa',
          status: 'ERRO',
          msg: `Empresa ${empresaId} não encontrada`
        });
        diagnostico.critico = true;
        return Response.json(diagnostico);
      }

      const emp = empresa[0];
      diagnostico.etapas.push({
        etapa: 'Verificação Empresa',
        status: 'OK',
        empresa_nome: emp.nome,
        whatsapp_conectado: emp.whatsapp_conectado,
        evolution_instance_name: emp.evolution_instance_name,
        evolution_url: emp.evolution_url ? 'CONFIGURADA' : 'NÃO CONFIGURADA'
      });

      if (!emp.whatsapp_conectado) {
        diagnostico.alertas.push('⚠️ WhatsApp não marcado como conectado na empresa');
      }
      if (!emp.evolution_instance_name) {
        diagnostico.alertas.push('⚠️ Nome da instância Evolution não configurado');
        diagnostico.critico = true;
      }
    } catch (err) {
      diagnostico.etapas.push({
        etapa: 'Verificação Empresa',
        status: 'ERRO',
        erro: err.message
      });
      diagnostico.critico = true;
    }

    // ──────────────────────────────────────────────────────────────────
    // 2. VERIFICAR CONVERSAS CRIADAS
    // ──────────────────────────────────────────────────────────────────
    try {
      const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
        { empresa_id: empresaId },
        '-created_date',
        10
      );

      diagnostico.etapas.push({
        etapa: 'Conversas Registradas',
        status: 'OK',
        total: conversas?.length || 0,
        ultimas: conversas?.slice(0, 3)?.map(c => ({
          id: c.id,
          cliente_telefone: c.cliente_telefone,
          status: c.status,
          ultima_mensagem: c.ultima_mensagem?.substring(0, 50),
          data_ultima: c.data_ultima_mensagem,
          instancia: c.instancia,
          tipo_conexao: c.tipo_conexao
        }))
      });

      if (!conversas || conversas.length === 0) {
        diagnostico.alertas.push('⚠️ NENHUMA conversa registrada ainda');
      }
    } catch (err) {
      diagnostico.etapas.push({
        etapa: 'Conversas Registradas',
        status: 'ERRO',
        erro: err.message
      });
    }

    // ──────────────────────────────────────────────────────────────────
    // 3. VERIFICAR MENSAGENS CRIADAS
    // ──────────────────────────────────────────────────────────────────
    try {
      const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
        { empresa_id: empresaId },
        '-created_date',
        10
      );

      diagnostico.etapas.push({
        etapa: 'Mensagens Registradas',
        status: 'OK',
        total: mensagens?.length || 0,
        ultimas: mensagens?.slice(0, 3)?.map(m => ({
          id: m.id,
          conversa_id: m.conversa_id,
          remetente: m.remetente,
          tipo_conteudo: m.tipo_conteudo,
          texto: m.texto?.substring(0, 50),
          status: m.status,
          data_envio: m.data_envio
        }))
      });

      if (!mensagens || mensagens.length === 0) {
        diagnostico.alertas.push('🔴 CRÍTICO: Nenhuma mensagem registrada - webhook não está processando');
        diagnostico.critico = true;
      }
    } catch (err) {
      diagnostico.etapas.push({
        etapa: 'Mensagens Registradas',
        status: 'ERRO',
        erro: err.message
      });
    }

    // ──────────────────────────────────────────────────────────────────
    // 4. VERIFICAR LOGS DE WEBHOOK
    // ──────────────────────────────────────────────────────────────────
    try {
      const logs = await base44.asServiceRole.entities.LogRecebimentoWebhook.filter(
        { empresa_id: empresaId },
        '-created_date',
        20
      );

      diagnostico.etapas.push({
        etapa: 'Logs de Webhook',
        status: 'OK',
        total: logs?.length || 0,
        por_tipo: {
          sucesso: logs?.filter(l => l.status === 'sucesso')?.length || 0,
          erro: logs?.filter(l => l.status === 'erro')?.length || 0
        },
        ultimos: logs?.slice(0, 5)?.map(l => ({
          id: l.id,
          tipo_evento: l.tipo_evento,
          telefone: l.telefone,
          status: l.status,
          instancia: l.instancia,
          mensagem_erro: l.mensagem_erro,
          timestamp: l.timestamp
        }))
      });

      if (!logs || logs.length === 0) {
        diagnostico.alertas.push('🔴 CRÍTICO: Nenhum log de webhook - webhook pode não estar conectado');
        diagnostico.critico = true;
      }

      // Verificar erros recentes
      const errosRecentes = logs?.filter(l => l.status === 'erro' && l.created_date > new Date(Date.now() - 3600000));
      if (errosRecentes?.length > 0) {
        diagnostico.alertas.push(`⚠️ ${errosRecentes.length} erros no webhook nos últimos 60 min`);
      }
    } catch (err) {
      diagnostico.etapas.push({
        etapa: 'Logs de Webhook',
        status: 'ERRO',
        erro: err.message
      });
    }

    // ──────────────────────────────────────────────────────────────────
    // 5. VERIFICAR CONTATOS
    // ──────────────────────────────────────────────────────────────────
    try {
      const contatos = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
        { empresa_id: empresaId },
        '-created_date',
        10
      );

      diagnostico.etapas.push({
        etapa: 'Contatos WhatsApp',
        status: 'OK',
        total: contatos?.length || 0,
        ultimos: contatos?.slice(0, 5)?.map(c => ({
          id: c.id,
          telefone: c.telefone,
          nome: c.nome,
          cliente_id: c.cliente_id || 'NÃO VINCULADO',
          ultima_atualizacao: c.ultima_atualizacao
        }))
      });
    } catch (err) {
      diagnostico.etapas.push({
        etapa: 'Contatos WhatsApp',
        status: 'ERRO',
        erro: err.message
      });
    }

    // ──────────────────────────────────────────────────────────────────
    // 6. VERIFICAR URL DO WEBHOOK
    // ──────────────────────────────────────────────────────────────────
    diagnostico.etapas.push({
      etapa: 'URL do Webhook',
      status: 'INFO',
      url: `${req.url.split('/functions')[0]}/functions/receberMensagensWhatsApp`,
      instrucoes: 'Configure esta URL na Evolution API como webhook para mensagens'
    });

    // ──────────────────────────────────────────────────────────────────
    // 7. RESUMO E RECOMENDAÇÕES
    // ──────────────────────────────────────────────────────────────────
    const recomendacoes = [];

    if (diagnostico.critico) {
      recomendacoes.push('🔴 PROBLEMA CRÍTICO DETECTADO - Verifique logs acima');
    }

    const logsEtapa = diagnostico.etapas.find(e => e.etapa === 'Logs de Webhook');
    if (!logsEtapa || logsEtapa.total === 0) {
      recomendacoes.push('1️⃣ Verifique se o webhook está configurado na Evolution API');
      recomendacoes.push('2️⃣ Teste o webhook manualmente: envie um POST para a URL com dados de teste');
      recomendacoes.push('3️⃣ Verifique se EVOLUTION_API_URL e EVOLUTION_API_KEY estão corretos');
    }

    const mensagensEtapa = diagnostico.etapas.find(e => e.etapa === 'Mensagens Registradas');
    if (mensagensEtapa?.total === 0) {
      recomendacoes.push('3️⃣ Mesmo se o webhook recebe, as mensagens podem não estar sendo salvas');
      recomendacoes.push('4️⃣ Verifique os logs de erro da função receberMensagensWhatsApp');
      recomendacoes.push('5️⃣ Teste com a função testarWebhookManual enviando um payload de teste');
    }

    const conversasEtapa = diagnostico.etapas.find(e => e.etapa === 'Conversas Registradas');
    if (conversasEtapa?.total === 0) {
      recomendacoes.push('4️⃣ Nenhuma conversa foi criada - webhook não está processando mensagens');
    }

    diagnostico.recomendacoes = recomendacoes;

    return Response.json(diagnostico);
  } catch (err) {
    return Response.json({ erro: err.message }, { status: 500 });
  }
});