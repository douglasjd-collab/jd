import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const ENTITY_AGENDA = "Agenda";
const ENTITY_OPORTUNIDADES = "Oportunidade";
const ENTITY_DESPESAS = "Despesa";
const ENTITY_RECEITAS = "Receita";

function stripAccents(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeSpaces(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

async function sendTelegram(chat_id, text) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN não configurado");

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
}

// Encontra conta bancária pelo nome (fuzzy matching)
function matchConta(nomeBuscado, contas) {
  if (!nomeBuscado || !contas?.length) return null;
  const needle = stripAccents(nomeBuscado).toLowerCase();
  // Correspondência exata primeiro
  let found = contas.find(c => stripAccents(c.banco || '').toLowerCase() === needle || stripAccents(c.nome_conta || '').toLowerCase() === needle);
  if (found) return found;
  // Correspondência parcial
  found = contas.find(c =>
    stripAccents(c.banco || '').toLowerCase().includes(needle) ||
    stripAccents(c.nome_conta || '').toLowerCase().includes(needle) ||
    needle.includes(stripAccents(c.banco || '').toLowerCase())
  );
  return found || null;
}

async function callOpenAI(message, context) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurado");

  const schema = {
    name: "telegram_crm_action",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: {
          type: "string",
          enum: [
            "create_opportunity",
            "create_expense",
            "create_revenue",
            "create_financial_transaction",
            "create_agenda",
            "reschedule_agenda",
            "cancel_agenda",
            "confirm_agenda",
            "complete_agenda",
            "list_agenda",
            "clarify",
          ],
        },
        opportunity: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
            nome: { type: ["string", "null"] },
            telefone: { type: ["string", "null"] },
            etapa: { type: ["string", "null"] },
            observacao: { type: ["string", "null"] },
          },
          required: ["nome", "telefone", "etapa", "observacao"],
        },
        expense: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
            valor: { type: ["number", "null"] },
            descricao: { type: ["string", "null"] },
            categoria: { type: ["string", "null"] },
            data: { type: ["string", "null"] },
          },
          required: ["valor", "descricao", "categoria", "data"],
        },
        revenue: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
            valor: { type: ["number", "null"] },
            descricao: { type: ["string", "null"] },
            categoria: { type: ["string", "null"] },
            data: { type: ["string", "null"] },
          },
          required: ["valor", "descricao", "categoria", "data"],
        },
        financial_transaction: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
            tipo: { type: ["string", "null"], enum: ["entrada", "saida", null] },
            valor: { type: ["number", "null"] },
            descricao: { type: ["string", "null"] },
            conta_nome: { type: ["string", "null"] },
            categoria: { type: ["string", "null"] },
            data: { type: ["string", "null"] },
          },
          required: ["tipo", "valor", "descricao", "conta_nome", "categoria", "data"],
        },
        agenda: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
            id: { type: ["string", "null"] },
            tipo: { type: ["string", "null"], enum: ["reuniao", "tarefa", null] },
            titulo: { type: ["string", "null"] },
            inicio: { type: ["string", "null"] },
            local: { type: ["string", "null"] },
            descricao: { type: ["string", "null"] },
          },
          required: ["id", "tipo", "titulo", "inicio", "local", "descricao"],
        },
        list: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
            when: { type: ["string", "null"], enum: ["hoje", "amanha", "semana", null] },
          },
          required: ["when"],
        },
        clarify: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
            question: { type: ["string", "null"] },
          },
          required: ["question"],
        },
        reply: { type: "string" },
      },
      required: ["action", "opportunity", "expense", "revenue", "financial_transaction", "agenda", "list", "clarify", "reply"],
    },
  };

  const system = `
Você é um assistente para um CRM/Financeiro via Telegram.
Transforme a mensagem do usuário em UMA ação do sistema.
Regras gerais:
- Se faltar dado essencial, use action="clarify" e pergunte objetivamente.
- Datas: use fuso -03:00 (Brasil). Se o usuário disser "hoje/amanhã", converta para ISO (apenas data YYYY-MM-DD).
- Valores: "35,90" -> 35.90, "1.500" -> 1500, "R$ 1.500,00" -> 1500
- Telefone: normalize apenas números quando possível.
- Categorias de despesa: Almoço, Reunião, Visita externa, Combustível, Escritório, Marketing, Outros
- Categorias de receita: Bônus, Repasse, Comissão, Ajuste, Outros

Regras para transações financeiras com conta bancária (action=create_financial_transaction):
Use esta action quando o usuário mencionar conta bancária (itau, nubank, caixa, bb, santander, bradesco, inter, sicoob, sicredi, safra, c6, pagbank, mercado pago, carteira, etc) junto com uma movimentação de dinheiro.
- Palavras de ENTRADA (tipo=entrada): recebi, entrou, crédito, recebimento, depósito, transferência recebida, pix recebido, comissão, ganho, faturamento
- Palavras de SAÍDA (tipo=saida): paguei, saiu, pix enviado, transferi, debito, despesa, gasto, retirei
- Palavras-chave "pix" sem contexto claro → tipo=saida se houver valor e conta
- conta_nome: extraia o nome do banco mencionado (ex: "itau", "nubank", "caixa")
- Categorias automáticas: comissão→Comissão, aluguel→Despesa Fixa, funcionário→Folha, gasolina→Combustível, cliente→Receita, fornecedor→Fornecedor, Outros
- data: hoje se não especificado (formato YYYY-MM-DD)

- Responda sempre com JSON compatível com o schema.
`;

  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Contexto:\n${JSON.stringify(context)}\n\nMensagem:\n${message}` },
    ],
    response_format: { 
      type: "json_schema",
      json_schema: schema
    },
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI error: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  
  if (!content) throw new Error("OpenAI não retornou conteúdo");

  return JSON.parse(content);
}

function startEndOfToday() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setHours(23, 59, 59, 999);
  return { s, e };
}

function startEndOfTomorrow() {
  const s = new Date(); s.setDate(s.getDate() + 1); s.setHours(0, 0, 0, 0);
  const e = new Date(s); e.setHours(23, 59, 59, 999);
  return { s, e };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const allowedChat = String(Deno.env.get("TELEGRAM_CHAT_ID") || "");
    if (!allowedChat) return Response.json({ error: "TELEGRAM_CHAT_ID não configurado" }, { status: 500 });

    const body = await req.json();
    const msg = body?.message || body?.edited_message;
    if (!msg) return Response.json({ ok: true });

    const chatId = String(msg.chat?.id || "");
    if (chatId !== allowedChat) return Response.json({ ok: true });

    const original = normalizeSpaces(String(msg.text || ""));
    if (!original) return Response.json({ ok: true });

    const clean = stripAccents(original).toLowerCase();

    if (clean === "/start" || clean === "ajuda" || clean === "help" || clean === "/help") {
      await sendTelegram(chatId,
        "🤖 <b>Me diga o que você quer em texto normal</b>\n\n" +
        "💳 <b>Transações com conta bancária:</b>\n" +
        "• <code>recebi 1500 comissão conta itaú</code>\n" +
        "• <code>paguei 800 aluguel conta caixa</code>\n" +
        "• <code>pix 350 cliente João nubank</code>\n\n" +
        "📊 <b>Financeiro simples:</b>\n" +
        "• <code>despesa 35,90 almoço hoje</code>\n" +
        "• <code>receita 1200 comissão hoje</code>\n\n" +
        "👤 <b>CRM:</b>\n" +
        "• <code>criar oportunidade Maria 81999998888</code>\n\n" +
        "📅 <b>Agenda:</b>\n" +
        "• <code>marca reunião amanhã 10h com João</code>\n" +
        "• <code>lista agenda hoje</code>"
      );
      return Response.json({ ok: true });
    }

    const context = {
      now: new Date().toISOString(),
      timezone: "-03:00",
      chat_id: chatId,
    };

    const intent = await callOpenAI(original, context);

    // Buscar colaborador
    let empresaId = 'TELEGRAM_BOT';
    let usuarioId = null;
    
    try {
      const colaboradores = await base44.asServiceRole.entities.Colaborador.filter(
        { status: 'ativo' },
        '-created_date',
        1
      );
      
      if (colaboradores && colaboradores.length > 0) {
        empresaId = colaboradores[0].empresa_id || 'TELEGRAM_BOT';
        usuarioId = colaboradores[0].user_id;
      }
    } catch (err) {
      console.error('Erro ao buscar colaborador:', err);
    }

    if (intent.action === "clarify") {
      await sendTelegram(chatId, `❓ ${intent.clarify?.question || "Me diga mais detalhes, por favor."}`);
      return Response.json({ ok: true });
    }

    if (intent.action === "create_opportunity") {
      const op = intent.opportunity || {};
      if (!op.nome || !op.telefone) {
        await sendTelegram(chatId, "❓ Para criar a oportunidade, preciso de <b>nome</b> e <b>telefone</b>.");
        return Response.json({ ok: true });
      }

      const created = await base44.asServiceRole.entities.Oportunidade.create({
        empresa_id: empresaId,
        cliente_nome: op.nome,
        telefone: op.telefone,
        etapa: op.etapa || "Lead",
        observacao: op.observacao || null,
        usuario_id: usuarioId,
        status: 'ativo',
      });

      await sendTelegram(chatId, `✅ Oportunidade criada: <b>${created.cliente_nome}</b>\n📞 ${created.telefone}\n🏷️ Etapa: <b>${created.etapa}</b>\n<code>ID ${created.id}</code>`);
      return Response.json({ ok: true });
    }

    if (intent.action === "create_expense") {
      const e = intent.expense || {};
      if (!e.valor || !e.descricao || !e.data) {
        await sendTelegram(chatId, "❓ Para lançar despesa, preciso de: <b>valor</b>, <b>descrição</b> e <b>data</b>.");
        return Response.json({ ok: true });
      }

      const created = await base44.asServiceRole.entities.Despesa.create({
        empresa_id: empresaId,
        valor: e.valor,
        descricao: e.descricao,
        categoria: e.categoria || "Outros",
        data: e.data,
        responsavel_id: usuarioId,
        usuario_id: usuarioId,
      });

      await sendTelegram(chatId, `✅ DESPESA criada: <b>R$ ${Number(e.valor).toFixed(2)}</b>\n🧾 ${e.descricao}\n📅 ${e.data}\n<code>ID ${created.id}</code>`);
      return Response.json({ ok: true });
    }

    if (intent.action === "create_revenue") {
      const r = intent.revenue || {};
      if (!r.valor || !r.descricao || !r.data) {
        await sendTelegram(chatId, "❓ Para lançar receita, preciso de: <b>valor</b>, <b>descrição</b> e <b>data</b>.");
        return Response.json({ ok: true });
      }

      const created = await base44.asServiceRole.entities.Receita.create({
        empresa_id: empresaId,
        valor: r.valor,
        descricao: r.descricao,
        categoria: r.categoria || "Outros",
        data: r.data,
        usuario_id: usuarioId,
      });

      await sendTelegram(chatId, `✅ RECEITA criada: <b>R$ ${Number(r.valor).toFixed(2)}</b>\n🧾 ${r.descricao}\n📅 ${r.data}\n<code>ID ${created.id}</code>`);
      return Response.json({ ok: true });
    }

    if (intent.action === "create_financial_transaction") {
      const ft = intent.financial_transaction || {};
      if (!ft.valor || !ft.tipo) {
        await sendTelegram(chatId, "❓ Não identifiquei o <b>valor</b> ou o <b>tipo</b> (entrada/saída). Tente novamente.");
        return Response.json({ ok: true });
      }

      // Buscar contas bancárias da empresa
      const contas = await base44.asServiceRole.entities.ContaBancaria.filter(
        empresaId !== 'TELEGRAM_BOT' ? { empresa_id: empresaId, status: 'ativa' } : { status: 'ativa' },
        'nome_conta', 100
      );

      // Tentar identificar a conta
      let contaEncontrada = matchConta(ft.conta_nome, contas);

      // Se não encontrou a conta, perguntar ao usuário
      if (!contaEncontrada && contas.length > 0) {
        const lista = contas.slice(0, 8).map((c, i) => `${i + 1} - ${c.nome_conta} (${c.banco})`).join('\n');
        await sendTelegram(chatId,
          `❓ Não identifiquei a conta bancária.\n\nEscolha:\n${lista}\n\n` +
          `Responda com o número ou envie novamente mencionando o banco. Ex: <code>conta itaú</code>`
        );
        return Response.json({ ok: true });
      }

      const hoje = new Date().toLocaleDateString('fr-CA'); // YYYY-MM-DD
      const data = ft.data || hoje;
      const descricao = ft.descricao || (ft.tipo === 'entrada' ? 'Receita via Telegram' : 'Despesa via Telegram');
      const categoria = ft.categoria || (ft.tipo === 'entrada' ? 'Outros' : 'Outros');
      const valorNum = Number(ft.valor);

      if (ft.tipo === 'entrada') {
        // Buscar categoria de receita
        let categoriaId = null;
        let categoriaNome = categoria;
        try {
          const cats = await base44.asServiceRole.entities.CategoriaReceita.filter({ empresa_id: empresaId }, null, 50);
          const cat = cats.find(c => stripAccents(c.nome || '').toLowerCase().includes(stripAccents(categoria).toLowerCase())) || cats[0];
          if (cat) { categoriaId = cat.id; categoriaNome = cat.nome; }
        } catch (_) {}

        await base44.asServiceRole.entities.Receita.create({
          empresa_id: empresaId,
          descricao,
          categoria_id: categoriaId || 'telegram',
          categoria_nome: categoriaNome,
          valor: valorNum,
          data,
          status: 'recebida',
          data_recebimento: data,
          origem: 'Telegram',
          conta_bancaria_id: contaEncontrada?.id || null,
          usuario_id: usuarioId,
        });
      } else {
        // Buscar categoria de despesa
        let categoriaId = null;
        let categoriaNome = categoria;
        try {
          const cats = await base44.asServiceRole.entities.CategoriaDespesa.filter({ empresa_id: empresaId }, null, 50);
          const cat = cats.find(c => stripAccents(c.nome || '').toLowerCase().includes(stripAccents(categoria).toLowerCase())) || cats[0];
          if (cat) { categoriaId = cat.id; categoriaNome = cat.nome; }
        } catch (_) {}

        await base44.asServiceRole.entities.Despesa.create({
          empresa_id: empresaId,
          descricao,
          categoria: categoriaNome || 'Outros',
          valor: valorNum,
          data,
          status: 'pago',
          data_pagamento: data,
          observacao: 'Lançado via Telegram',
          conta_bancaria_id: contaEncontrada?.id || null,
          responsavel_id: usuarioId || 'telegram',
          usuario_id: usuarioId,
        });
      }

      // Atualizar saldo da conta bancária
      let novoSaldo = contaEncontrada?.saldo_atual || 0;
      if (ft.tipo === 'entrada') {
        novoSaldo += valorNum;
      } else {
        novoSaldo -= valorNum;
      }
      if (contaEncontrada) {
        await base44.asServiceRole.entities.ContaBancaria.update(contaEncontrada.id, { saldo_atual: novoSaldo });
      }

      const tipoEmoji = ft.tipo === 'entrada' ? '📈 Entrada' : '📉 Saída';
      const contaInfo = contaEncontrada ? `${contaEncontrada.nome_conta} (${contaEncontrada.banco})` : 'Sem conta';
      const valorFmt = valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const saldoFmt = novoSaldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      await sendTelegram(chatId,
        `✅ <b>Transação registrada!</b>\n\n` +
        `${tipoEmoji}\n` +
        `💰 Valor: <b>${valorFmt}</b>\n` +
        `🏦 Conta: <b>${contaInfo}</b>\n` +
        `📝 Descrição: ${descricao}\n` +
        `📅 Data: ${data}\n` +
        (contaEncontrada ? `\n💳 Saldo atual: <b>${saldoFmt}</b>` : '')
      );
      return Response.json({ ok: true });
    }

    if (intent.action === "create_agenda") {
      const a = intent.agenda || {};
      if (!a.tipo || !a.titulo || !a.inicio) {
        await sendTelegram(chatId, "❓ Para agendar, preciso de <b>título</b> e <b>data/hora</b> (ex: amanhã 10h).");
        return Response.json({ ok: true });
      }

      const created = await base44.asServiceRole.entities.Agenda.create({
        empresa_id: empresaId,
        tipo: a.tipo,
        titulo: a.titulo,
        inicio: a.inicio,
        local: a.local || null,
        descricao: a.descricao || null,
        status: "agendado",
        telegram_chat_id: chatId,
        usuario_id: usuarioId,
        usuario_nome: null,
        lembrete_30_enviado_em: null,
        lembrete_10_enviado_em: null,
      });

      await sendTelegram(chatId, `✅ Agendado: <b>${created.titulo}</b>\n📅 ${new Date(created.inicio).toLocaleString("pt-BR")}\n<code>ID ${created.id}</code>`);
      return Response.json({ ok: true });
    }

    if (intent.action === "reschedule_agenda") {
      const a = intent.agenda || {};
      if (!a.id || !a.inicio) {
        await sendTelegram(chatId, "❓ Para remarcar, envie o <b>ID</b> e a <b>nova data/hora</b>.");
        return Response.json({ ok: true });
      }
      const item = await base44.asServiceRole.entities.Agenda.get(a.id);
      if (!item || String(item.telegram_chat_id) !== chatId) {
        await sendTelegram(chatId, "⚠️ Não encontrei esse ID na sua agenda.");
        return Response.json({ ok: true });
      }
      await base44.asServiceRole.entities.Agenda.update(a.id, {
        remarcado_de: item.inicio,
        inicio: a.inicio,
        status: "remarcado",
        lembrete_30_enviado_em: null,
        lembrete_10_enviado_em: null,
      });
      await sendTelegram(chatId, `✅ Remarcado: <b>${item.titulo}</b>\n📅 ${new Date(a.inicio).toLocaleString("pt-BR")}\n<code>ID ${a.id}</code>`);
      return Response.json({ ok: true });
    }

    if (intent.action === "cancel_agenda") {
      const a = intent.agenda || {};
      if (!a.id) {
        await sendTelegram(chatId, "❓ Para cancelar, envie o <b>ID</b>.");
        return Response.json({ ok: true });
      }
      const item = await base44.asServiceRole.entities.Agenda.get(a.id);
      if (!item || String(item.telegram_chat_id) !== chatId) {
        await sendTelegram(chatId, "⚠️ Não encontrei esse ID na sua agenda.");
        return Response.json({ ok: true });
      }
      await base44.asServiceRole.entities.Agenda.update(a.id, { 
        status: "cancelado", 
        cancelado_em: new Date().toISOString() 
      });
      await sendTelegram(chatId, `✅ Cancelado: <b>${item.titulo}</b>\n<code>ID ${a.id}</code>`);
      return Response.json({ ok: true });
    }

    if (intent.action === "confirm_agenda") {
      const a = intent.agenda || {};
      if (!a.id) {
        await sendTelegram(chatId, "❓ Para confirmar, envie o <b>ID</b>.");
        return Response.json({ ok: true });
      }
      const item = await base44.asServiceRole.entities.Agenda.get(a.id);
      if (!item || String(item.telegram_chat_id) !== chatId) {
        await sendTelegram(chatId, "⚠️ Não encontrei esse ID na sua agenda.");
        return Response.json({ ok: true });
      }
      await base44.asServiceRole.entities.Agenda.update(a.id, { status: "confirmado" });
      await sendTelegram(chatId, `✅ Confirmado: <b>${item.titulo}</b>\n<code>ID ${a.id}</code>`);
      return Response.json({ ok: true });
    }

    if (intent.action === "complete_agenda") {
      const a = intent.agenda || {};
      if (!a.id) {
        await sendTelegram(chatId, "❓ Para concluir, envie o <b>ID</b>.");
        return Response.json({ ok: true });
      }
      const item = await base44.asServiceRole.entities.Agenda.get(a.id);
      if (!item || String(item.telegram_chat_id) !== chatId) {
        await sendTelegram(chatId, "⚠️ Não encontrei esse ID na sua agenda.");
        return Response.json({ ok: true });
      }
      await base44.asServiceRole.entities.Agenda.update(a.id, { status: "concluido" });
      await sendTelegram(chatId, `✅ Concluído: <b>${item.titulo}</b>\n<code>ID ${a.id}</code>`);
      return Response.json({ ok: true });
    }

    if (intent.action === "list_agenda") {
      const when = intent.list?.when || "hoje";

      let s, e;
      if (when === "amanha") ({ s, e } = startEndOfTomorrow());
      else ({ s, e } = startEndOfToday());

      const items = await base44.asServiceRole.entities.Agenda.filter({
        telegram_chat_id: chatId,
        inicio: { $gte: s.toISOString(), $lte: e.toISOString() },
        status: { $in: ["agendado", "confirmado", "remarcado"] },
      }, 'inicio', 50);

      if (!items?.length) {
        await sendTelegram(chatId, `📅 <b>Agenda ${when}</b>\nNenhum compromisso.`);
        return Response.json({ ok: true });
      }

      const lines = items.map((it) => {
        const d = new Date(it.inicio);
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return `• <b>${hh}:${mm}</b> (${it.tipo}) <b>${it.titulo}</b> — <code>ID ${it.id}</code>`;
      });

      await sendTelegram(chatId, `📅 <b>Agenda ${when}</b>\n\n${lines.join("\n")}`);
      return Response.json({ ok: true });
    }

    await sendTelegram(chatId, `Não entendi. Digite <code>ajuda</code>.\n\n(Ou mande do seu jeito: "marca reunião amanhã 10h com João")`);
    return Response.json({ ok: true });

  } catch (e) {
    console.error('Erro no webhook:', e);
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
});