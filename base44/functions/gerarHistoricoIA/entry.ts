import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { tarefa_id } = await req.json();
    if (!tarefa_id) return Response.json({ error: 'tarefa_id obrigatório' }, { status: 400 });

    // Buscar comentários da tarefa
    const comentarios = await base44.entities.ComentarioTarefa.filter(
      { tarefa_id },
      'created_date'
    );

    if (!comentarios || comentarios.length === 0) {
      return Response.json({ historico: [] });
    }

    // Montar texto dos comentários para o prompt
    const textoComentarios = comentarios
      .filter(c => c.mensagem && c.mensagem.trim())
      .map((c, i) => {
        const data = c.created_date ? new Date(c.created_date).toLocaleDateString('pt-BR') : '';
        return `[${i + 1}] ${data} - ${c.usuario_nome || 'Usuário'}: ${c.mensagem}`;
      })
      .join('\n');

    if (!textoComentarios.trim()) {
      return Response.json({ historico: [] });
    }

    const prompt = `Você é um assistente especializado em gestão de tarefas. Analise os comentários abaixo de uma tarefa e extraia apenas as informações RELEVANTES, organizando em um histórico claro e objetivo.

Extraia SOMENTE:
- Solicitações importantes feitas
- Pendências identificadas
- Prazos mencionados
- Decisões tomadas
- Atualizações de status relevantes
- Problemas reportados

IGNORE: conversas informais, cumprimentos, mensagens sem conteúdo relevante, anexos sem contexto.

Para cada item extraído, retorne no formato JSON com os campos:
- data: data no formato DD/MM/AAAA (use a data do comentário original)
- autor: nome de quem fez a observação
- tipo: um de ["solicitacao", "pendencia", "prazo", "decisao", "atualizacao", "problema"]
- descricao: resumo claro e objetivo em português (máximo 150 caracteres)

COMENTÁRIOS DA TAREFA:
${textoComentarios}

Retorne APENAS o JSON, sem explicações adicionais.`;

    const resultado = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          historico: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                data: { type: 'string' },
                autor: { type: 'string' },
                tipo: { type: 'string' },
                descricao: { type: 'string' },
              },
            },
          },
        },
      },
    });

    return Response.json({ historico: resultado?.historico || [] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});