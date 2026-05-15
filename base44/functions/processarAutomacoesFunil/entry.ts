import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Permite chamada por cron (sem usuário) ou por admin
  let isCron = false;
  try {
    const user = await base44.auth.me();
    if (user && !['admin', 'master', 'super_admin'].includes(user.perfil || user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    // chamada via cron sem auth — ok
    isCron = true;
  }

  const logs = [];
  const agora = new Date();

  // 1. Buscar todas automações ativas
  const automacoes = await base44.asServiceRole.entities.AutomacaoFunil.filter({ ativo: true });
  if (!automacoes.length) return Response.json({ ok: true, logs: ['Nenhuma automação ativa'] });

  // 2. Buscar leads abertos
  const oportunidades = await base44.asServiceRole.entities.Oportunidade.filter({ status: 'aberta' });

  // 3. Buscar histórico já enviado (para não reenviar)
  const historicoEnviado = await base44.asServiceRole.entities.HistoricoAutomacao.list('-enviado_em', 5000);

  // Mapa: oportunidade_id + automacao_id -> já enviado?
  const jaEnviado = new Set(
    historicoEnviado.filter(h => h.status === 'enviado').map(h => `${h.oportunidade_id}__${h.automacao_id}`)
  );

  // 4. Buscar conversas WhatsApp para checar se cliente respondeu
  const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({});
  const conversasPorTelefone = {};
  for (const c of conversas) {
    conversasPorTelefone[c.cliente_telefone] = c;
  }

  for (const oport of oportunidades) {
    // Ignorar leads ganhos/perdidos
    if (oport.status !== 'aberta') continue;

    // Data em que o lead entrou na etapa atual
    const dataEntradaEtapa = new Date(oport.data_ultima_movimentacao || oport.created_date || agora);

    // Automações para esta etapa
    const autosDaEtapa = automacoes.filter(
      a => a.etapa_id === oport.etapa_id && a.empresa_id === oport.empresa_id
    );

    for (const auto of autosDaEtapa) {
      const chave = `${oport.id}__${auto.id}`;

      // Já enviou esta automação para este lead?
      if (jaEnviado.has(chave)) continue;

      // Calcular quando deve disparar
      const msParaDisparo = calcularMs(auto.tempo_disparo, auto.tipo_tempo);
      const dataDisparo = new Date(dataEntradaEtapa.getTime() + msParaDisparo);

      // Ainda não chegou a hora?
      if (agora < dataDisparo) continue;

      // Verificar horário de envio preferencial (apenas para disparos não imediatos)
      if (auto.tempo_disparo > 0 && auto.horario_envio) {
        const [hh, mm] = (auto.horario_envio || '08:00').split(':').map(Number);
        const horaAtual = agora.getHours();
        const minAtual = agora.getMinutes();
        // Disparar apenas dentro da janela: horário configurado ±30min
        const minTotalAtual = horaAtual * 60 + minAtual;
        const minTotalConfig = hh * 60 + mm;
        if (Math.abs(minTotalAtual - minTotalConfig) > 30) continue;
      }

      // Verificar se deve parar porque cliente respondeu
      if (auto.parar_se_responder && oport.telefone_lead) {
        const tel = limparTelefone(oport.telefone_lead);
        const conversa = Object.values(conversasPorTelefone).find(c => limparTelefone(c.cliente_telefone) === tel);
        if (conversa?.ultimo_remetente === 'cliente' && conversa?.data_ultima_mensagem) {
          const ultimaResposta = new Date(conversa.data_ultima_mensagem);
          // Se cliente respondeu DEPOIS que o lead entrou na etapa atual, parar
          if (ultimaResposta > dataEntradaEtapa) {
            await base44.asServiceRole.entities.HistoricoAutomacao.create({
              empresa_id: oport.empresa_id,
              oportunidade_id: oport.id,
              oportunidade_titulo: oport.titulo,
              automacao_id: auto.id,
              automacao_nome: auto.nome,
              etapa_id: oport.etapa_id,
              telefone: oport.telefone_lead,
              mensagem_enviada: '',
              enviado_em: agora.toISOString(),
              status: 'ignorado',
              motivo_ignorado: 'Cliente respondeu'
            });
            continue;
          }
        }
      }

      // Resolver variáveis da mensagem
      const mensagemFinal = resolverVariaveis(auto.mensagem, oport);

      // Enviar via WhatsApp
      const telefone = limparTelefone(oport.telefone_lead || oport.cliente_telefone || '');
      if (!telefone) {
        await base44.asServiceRole.entities.HistoricoAutomacao.create({
          empresa_id: oport.empresa_id,
          oportunidade_id: oport.id,
          oportunidade_titulo: oport.titulo,
          automacao_id: auto.id,
          automacao_nome: auto.nome,
          etapa_id: oport.etapa_id,
          telefone: '',
          mensagem_enviada: mensagemFinal,
          enviado_em: agora.toISOString(),
          status: 'ignorado',
          motivo_ignorado: 'Lead sem telefone'
        });
        continue;
      }

      // Buscar empresa para pegar config Evolution
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: oport.empresa_id });
      const empresa = empresas[0];
      if (!empresa?.evolution_url || !empresa?.evolution_api_key || !empresa?.evolution_instance_name) {
        logs.push(`[${oport.titulo}] Empresa sem configuração WhatsApp`);
        continue;
      }

      let statusEnvio = 'enviado';
      let erroDetalhe = '';

      try {
        const payload = {
          number: telefone,
          text: mensagemFinal
        };
        const resp = await fetch(`${empresa.evolution_url}/message/sendText/${empresa.evolution_instance_name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': empresa.evolution_api_key
          },
          body: JSON.stringify(payload)
        });
        if (!resp.ok) {
          const txt = await resp.text();
          throw new Error(`HTTP ${resp.status}: ${txt}`);
        }
        logs.push(`✅ [${oport.titulo}] Automação "${auto.nome}" enviada para ${telefone}`);
      } catch (e) {
        statusEnvio = 'erro';
        erroDetalhe = e.message;
        logs.push(`❌ [${oport.titulo}] Erro: ${e.message}`);
      }

      await base44.asServiceRole.entities.HistoricoAutomacao.create({
        empresa_id: oport.empresa_id,
        oportunidade_id: oport.id,
        oportunidade_titulo: oport.titulo,
        automacao_id: auto.id,
        automacao_nome: auto.nome,
        etapa_id: oport.etapa_id,
        telefone,
        mensagem_enviada: mensagemFinal,
        enviado_em: agora.toISOString(),
        status: statusEnvio,
        erro_detalhe: erroDetalhe
      });
    }
  }

  return Response.json({ ok: true, processados: oportunidades.length, logs });
});

function calcularMs(tempo, tipo) {
  const t = Number(tempo) || 0;
  if (tipo === 'minutos') return t * 60 * 1000;
  if (tipo === 'horas') return t * 60 * 60 * 1000;
  return t * 24 * 60 * 60 * 1000; // dias
}

function limparTelefone(tel) {
  return (tel || '').replace(/\D/g, '');
}

function resolverVariaveis(mensagem, oport) {
  return mensagem
    .replace(/\{\{nome\}\}/gi, oport.cliente_nome || oport.titulo || 'Cliente')
    .replace(/\{\{vendedor\}\}/gi, oport.vendedor_nome || 'Nossa equipe')
    .replace(/\{\{telefone\}\}/gi, oport.telefone_lead || '')
    .replace(/\{\{valorCotacao\}\}/gi, oport.valor_estimado ? `R$ ${Number(oport.valor_estimado).toLocaleString('pt-BR')}` : '');
}