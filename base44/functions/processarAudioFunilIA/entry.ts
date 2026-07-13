import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));

    let mensagem = payload.data;
    if (payload.payload_too_large && payload.event?.entity_id) {
      mensagem = await base44.asServiceRole.entities.MensagemWhatsapp.get(payload.event.entity_id);
    }
    if (!mensagem) {
      return Response.json({ skipped: true, reason: 'sem dados da mensagem' });
    }
    if (mensagem.remetente !== 'cliente' || mensagem.tipo_conteudo !== 'audio') {
      return Response.json({ skipped: true, reason: 'não é áudio de cliente' });
    }
    if (!mensagem.arquivo_url) {
      return Response.json({ skipped: true, reason: 'sem arquivo de áudio ainda' });
    }

    // 1) Transcrever (reaproveita texto já transcrito, senão chama Whisper diretamente)
    let transcricao = mensagem.texto && mensagem.texto !== 'Áudio' ? mensagem.texto : '';
    if (!transcricao) {
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openaiKey) {
        return Response.json({ error: 'OPENAI_API_KEY não configurada' }, { status: 500 });
      }

      const audioRes = await fetch(mensagem.arquivo_url);
      if (!audioRes.ok) {
        return Response.json({ skipped: true, reason: 'falha ao baixar áudio' });
      }
      const audioBuffer = await audioRes.arrayBuffer();
      const contentType = audioRes.headers.get('content-type') || 'audio/ogg';
      let ext = 'ogg';
      if (contentType.includes('webm')) ext = 'webm';
      else if (contentType.includes('mp4') || contentType.includes('m4a')) ext = 'mp4';
      else if (contentType.includes('mpeg') || contentType.includes('mp3')) ext = 'mp3';

      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer], { type: contentType }), `audio.${ext}`);
      formData.append('model', 'whisper-1');
      formData.append('language', 'pt');

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}` },
        body: formData
      });
      if (!whisperRes.ok) {
        return Response.json({ error: 'Whisper falhou' }, { status: 500 });
      }
      const result = await whisperRes.json();
      transcricao = result.text || '';
      if (transcricao) {
        await base44.asServiceRole.entities.MensagemWhatsapp.update(mensagem.id, { texto: transcricao });
      }
    }

    if (!transcricao.trim()) {
      return Response.json({ skipped: true, reason: 'transcrição vazia' });
    }

    // 2) Buscar conversa e oportunidade vinculada
    let conversa = null;
    if (mensagem.conversa_id) {
      try { conversa = await base44.asServiceRole.entities.ConversaWhatsapp.get(mensagem.conversa_id); } catch (_) { /* ignora */ }
    }
    const empresaId = mensagem.empresa_id || conversa?.empresa_id;
    const clienteTelefone = conversa?.cliente_telefone || '';
    const clienteNome = conversa?.cliente_nome || clienteTelefone || 'Cliente';

    if (!empresaId || !clienteTelefone) {
      return Response.json({ skipped: true, reason: 'sem empresa/telefone do cliente', transcricao });
    }

    const oportunidadesExistentes = await base44.asServiceRole.entities.Oportunidade.filter(
      { empresa_id: empresaId, cliente_telefone: clienteTelefone, status: 'aberta' },
      '-data_ultima_movimentacao',
      1
    );
    let oportunidade = oportunidadesExistentes[0] || null;

    const etapas = await base44.asServiceRole.entities.EtapaFunil.filter({ empresa_id: empresaId, status: 'ativa' });
    const etapasAbertas = etapas.filter(e => e.tipo === 'aberta').sort((a, b) => a.ordem - b.ordem);
    const nomesEtapasDisponiveis = (oportunidade
      ? etapasAbertas.filter(e => e.produto === oportunidade.produto)
      : etapasAbertas
    ).map(e => e.nome);

    const hoje = new Date().toISOString().split('T')[0];

    // 3) Analisar com IA
    const prompt = `Você é um assistente de CRM que analisa a transcrição de um áudio enviado por um cliente via WhatsApp e decide ações no funil de vendas.

TRANSCRIÇÃO DO ÁUDIO DO CLIENTE:
"${transcricao}"

CONTEXTO ATUAL:
- Cliente: ${clienteNome}
- Já existe oportunidade no funil? ${oportunidade ? 'Sim' : 'Não'}
${oportunidade ? `- Produto atual: ${oportunidade.produto}\n- Etapa atual: ${oportunidade.etapa_nome}` : ''}
- Etapas disponíveis para mover: ${nomesEtapasDisponiveis.join(', ') || 'nenhuma configurada'}
- Data de hoje: ${hoje}

Responda em JSON com:
- deve_criar_oportunidade: true/false (true SOMENTE se não existe oportunidade ainda E o áudio demonstra interesse real em consórcio ou empréstimo)
- produto: "consorcio" ou "emprestimo" (deixe string vazia "" se não identificado)
- titulo_oportunidade: título curto sugerido caso deva criar (ou "" se não aplicável)
- nova_etapa_nome: nome EXATO de uma das etapas disponíveis acima para mover a oportunidade, ou "" para manter a etapa atual
- resumo: resumo objetivo em 1-2 frases do que o cliente disse, para registrar no histórico do CRM
- data_proximo_contato: data no formato YYYY-MM-DD sugerida para o vendedor retomar contato com este cliente, ou "" se não for necessário
- motivo_proximo_contato: motivo/assunto sugerido para a próxima conversa, ou "" se não aplicável`;

    const analise = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          deve_criar_oportunidade: { type: 'boolean' },
          produto: { type: 'string' },
          titulo_oportunidade: { type: 'string' },
          nova_etapa_nome: { type: 'string' },
          resumo: { type: 'string' },
          data_proximo_contato: { type: 'string' },
          motivo_proximo_contato: { type: 'string' }
        },
        required: ['deve_criar_oportunidade', 'resumo']
      }
    });

    // 4) Criar oportunidade se necessário
    if (!oportunidade && analise.deve_criar_oportunidade && analise.produto) {
      const etapaInicial = etapas
        .filter(e => e.produto === analise.produto && e.tipo === 'aberta')
        .sort((a, b) => a.ordem - b.ordem)[0];

      if (etapaInicial) {
        oportunidade = await base44.asServiceRole.entities.Oportunidade.create({
          empresa_id: empresaId,
          titulo: analise.titulo_oportunidade || `${analise.produto === 'consorcio' ? 'Consórcio' : 'Empréstimo'} - ${clienteNome}`,
          cliente_nome: clienteNome,
          cliente_telefone: clienteTelefone,
          telefone_lead: clienteTelefone,
          produto: analise.produto,
          etapa_id: etapaInicial.id,
          etapa_nome: etapaInicial.nome,
          vendedor_id: conversa?.responsavel_id || conversa?.usuario_responsavel_id || '',
          vendedor_nome: conversa?.responsavel_nome || conversa?.usuario_responsavel_nome || '',
          origem: 'WhatsApp (Áudio - IA)',
          data_cadastro_lead: hoje,
          data_ultima_movimentacao: new Date().toISOString(),
          status: 'aberta'
        });

        await base44.asServiceRole.entities.MovimentacaoFunil.create({
          oportunidade_id: oportunidade.id,
          etapa_destino_id: etapaInicial.id,
          etapa_destino_nome: etapaInicial.nome,
          usuario_id: 'ia',
          usuario_nome: 'Assistente IA',
          observacao: 'Lead adicionado automaticamente pela IA a partir de um áudio do cliente'
        });

        await base44.asServiceRole.entities.NotificacaoIA.create({
          empresa_id: empresaId,
          tipo: 'lead_criado',
          oportunidade_id: oportunidade.id,
          oportunidade_titulo: oportunidade.titulo,
          cliente_nome: clienteNome,
          etapa_nome: etapaInicial.nome,
          mensagem: `A IA adicionou ${clienteNome} ao funil de vendas a partir de um áudio.`
        });
      }
    }

    if (!oportunidade) {
      return Response.json({ success: true, transcricao, acao: 'sem_oportunidade' });
    }

    // 5) Mover etapa se sugerido e atualizar próximo contato
    const updates = {};
    if (analise.data_proximo_contato) updates.data_proximo_contato = analise.data_proximo_contato;
    if (analise.motivo_proximo_contato) updates.motivo_proximo_contato = analise.motivo_proximo_contato;

    if (analise.nova_etapa_nome && analise.nova_etapa_nome !== oportunidade.etapa_nome) {
      const etapaDestino = etapas.find(e => e.nome === analise.nova_etapa_nome);
      if (etapaDestino) {
        await base44.asServiceRole.entities.Oportunidade.update(oportunidade.id, {
          ...updates,
          etapa_id: etapaDestino.id,
          etapa_nome: etapaDestino.nome,
          data_ultima_movimentacao: new Date().toISOString(),
          status: etapaDestino.tipo === 'ganho' ? 'ganha' : etapaDestino.tipo === 'perdida' ? 'perdida' : 'aberta'
        });

        await base44.asServiceRole.entities.MovimentacaoFunil.create({
          oportunidade_id: oportunidade.id,
          etapa_origem_id: oportunidade.etapa_id,
          etapa_origem_nome: oportunidade.etapa_nome,
          etapa_destino_id: etapaDestino.id,
          etapa_destino_nome: etapaDestino.nome,
          usuario_id: 'ia',
          usuario_nome: 'Assistente IA'
        });

        await base44.asServiceRole.entities.NotificacaoIA.create({
          empresa_id: empresaId,
          tipo: 'lead_movimentado',
          oportunidade_id: oportunidade.id,
          oportunidade_titulo: oportunidade.titulo,
          cliente_nome: clienteNome,
          etapa_nome: etapaDestino.nome,
          etapa_origem_nome: oportunidade.etapa_nome || '',
          mensagem: `A IA moveu ${clienteNome} de "${oportunidade.etapa_nome || '-'}" para "${etapaDestino.nome}" a partir de um áudio.`
        });
      }
    } else if (Object.keys(updates).length > 0) {
      await base44.asServiceRole.entities.Oportunidade.update(oportunidade.id, {
        ...updates,
        data_ultima_movimentacao: new Date().toISOString()
      });
    }

    // 6) Registrar no histórico (comentário da oportunidade)
    const partesComentario = [`🎙️ Áudio do cliente: "${transcricao}"`, `📝 Resumo: ${analise.resumo}`];
    if (analise.motivo_proximo_contato) {
      partesComentario.push(`📅 Próximo contato sugerido: ${analise.data_proximo_contato || 'a definir'} — ${analise.motivo_proximo_contato}`);
    }

    await base44.asServiceRole.entities.ComentarioOportunidade.create({
      oportunidade_id: oportunidade.id,
      usuario_id: 'ia',
      usuario_nome: 'Assistente IA',
      mensagem: partesComentario.join('\n\n'),
      tipo: 'comentario'
    });

    return Response.json({ success: true, transcricao, analise, oportunidade_id: oportunidade.id });
  } catch (error) {
    console.error('Erro processarAudioFunilIA:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});