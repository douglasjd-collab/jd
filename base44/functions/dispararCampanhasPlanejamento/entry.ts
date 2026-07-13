import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Mensagens padrão de cada campanha
const MENSAGENS_PADRAO = {
  1: `Olá {nome}! 👋

Sabemos que você está *planejando* a sua compra de consórcio. Que incrível decisão!

Para te ajudar nessa jornada, preparamos um *vídeo explicativo completo* sobre como funciona o consórcio e como ele pode transformar seu sonho em realidade:

🎯 Como funciona o consórcio?
✅ Sem juros — apenas taxa de administração
✅ Você escolhe o prazo que cabe no seu bolso
✅ Contemplação por lance ou sorteio

Qualquer dúvida, estamos à disposição! 😊`,

  2: `Olá {nome}! 🌟

Passadas duas semanas, gostaríamos de reforçar as *principais vantagens* do consórcio para você:

💰 *Sem juros* — muito mais barato que financiamento
📅 *Parcelas fixas* — sem surpresas no orçamento
🏆 *Carta de crédito à vista* — poder de negociação na compra
🔄 *Flexibilidade* — use em imóvel, veículo ou serviços

Sua proposta de *{valor}* continua reservada para você!

Vamos conversar? 🤝`,

  3: `Olá {nome}! 📅

Você sabia que *planejar com antecedência* é a chave para realizar seus sonhos com tranquilidade?

Com o consórcio, você começa a construir seu futuro *hoje*, sem comprometer o orçamento. Enquanto outros pagam juros altos em financiamentos, você investe de forma inteligente.

*Seu plano:*
💡 Entrada: já está investindo mensalmente
🎯 Meta: {valor}
⏳ Resultado: realização do seu sonho com planejamento

Que tal dar o próximo passo? Estamos aqui para ajudar! 🚀`,

  4: `Olá {nome}! 🎉

Esta é a sua *oferta especial de fechamento*!

Você já está no caminho certo há mais de 45 dias planejando sua compra. Chegou a hora de *tornar isso realidade*!

🔥 *Condições especiais disponíveis agora:*
✅ Proposta de {valor} garantida
✅ Condições facilitadas de entrada
✅ Atendimento personalizado

⏰ *Esta oferta é por tempo limitado!*

Entre em contato agora e feche seu consórcio hoje mesmo. Nossa equipe está pronta para te atender!

📱 Responda esta mensagem ou ligue para nós! 💪`
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Buscar todas as empresas com oportunidades em planejamento
    const etaplanejamento = await base44.asServiceRole.entities.EtapaFunil.filter({ tipo: 'planejamento', status: 'ativa' });

    if (etaplanejamento.length === 0) {
      return Response.json({ ok: true, processados: 0, mensagem: 'Nenhuma etapa de planejamento encontrada' });
    }

    const etapaIds = etaplanejamento.map(e => e.id);
    const agora = new Date();
    let totalEnviados = 0;
    let totalErros = 0;

    // Buscar apenas oportunidades de consórcio abertas nessas etapas
    const todasOport = await base44.asServiceRole.entities.Oportunidade.filter({ status: 'aberta', produto: 'consorcio' }, '-created_date', 2000);
    const oportunidades = todasOport.filter(o => etapaIds.includes(o.etapa_id));

    for (const op of oportunidades) {
      const telefone = op.telefone_lead || op.cliente_telefone;
      if (!telefone) continue;

      // Se não tem data de entrada no planejamento, registrar agora e pular (esperar 15 dias)
      if (!op.data_entrada_planejamento) {
        await base44.asServiceRole.entities.Oportunidade.update(op.id, {
          data_entrada_planejamento: agora.toISOString(),
          campanha_planejamento_ultima: 0,
        });
        continue;
      }

      const dataEntrada = new Date(op.data_entrada_planejamento);
      const diasNoPlano = Math.floor((agora - dataEntrada) / (1000 * 60 * 60 * 24));
      const ultimaCampanha = op.campanha_planejamento_ultima || 0;

      // Calcular qual campanha deve ser enviada
      // Campanha 1: após 15 dias de entrada
      // Campanha 2: após 30 dias
      // Campanha 3: após 45 dias
      // Campanha 4: após 60 dias
      let proximaCampanha = null;
      if (ultimaCampanha === 0 && diasNoPlano >= 15) proximaCampanha = 1;
      else if (ultimaCampanha === 1 && diasNoPlano >= 30) proximaCampanha = 2;
      else if (ultimaCampanha === 2 && diasNoPlano >= 45) proximaCampanha = 3;
      else if (ultimaCampanha === 3 && diasNoPlano >= 60) proximaCampanha = 4;

      if (!proximaCampanha) continue;

      const mensagemTemplate = MENSAGENS_PADRAO[proximaCampanha];
      const valorFormatado = op.valor_estimado
        ? `R$ ${Number(op.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : '';
      const mensagem = mensagemTemplate
        .replace(/{nome}/g, op.cliente_nome || op.titulo || 'Prezado(a)')
        .replace(/{valor}/g, valorFormatado);

      try {
        // Buscar conexão D-API ativa da empresa — envios automáticos usam D-API
        const empresaId = op.empresa_id;

        const conexoesDapi = await base44.asServiceRole.entities.WhatsappConnection.filter(
          { empresa_id: empresaId, provider_type: 'dapi', is_active: true },
          '-created_date',
          1
        );
        const conexaoDapi = conexoesDapi[0];
        if (!conexaoDapi) throw new Error('Nenhuma conexão D-API ativa para esta empresa');

        await base44.asServiceRole.functions.invoke('whatsappService', {
          connectionId: conexaoDapi.id,
          action: 'sendText',
          phoneNumber: telefone,
          text: mensagem
        });

        // Registrar log
        await base44.asServiceRole.entities.CampanhaLog.create({
          empresa_id: empresaId,
          oportunidade_id: op.id,
          cliente_nome: op.cliente_nome || op.titulo,
          cliente_telefone: telefone,
          tipo_campanha: `planejamento_compra_${proximaCampanha}`,
          numero_sequencia: proximaCampanha,
          mensagem_enviada: mensagem,
          status: 'enviada',
        });

        // Atualizar oportunidade
        await base44.asServiceRole.entities.Oportunidade.update(op.id, {
          campanha_planejamento_ultima: proximaCampanha,
          campanha_planejamento_data_ultima: agora.toISOString(),
        });

        totalEnviados++;
      } catch (err) {
        totalErros++;
        await base44.asServiceRole.entities.CampanhaLog.create({
          empresa_id: op.empresa_id,
          oportunidade_id: op.id,
          cliente_nome: op.cliente_nome || op.titulo,
          cliente_telefone: telefone,
          tipo_campanha: `planejamento_compra_${proximaCampanha}`,
          numero_sequencia: proximaCampanha,
          mensagem_enviada: mensagem,
          status: 'erro',
          motivo_erro: err.message,
        }).catch(() => {});
      }
    }

    return Response.json({
      ok: true,
      oportunidades_verificadas: oportunidades.length,
      enviados: totalEnviados,
      erros: totalErros,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});