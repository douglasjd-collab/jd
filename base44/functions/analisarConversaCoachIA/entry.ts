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
    base_conhecimento: { type: 'array', items: { type: 'object', properties: { titulo: { type: 'string' }, conteudo: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } } } }
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

    const clienteNome = conversa?.cliente_nome || 'Cliente';
    const clienteTelefone = conversa?.cliente_telefone || '';

    let oportunidade = null;
    try {
      const ops = await base44.asServiceRole.entities.Oportunidade.filter({
        empresa_id: empresa_id || conversa?.empresa_id,
        cliente_telefone: clienteTelefone
      }, '-updated_date', 1);
      if (ops?.length > 0) oportunidade = ops[0];
    } catch (_) {}

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

14. base_conhecimento: array de 4-6 {titulo, conteudo, tags:[]} com informações úteis do conhecimento da empresa relacionadas ao contexto — objeções comuns, scripts, cases, processos, preços.`;

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