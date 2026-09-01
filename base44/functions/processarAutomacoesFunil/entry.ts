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

  // 3. Buscar somente o histórico das oportunidades abertas desta rodada.
  // Evita varrer milhares de registros que não podem gerar um disparo agora.
  const oportunidadeIds = oportunidades.map((o) => o.id).filter(Boolean);
  const historicoEnviado = oportunidadeIds.length
    ? await base44.asServiceRole.entities.HistoricoAutomacao.filter(
        { oportunidade_id: { $in: oportunidadeIds }, status: 'enviado' },
        '-enviado_em',
        5000
      )
    : [];

  // Mapa: oportunidade_id + automacao_id -> já enviado?
  const jaEnviado = new Set(
    historicoEnviado.map(h => `${h.oportunidade_id}__${h.automacao_id}`)
  );

  // 4. Só carrega respostas de clientes posteriores à oportunidade mais antiga
  // ainda aberta. Antes a automação carregava toda a base de conversas.
  const inicioMaisAntigo = oportunidades.reduce((maisAntigo, o) => {
    const data = new Date(o.data_ultima_movimentacao || o.created_date || agora);
    return data < maisAntigo ? data : maisAntigo;
  }, agora);
  const conversas = oportunidades.length
    ? await base44.asServiceRole.entities.ConversaWhatsapp.filter(
        {
          ultimo_remetente: 'cliente',
          data_ultima_mensagem: { $gte: inicioMaisAntigo.toISOString() },
        },
        '-data_ultima_mensagem',
        2000
      )
    : [];
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
            // Mover lead para etapa configurada, se houver
            if (auto.etapa_resposta_id && oport.etapa_id !== auto.etapa_resposta_id) {
              await base44.asServiceRole.entities.Oportunidade.update(oport.id, {
                etapa_id: auto.etapa_resposta_id,
                etapa_nome: auto.etapa_resposta_nome || '',
                data_ultima_movimentacao: agora.toISOString()
              });
              logs.push(`🔀 [${oport.titulo}] Movido para etapa "${auto.etapa_resposta_nome}" por resposta do cliente`);
            }
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
              motivo_ignorado: auto.etapa_resposta_id ? `Cliente respondeu → movido para ${auto.etapa_resposta_nome}` : 'Cliente respondeu'
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

      // Automações do funil usam somente a conexão D-API ativa.
      const conexoes = await base44.asServiceRole.entities.WhatsappConnection.filter(
        { empresa_id: oport.empresa_id, provider_type: 'dapi', is_active: true },
        '-created_date',
        1
      );
      const conexao = conexoes[0];
      if (!conexao) {
        logs.push(`[${oport.titulo}] Empresa sem conexão D-API ativa`);
        continue;
      }

      let statusEnvio = 'enviado';
      let erroDetalhe = '';

      try {
        if (mensagemFinal) {
          await base44.asServiceRole.functions.invoke('whatsappService', {
            connectionId: conexao.id,
            action: 'sendText',
            phoneNumber: telefone,
            text: mensagemFinal,
          });
        }

        if (auto.tipo_midia && auto.tipo_midia !== 'nenhuma' && auto.midia_url) {
          const caption = auto.midia_caption ? resolverVariaveis(auto.midia_caption, oport) : '';
          const payload: any = {
            connectionId: conexao.id,
            phoneNumber: telefone,
            caption,
          };
          if (auto.tipo_midia === 'imagem') {
            payload.action = 'sendImage';
            payload.imageUrl = auto.midia_url;
          } else if (auto.tipo_midia === 'video') {
            payload.action = 'sendVideo';
            payload.videoUrl = auto.midia_url;
          } else if (auto.tipo_midia === 'audio') {
            payload.action = 'sendAudio';
            payload.audioUrl = auto.midia_url;
          }
          if (payload.action) {
            await base44.asServiceRole.functions.invoke('whatsappService', payload);
          }
        }

        logs.push(`✅ [${oport.titulo}] Automação "${auto.nome}" enviada via D-API para ${telefone}`);
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
  const nomeCompleto = oport.cliente_nome || oport.titulo || 'Cliente';
  const primeiroNome = nomeCompleto.split(' ')[0] || 'Cliente';
  const valor = oport.valor_estimado ? `R$ ${Number(oport.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '';

  return mensagem
    .replace(/\{\{nome\}\}/gi, nomeCompleto)
    .replace(/\{\{primeiro_nome\}\}/gi, primeiroNome)
    .replace(/\{\{telefone\}\}/gi, oport.telefone_lead || oport.cliente_telefone || '')
    .replace(/\{\{vendedor\}\}/gi, oport.vendedor_nome || 'Nossa equipe')
    .replace(/\{\{empresa\}\}/gi, oport.empresa_nome || '')
    .replace(/\{\{valor\}\}/gi, valor)
    .replace(/\{\{valorCotacao\}\}/gi, valor)
    .replace(/\{\{produto\}\}/gi, oport.produto || '')
    .replace(/\{\{origem\}\}/gi, oport.origem || '')
    .replace(/\{\{etapa\}\}/gi, oport.etapa_nome || '');
}