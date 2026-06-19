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
    script_alternativo: { type: 'string' }
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

    // Buscar dados da conversa
    let conversa = null;
    try {
      conversa = await base44.asServiceRole.entities.ConversaWhatsapp.get(conversa_id);
    } catch (_) {}

    const clienteNome = conversa?.cliente_nome || 'Cliente';
    const clienteTelefone = conversa?.cliente_telefone || '';

    // Buscar oportunidade associada
    let oportunidade = null;
    try {
      const ops = await base44.asServiceRole.entities.Oportunidade.filter({
        empresa_id: empresa_id || conversa?.empresa_id,
        cliente_telefone: clienteTelefone
      }, '-updated_date', 1);
      if (ops?.length > 0) oportunidade = ops[0];
    } catch (_) {}

    // Montar histórico de mensagens para o prompt
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

    const prompt = `Você é um Coach de Vendas IA especializado em analisar conversas de WhatsApp em tempo real e orientar vendedores.

${contextoOportunidade}

HISTÓRICO DA CONVERSA:
${historico}

Analise profundamente esta conversa e gere um coaching completo. Foque em:
1. O que está acontecendo AGORA na negociação
2. Objeções e resistências do cliente
3. Oportunidades perdidas pelo vendedor
4. Temperatura do lead
5. Próximos passos estratégicos
6. Scripts prontos para o vendedor usar

Responda em JSON com:
- situacao_tags: array de {tipo:"red"|"amber"|"blue"|"green"|"purple", texto:""} — 2 a 4 tags descrevendo a situação atual
- risco_percentual: 0 a 100 — probabilidade de perder o lead se nada for feito AGORA
- script_ideal: mensagem PRONTA e PERSUASIVA que o vendedor deve enviar AGORA, no tom certo, personalizada com o contexto da conversa
- proximos_passos: 3 ações táticas prioritárias para não perder o lead
- resumo: resumo da conversa em 2-4 frases
- pontos_positivos: 3 acertos do vendedor
- pontos_perdidos: 3 oportunidades que o vendedor perdeu
- objecoes: array de objeções que o cliente levantou
- estagio: estágio da negociação (ex: "Prospecção", "Proposta", "Negociação", "Fechamento", "Follow-up")
- roteiro_mensagens: array de {titulo, texto} com 3-5 mensagens sequenciais que o vendedor deve enviar
- script_alternativo: uma abordagem alternativa para o script principal`;

    const resultado = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: COACH_SCHEMA
    });

    return Response.json({ success: true, analise: resultado });

  } catch (error) {
    console.error('Erro Coach IA:', error.message);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});