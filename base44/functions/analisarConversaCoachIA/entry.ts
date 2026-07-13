import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const COACH_SCHEMA = {
  type: 'object',
  properties: {
    situacao_tags: { type: 'array', items: { type: 'object', properties: { tipo: { type: 'string', enum: ['red','amber','blue','green','purple'] }, texto: { type: 'string' } } } },
    risco_percentual: { type: 'number' },
    script_ideal: { type: 'string' },
    proximos_passos: { type: 'array', items: { type: 'string' } },
    resumo: { type: 'string' },
    pontos_positivos: { type: 'array', items: { type: 'string' } },
    pontos_perdidos: { type: 'array', items: { type: 'string' } },
    objecoes: { type: 'array', items: { type: 'string' } },
    estagio: { type: 'string' },
    roteiro_mensagens: { type: 'array', items: { type: 'object', properties: { titulo: { type: 'string' }, texto: { type: 'string' } } } },
    script_alternativo: { type: 'string' },
    cadencia: { type: 'array', items: { type: 'object', properties: { status: { type: 'string', enum: ['done','active','pending'] }, titulo: { type: 'string' }, descricao: { type: 'string' }, timing: { type: 'string' } } } },
    acoes_nao_fechou: { type: 'array', items: { type: 'object', properties: { tipo: { type: 'string', enum: ['tag','funil','follow','ligacao','script'] }, label: { type: 'string' }, descricao: { type: 'string' }, tag_class: { type: 'string' } } } },
    base_conhecimento: { type: 'array', items: { type: 'object', properties: { titulo: { type: 'string' }, conteudo: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } } } },
    // Ações reais no funil de vendas
    deve_criar_oportunidade: { type: 'boolean' },
    produto: { type: 'string' },
    titulo_oportunidade: { type: 'string' },
    nova_etapa_nome: { type: 'string' },
    data_proximo_contato: { type: 'string' },
    motivo_proximo_contato: { type: 'string' }
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const { conversa_id, empresa_id, mensagens } = payload;

    if (!conversa_id || !mensagens || !Array.isArray(mensagens)) {
      return Response.json({ error: 'conversa_id e mensagens (array) obrigatórios' }, { status: 400 });
    }

    let conversa = null;
    try { conversa = await base44.asServiceRole.entities.ConversaWhatsapp.get(conversa_id); } catch (_) {}

    const empresaId = empresa_id || conversa?.empresa_id;
    const clienteNome = conversa?.cliente_nome || 'Cliente';
    const clienteTelefone = conversa?.cliente_telefone || '';
    const hoje = new Date().toISOString().split('T')[0];

    let oportunidade = null;
    try {
      const ops = await base44.asServiceRole.entities.Oportunidade.filter({
        empresa_id: empresaId,
        cliente_telefone: clienteTelefone,
        status: 'aberta'
      }, '-updated_date', 1);
      if (ops?.length > 0) oportunidade = ops[0];
    } catch (_) {}

    // Etapas do funil disponíveis para o Coach IA movimentar/criar leads
    let etapas = [];
    if (empresaId) {
      try { etapas = await base44.asServiceRole.entities.EtapaFunil.filter({ empresa_id: empresaId, status: 'ativa' }); } catch (_) {}
    }
    const etapasAbertas = etapas.filter(e => e.tipo === 'aberta').sort((a, b) => a.ordem - b.ordem);
    const nomesEtapasDisponiveis = (oportunidade
      ? etapasAbertas.filter(e => e.produto === oportunidade.produto)
      : etapasAbertas
    ).map(e => e.nome);

    const historico = mensagens.slice(-30).map(m => {
      const quem = m.remetente === 'cliente' ? `🧑 ${clienteNome}` : '💼 Vendedor';
      const conteudo = m.texto || (m.arquivo_nome ? `[Arquivo: ${m.arquivo_nome}]` : '[Mídia]');
      return `${quem}: ${conteudo}`;
    }).join('\n');

    const contextoOportunidade = oportunidade ? `
CONTEXTO CRM:
- Lead: ${oportunidade.cliente_nome || clienteNome}
- Produto: ${oportunidade.produto || 'Não identificado'}
- Etapa do funil: ${oportunidade.etapa_nome || 'Não definida'}
- Valor estimado: R$ ${oportunidade.valor_estimado || 0}
- Status: ${oportunidade.status || 'aberta'}` : '';

    const prompt = `Você é um Coach de Vendas IA especializado em analisar conversas de WhatsApp em tempo real, orientar vendedores E gerenciar o funil de vendas (CRM) automaticamente.

${contextoOportunidade}

HISTÓRICO DA CONVERSA:
${historico}

CONTEXTO DO FUNIL:
- Já existe oportunidade aberta no funil para este cliente? ${oportunidade ? 'Sim' : 'Não'}
- Etapas disponíveis para mover/criar: ${nomesEtapasDisponiveis.join(', ') || 'nenhuma configurada'}
- Data de hoje: ${hoje}

Gere um coaching COMPLETO com TODOS os campos abaixo. Responda em JSON:

1. situacao_tags: array de {tipo:"red"|"amber"|"blue"|"green"|"purple", texto:""} — 3 ou 4 tags
2. risco_percentual: 0 a 100
3. script_ideal: mensagem PRONTA e PERSUASIVA para AGORA
4. proximos_passos: 3-4 ações táticas prioritárias
5. resumo: resumo em 2-4 frases
6. pontos_positivos: 3 acertos do vendedor
7. pontos_perdidos: 3-4 oportunidades perdidas
8. objecoes: array de objeções detectadas
9. estagio: "Prospecção" | "Qualificação" | "Apresentação" | "Proposta" | "Negociação" | "Fechamento"
10. roteiro_mensagens: array de {titulo, texto} com 3-5 mensagens sequenciais
11. script_alternativo: abordagem alternativa
12. cadencia: array de 5-6 passos com {status:"done"|"active"|"pending", titulo, descricao, timing:"Agora"|"D+1"|"D+2"|"Quinta"|"D+3"|"D+7"}. O passo atual da conversa status="active", os anteriores="done", os seguintes="pending".
13. acoes_nao_fechou: array de 4-7 ações automáticas caso o lead não feche com {tipo:"tag"|"funil"|"follow"|"ligacao"|"script", label, descricao, tag_class:"t-r"|"t-a"|"t-p"|"t-b"|"t-g"}.
14. base_conhecimento: array de 4-6 {titulo, conteudo, tags:[]} com informações úteis do conhecimento da empresa relacionadas ao contexto — objeções comuns, scripts, cases, processos, preços.

AÇÕES REAIS NO FUNIL (aja como responsável pelo CRM):
15. deve_criar_oportunidade: true SOMENTE se ainda não existe oportunidade aberta E a conversa demonstra interesse real em consórcio ou empréstimo
16. produto: "consorcio" ou "emprestimo" (string vazia "" se não identificado)
17. titulo_oportunidade: título curto sugerido caso deva criar (ou "" se não aplicável)
18. nova_etapa_nome: nome EXATO de uma das etapas disponíveis acima para mover a oportunidade agora, ou "" para manter a etapa atual
19. data_proximo_contato: data YYYY-MM-DD sugerida para o vendedor ligar/retomar contato com este cliente caso ele esteja parado, ou "" se não necessário
20. motivo_proximo_contato: motivo/assunto sugerido para a próxima ligação, ou "" se não aplicável`;

    const analise = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: COACH_SCHEMA
    });

    // ── Ações reais no funil de vendas ──────────────────────────────────
    let acaoFunil = { criada: false, movida: false, oportunidade_id: oportunidade?.id || null, etapa_nome: oportunidade?.etapa_nome || null };

    if (empresaId && clienteTelefone) {
      // Criar oportunidade se o Coach IA identificou um lead novo
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
            origem: 'WhatsApp (Coach IA)',
            data_cadastro_lead: hoje,
            data_ultima_movimentacao: new Date().toISOString(),
            status: 'aberta'
          });

          await base44.asServiceRole.entities.MovimentacaoFunil.create({
            oportunidade_id: oportunidade.id,
            etapa_destino_id: etapaInicial.id,
            etapa_destino_nome: etapaInicial.nome,
            usuario_id: 'ia',
            usuario_nome: 'Coach IA',
            observacao: 'Lead adicionado automaticamente pelo Coach IA a partir da conversa'
          });

          acaoFunil.criada = true;
          acaoFunil.oportunidade_id = oportunidade.id;
          acaoFunil.etapa_nome = etapaInicial.nome;

          await base44.asServiceRole.entities.NotificacaoIA.create({
            empresa_id: empresaId,
            tipo: 'lead_criado',
            oportunidade_id: oportunidade.id,
            oportunidade_titulo: oportunidade.titulo,
            cliente_nome: clienteNome,
            etapa_nome: etapaInicial.nome,
            mensagem: `A Coach IA adicionou ${clienteNome} ao funil de vendas.`
          });
        }
      }

      // Movimentar card e/ou agendar próximo contato
      if (oportunidade) {
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
              usuario_nome: 'Coach IA'
            });

            acaoFunil.movida = true;
            acaoFunil.etapa_nome = etapaDestino.nome;

            await base44.asServiceRole.entities.NotificacaoIA.create({
              empresa_id: empresaId,
              tipo: 'lead_movimentado',
              oportunidade_id: oportunidade.id,
              oportunidade_titulo: oportunidade.titulo,
              cliente_nome: clienteNome,
              etapa_nome: etapaDestino.nome,
              etapa_origem_nome: oportunidade.etapa_nome || '',
              mensagem: `A Coach IA moveu ${clienteNome} de "${oportunidade.etapa_nome || '-'}" para "${etapaDestino.nome}".`
            });
          }
        } else if (Object.keys(updates).length > 0) {
          await base44.asServiceRole.entities.Oportunidade.update(oportunidade.id, {
            ...updates,
            data_ultima_movimentacao: new Date().toISOString()
          });
        }

        acaoFunil.oportunidade_id = oportunidade.id;
      }
    }

    return Response.json({ success: true, analise, acao_funil: acaoFunil });

  } catch (error) {
    console.error('Erro Coach IA:', error.message);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});