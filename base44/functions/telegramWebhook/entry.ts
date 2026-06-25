import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

// Sessões persistidas no banco (TelegramSession) — sobrevivem a restarts
async function sessionGet(base44, key) {
  try {
    const rows = await base44.asServiceRole.entities.TelegramSession.filter({ session_key: key }, '-created_date', 1);
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    // Verificar expiração
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      await base44.asServiceRole.entities.TelegramSession.delete(row.id);
      return null;
    }
    return JSON.parse(row.session_data);
  } catch (_) { return null; }
}

async function sessionSet(base44, key, value) {
  try {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
    const rows = await base44.asServiceRole.entities.TelegramSession.filter({ session_key: key }, '-created_date', 1);
    if (rows && rows.length > 0) {
      await base44.asServiceRole.entities.TelegramSession.update(rows[0].id, {
        session_data: JSON.stringify(value),
        expires_at: expiresAt,
      });
    } else {
      const chatId = key.split('_').pop();
      await base44.asServiceRole.entities.TelegramSession.create({
        chat_id: chatId,
        session_key: key,
        session_data: JSON.stringify(value),
        expires_at: expiresAt,
      });
    }
  } catch (_) {}
}

async function sessionDelete(base44, key) {
  try {
    const rows = await base44.asServiceRole.entities.TelegramSession.filter({ session_key: key }, '-created_date', 1);
    if (rows && rows.length > 0) {
      await base44.asServiceRole.entities.TelegramSession.delete(rows[0].id);
    }
  } catch (_) {}
}

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

async function sendTelegram(chat_id, text, reply_markup = null) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN não configurado");

  const payload = {
    chat_id,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (reply_markup) payload.reply_markup = reply_markup;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function answerCallback(callback_query_id, text = "") {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id, text }),
  });
}

function buildContasKeyboard(contas, prefixo) {
  // Botões em linhas de 1 por vez para ficar legível
  const inline_keyboard = contas.map((c) => ([{
    text: `🏦 ${c.nome_conta} (${c.banco})`,
    callback_data: `${prefixo}:${c.id}`,
  }]));
  return { inline_keyboard };
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

async function callLLM(base44, message, context, configRobo = null) {
  const hoje = new Date().toLocaleDateString('fr-CA'); // YYYY-MM-DD

  // Calcular "amanhã" corretamente no fuso Brasil
  const amanhaDate = new Date();
  amanhaDate.setDate(amanhaDate.getDate() + 1);
  const amanha = amanhaDate.toLocaleDateString('fr-CA');

  // Categorias customizadas (se configuradas)
  const catDespesa = configRobo?.categorias_despesa || 'Almoço, Reunião, Visita externa, Combustível, Escritório, Marketing, Outros';
  const catReceita = configRobo?.categorias_receita || 'Bônus, Repasse, Comissão, Ajuste, Outros';
  const promptAdicional = (configRobo?.ativo && configRobo?.prompt_adicional) ? `\n\nINSTRUÇÕES CUSTOMIZADAS:\n${configRobo.prompt_adicional}` : '';

  const prompt = `
Você é um assistente para um CRM/Financeiro via Telegram.
Transforme a mensagem do usuário em UMA ação do sistema.

Contexto: ${JSON.stringify(context)}
Data de hoje (Brasil/Brasília, UTC-3): ${hoje}
Data de amanhã (Brasil/Brasília, UTC-3): ${amanha}

Mensagem do usuário: "${message}"

Regras gerais:
- Se faltar dado essencial, use action="clarify" e pergunte objetivamente.
- Datas: se o usuário disser "hoje" use ${hoje}, "amanhã" use ${amanha}. Formato YYYY-MM-DD.
- Valores: "35,90" -> 35.90, "1.500" -> 1500, "R$ 1.500,00" -> 1500
- Telefone: normalize apenas números quando possível.
- Categorias de despesa: ${catDespesa}
- Categorias de receita: ${catReceita}
- Para oportunidades no funil: produto pode ser "consorcio" (padrão) ou "emprestimo". nome = título da oportunidade (ex: "João Silva" ou "Venda consórcio João"). Telefone opcional.
- Use action=create_opportunity quando o usuário mencionar: criar lead, novo cliente, nova oportunidade, funil, consórcio (nome de pessoa), empréstimo (nome de pessoa)${promptAdicional}

REGRA CRÍTICA PARA HORÁRIOS (agenda):
- O usuário está no fuso horário de Brasília (UTC-3).
- Quando o usuário diz "20h", "às 20:00", "20 horas" etc., o horário correto em UTC é 20h + 3h = 23h UTC.
- PORTANTO: sempre converta o horário mencionado pelo usuário (horário de Brasília) para UTC somando 3 horas.
- Exemplos: "20h" → UTC 23:00 | "10h" → UTC 13:00 | "14h" → UTC 17:00 | "8h" → UTC 11:00
- O campo "inicio" deve ser formato ISO 8601 em UTC: "YYYY-MM-DDTHH:MM:00.000Z"
- Exemplo: usuário diz "amanhã às 20h" → inicio: "${amanha}T23:00:00.000Z"

Regras para transações financeiras com conta bancária (action=create_financial_transaction):
Use esta action quando o usuário mencionar conta bancária (itau, nubank, caixa, bb, santander, bradesco, inter, sicoob, sicredi, safra, c6, pagbank, mercado pago, carteira, etc) junto com uma movimentação de dinheiro.
- Palavras de ENTRADA (tipo=entrada): recebi, entrou, crédito, recebimento, depósito, transferência recebida, pix recebido, comissão, ganho, faturamento
- Palavras de SAÍDA (tipo=saida): paguei, saiu, pix enviado, transferi, debito, despesa, gasto, retirei
- conta_nome: extraia o nome do banco mencionado (ex: "itau", "nubank", "caixa")
- data: hoje se não especificado (formato YYYY-MM-DD)

Regras para adiantamento (action=create_advance):
Use quando o usuário mencionar: adiantamento, adianta, adiantar <nome>, com palavras-chave "vendedor", "colaborador", "funcionário"
- colaborador_nome: nome do vendedor/colaborador/funcionário
- valor: valor do adiantamento
- data: data do adiantamento (hoje se não especificado, formato YYYY-MM-DD)

Retorne APENAS um JSON com esta estrutura exata (sem texto adicional):
{
  "action": "create_opportunity" | "create_expense" | "create_revenue" | "create_financial_transaction" | "create_advance" | "create_agenda" | "reschedule_agenda" | "cancel_agenda" | "confirm_agenda" | "complete_agenda" | "list_agenda" | "clarify",
  "opportunity": { "nome": string|null, "telefone": string|null, "produto": "consorcio"|"emprestimo"|null, "valor": number|null, "observacao": string|null } | null,
  "expense": { "valor": number|null, "descricao": string|null, "categoria": string|null, "data": string|null } | null,
  "revenue": { "valor": number|null, "descricao": string|null, "categoria": string|null, "data": string|null } | null,
  "financial_transaction": { "tipo": "entrada"|"saida"|null, "valor": number|null, "descricao": string|null, "conta_nome": string|null, "categoria": string|null, "data": string|null } | null,
  "advance": { "colaborador_nome": string|null, "valor": number|null, "data": string|null, "descricao": string|null } | null,
  "agenda": { "id": string|null, "tipo": "reuniao"|"tarefa"|null, "titulo": string|null, "inicio": string|null, "local": string|null, "descricao": string|null } | null,
  "list": { "when": "hoje"|"amanha"|"semana"|null } | null,
  "clarify": { "question": string|null } | null,
  "reply": string
}
`;

  const raw = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt });

  // O LLM retorna string — extrair o JSON
  let result;
  try {
    // Tenta extrair bloco ```json ... ``` ou JSON puro
    const match = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
    result = JSON.parse(match ? match[1] : raw);
  } catch (_) {
    // fallback: não conseguiu parsear
    result = { action: "clarify", clarify: { question: "Não entendi. Pode reformular?" }, reply: raw };
  }

  return result;
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

    // ── Callback de botão (seleção de conta) ──────────────────────────────
    if (body?.callback_query) {
      const cq = body.callback_query;
      const chatId = String(cq.message?.chat?.id || "");
      if (chatId !== allowedChat) {
        await answerCallback(cq.id);
        return Response.json({ ok: true });
      }

      const data = cq.data || "";

      // ── Fluxo de status de despesa (quitada/agendada) ─────────────────────
      if (data === "despesa_quitada" || data === "despesa_agendada") {
        const session = await sessionGet(base44, `despesa_status_${chatId}`);
        if (!session) {
          await answerCallback(cq.id, "⚠️ Sessão expirada");
          return Response.json({ ok: true });
        }

        if (data === "despesa_quitada") {
          await answerCallback(cq.id, "✅ Agora selecione a conta...");
          
          const contas = await base44.asServiceRole.entities.ContaBancaria.filter(
            { empresa_id: session.empresaId, status: 'ativa' },
            'nome_conta', 20
          );

          if (!contas || contas.length === 0) {
            await sendTelegram(chatId, "⚠️ Nenhuma conta bancária cadastrada para a empresa.");
            await sessionDelete(base44, `despesa_status_${chatId}`);
            return Response.json({ ok: true });
          }

          await sessionSet(base44, `conta_${chatId}`, {
            tipo: 'despesa_quitada',
            empresaId: session.empresaId,
            usuarioId: session.usuarioId,
            contas,
            data: session.data,
          });
          await sessionDelete(base44, `despesa_status_${chatId}`);

          await sendTelegram(chatId,
            `🏦 Em qual conta foi pago?`,
            buildContasKeyboard(contas, 'conta_despesa')
          );
        } else {
          await answerCallback(cq.id, "📅 Informe a data de vencimento");
          await sessionSet(base44, `despesa_vencimento_${chatId}`, session);
          await sessionDelete(base44, `despesa_status_${chatId}`);
          
          await sendTelegram(chatId, "📅 Em que data vence? (formato: DD/MM/YYYY ou ex: amanhã, próxima segunda)");
        }
        return Response.json({ ok: true });
      }

      // ── Fluxo de tipo de adiantamento (funcionário/vendedor) ──────────────
      if (data === "adv_funcionario" || data === "adv_vendedor") {
        const session = await sessionGet(base44, `adiantamento_tipo_${chatId}`);
        if (!session) {
          await answerCallback(cq.id, "⚠️ Sessão expirada");
          return Response.json({ ok: true });
        }

        await answerCallback(cq.id, "✅ Carregando lista...");
        
        // Guardar tipo
        session.tipo = data === "adv_funcionario" ? "funcionario" : "vendedor";
        
        // Buscar empresa JD Promotora
        let jdEmpresaId = null;
        try {
          const empresas = await base44.asServiceRole.entities.Empresa.filter(
            { nome: { $regex: "JD Promotora", $options: "i" } },
            '-created_date',
            1
          );
          if (empresas && empresas.length > 0) {
            jdEmpresaId = empresas[0].id;
          }
        } catch (_) {}

        if (!jdEmpresaId) {
          await sendTelegram(chatId, "⚠️ Empresa JD Promotora não encontrada.");
          await sessionDelete(base44, `adiantamento_tipo_${chatId}`);
          return Response.json({ ok: true });
        }

        let lista = [];
        if (session.tipo === "funcionario") {
          try {
            lista = await base44.asServiceRole.entities.Colaborador.filter(
              { empresa_id: jdEmpresaId, status: 'ativo' },
              'nome', 50
            );
          } catch (_) {}
        } else {
          try {
            lista = await base44.asServiceRole.entities.FuncionarioColaborador.filter(
              { empresa_id: jdEmpresaId, status: 'Ativo' },
              'nome', 50
            );
          } catch (_) {}
        }

        if (!lista || lista.length === 0) {
          const tipoLabel = session.tipo === "funcionario" ? "funcionários" : "vendedores";
          await sendTelegram(chatId, `⚠️ Nenhum ${tipoLabel} encontrado.`);
          await sessionDelete(base44, `adiantamento_tipo_${chatId}`);
          return Response.json({ ok: true });
        }

        // Guardar lista na sessão
        session.lista = lista;
        await sessionSet(base44, `adiantamento_selecao_${chatId}`, session);
        await sessionDelete(base44, `adiantamento_tipo_${chatId}`);

        // Criar keyboard com botões de seleção
        const inline_keyboard = lista.slice(0, 10).map(item => ([{
          text: item.nome,
          callback_data: `adv_select:${item.id}`,
        }]));

        const tipoLabel = session.tipo === "funcionario" ? "Funcionário" : "Vendedor";
        await sendTelegram(chatId, `👤 Selecione o ${tipoLabel}:`, { inline_keyboard });
        return Response.json({ ok: true });
      }

      // ── Seleção de funcionário/vendedor ──────────────────────────────────
      if (data.startsWith("adv_select:")) {
        const colaboradorId = data.split(":")[1];
        const session = await sessionGet(base44, `adiantamento_selecao_${chatId}`);
        
        if (!session) {
          await answerCallback(cq.id, "⚠️ Sessão expirada");
          return Response.json({ ok: true });
        }

        const encontrado = session.lista.find(c => c.id === colaboradorId);
        if (!encontrado) {
          await answerCallback(cq.id, "❓ Pessoa não encontrada");
          return Response.json({ ok: true });
        }

        await answerCallback(cq.id, "✅ Selecionado");

        // Guardar pessoa selecionada e solicitar valor
        session.colaborador_id = encontrado.id;
        session.colaborador_nome = encontrado.nome;
        await sessionSet(base44, `adiantamento_valor_${chatId}`, session);
        await sessionDelete(base44, `adiantamento_selecao_${chatId}`);

        await sendTelegram(chatId, `✅ ${encontrado.nome}\n\n💰 Qual é o <b>valor</b> do adiantamento?\n\n(exemplo: 100,00 ou 500)`);
        return Response.json({ ok: true });
      }

      // ── Fluxo de status de receita (recebida/agendada) ───────────────────
      if (data === "receita_recebida" || data === "receita_agendada") {
        const session = await sessionGet(base44, `receita_status_${chatId}`);
        if (!session) {
          await answerCallback(cq.id, "⚠️ Sessão expirada");
          return Response.json({ ok: true });
        }

        if (data === "receita_recebida") {
          await answerCallback(cq.id, "✅ Agora selecione a conta...");
          
          const contas = await base44.asServiceRole.entities.ContaBancaria.filter(
            { empresa_id: session.empresaId, status: 'ativa' },
            'nome_conta', 20
          );

          if (!contas || contas.length === 0) {
            await sendTelegram(chatId, "⚠️ Nenhuma conta bancária cadastrada para a empresa.");
            await sessionDelete(base44, `receita_status_${chatId}`);
            return Response.json({ ok: true });
          }

          await sessionSet(base44, `conta_${chatId}`, {
            tipo: 'receita_recebida',
            empresaId: session.empresaId,
            usuarioId: session.usuarioId,
            contas,
            data: session.data,
          });
          await sessionDelete(base44, `receita_status_${chatId}`);

          await sendTelegram(chatId,
            `🏦 Em qual conta foi recebido?`,
            buildContasKeyboard(contas, 'conta_receita')
          );
        } else {
          await answerCallback(cq.id, "📅 Informe a data prevista");
          await sessionSet(base44, `receita_vencimento_${chatId}`, session);
          await sessionDelete(base44, `receita_status_${chatId}`);
          
          await sendTelegram(chatId, "📅 Em que data será recebida? (formato: DD/MM/YYYY ou ex: amanhã, próxima segunda)");
        }
        return Response.json({ ok: true });
      }

      // ── Seleção de conta (conta_despesa:<contaId> ou conta_receita:<contaId>) ──
      if (data.startsWith("conta_despesa:") || data.startsWith("conta_receita:")) {
        const colonIdx = data.indexOf(":");
        const tipoConta = data.substring(0, colonIdx); // "conta_despesa" ou "conta_receita"
        const contaId = data.substring(colonIdx + 1);
        const sessionKey = `conta_${chatId}`;
        const session = await sessionGet(base44, sessionKey);

        await answerCallback(cq.id, "✅ Conta selecionada!");

        if (!session) {
          await sendTelegram(chatId, "⚠️ Sessão expirada. Lance novamente a transação.");
          return Response.json({ ok: true });
        }

        await sessionDelete(base44, sessionKey);
        const contaSelecionada = session.contas.find(c => c.id === contaId);

        if (!contaSelecionada) {
          await sendTelegram(chatId, "⚠️ Conta não encontrada. Tente novamente.");
          return Response.json({ ok: true });
        }

        if (tipoConta === 'conta_despesa') {
          const ex = session.data;
          let responsavelNome = 'Telegram Bot';
          try {
            const colabs = await base44.asServiceRole.entities.Colaborador.filter({ user_id: session.usuarioId }, null, 1);
            if (colabs.length > 0) responsavelNome = colabs[0].nome || responsavelNome;
          } catch (_) {}

          const created = await base44.asServiceRole.entities.Despesa.create({
            empresa_id: session.empresaId,
            valor: Number(ex.valor),
            descricao: ex.descricao,
            categoria: ex.categoria || 'Outros',
            data: ex.data,
            data_vencimento: ex.data,
            status: 'pago',
            data_pagamento: ex.data,
            responsavel_id: session.usuarioId || 'telegram',
            responsavel_nome: responsavelNome,
            usuario_id: session.usuarioId,
            usuario_nome: responsavelNome,
            observacao: 'Lançado via Telegram',
            conta_bancaria_id: contaSelecionada.id,
          });

          let novoSaldo = contaSelecionada.saldo_atual || 0;
          novoSaldo -= Number(ex.valor);
          await base44.asServiceRole.entities.ContaBancaria.update(contaSelecionada.id, { saldo_atual: novoSaldo });

          const valorFmt = Number(ex.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          const saldoFmt = novoSaldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          await sendTelegram(chatId,
            `✅ <b>Despesa lançada!</b>\n\n` +
            `📉 ${ex.descricao}\n` +
            `💰 Valor: <b>${valorFmt}</b>\n` +
            `📅 Data: ${ex.data}\n` +
            `🏦 Conta: <b>${contaSelecionada.nome_conta} (${contaSelecionada.banco})</b>\n` +
            `💳 Saldo: <b>${saldoFmt}</b>\n` +
            `🏷️ Categoria: ${ex.categoria || 'Outros'}\n` +
            `<code>ID ${created.id}</code>`
          );
          return Response.json({ ok: true });
        }

        if (tipoConta === 'conta_receita') {
          const r = session.data;
          const created = await base44.asServiceRole.entities.Receita.create({
            empresa_id: session.empresaId,
            valor: Number(r.valor),
            descricao: r.descricao,
            categoria_id: r.categoria_id || 'telegram',
            categoria_nome: r.categoria || 'Outros',
            data: r.data,
            status: 'recebida',
            data_recebimento: r.data,
            origem: 'Telegram',
            usuario_id: session.usuarioId,
            conta_bancaria_id: contaSelecionada.id,
          });

          let novoSaldo = contaSelecionada.saldo_atual || 0;
          novoSaldo += Number(r.valor);
          await base44.asServiceRole.entities.ContaBancaria.update(contaSelecionada.id, { saldo_atual: novoSaldo });

          const valorFmt = Number(r.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          const saldoFmt = novoSaldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          await sendTelegram(chatId,
            `✅ <b>Receita lançada!</b>\n\n` +
            `📈 ${r.descricao}\n` +
            `💰 Valor: <b>${valorFmt}</b>\n` +
            `📅 Data: ${r.data}\n` +
            `🏦 Conta: <b>${contaSelecionada.nome_conta} (${contaSelecionada.banco})</b>\n` +
            `💳 Saldo: <b>${saldoFmt}</b>\n` +
            `🏷️ Categoria: ${r.categoria || 'Outros'}\n` +
            `<code>ID ${created.id}</code>`
          );
          return Response.json({ ok: true });
        }

        return Response.json({ ok: true });
      }

      await answerCallback(cq.id);
      return Response.json({ ok: true });
    }
    // ─────────────────────────────────────────────────────────────────────

    const msg = body?.message || body?.edited_message;
    if (!msg) return Response.json({ ok: true });

    const chatId = String(msg.chat?.id || "");
    if (chatId !== allowedChat) return Response.json({ ok: true });

    const original = normalizeSpaces(String(msg.text || ""));
    if (!original) return Response.json({ ok: true });

    const clean = stripAccents(original).toLowerCase();

    // ──────────────────────────────────────────────────────────────────────
    // VERIFICAR SESSÕES DE ADIANTAMENTO PENDENTES (ANTES DO LLM)
    // ──────────────────────────────────────────────────────────────────────
    


    // ── Fluxo de valor de adiantamento
    const sessaoAdvValor = await sessionGet(base44, `adiantamento_valor_${chatId}`);
    if (sessaoAdvValor) {
      // Parsear valor
      const valorMatch = original.match(/[\d.,]+/);
      if (!valorMatch) {
        await sendTelegram(chatId, "❓ Valor inválido. Digite um número (ex: 100 ou 100,50)");
        return Response.json({ ok: true });
      }

      let valor = parseFloat(valorMatch[0].replace(',', '.'));
      if (isNaN(valor) || valor <= 0) {
        await sendTelegram(chatId, "❓ Valor deve ser maior que zero.");
        return Response.json({ ok: true });
      }

      // Guardar valor e solicitar descrição
      sessaoAdvValor.valor = valor;
      await sessionSet(base44, `adiantamento_descricao_${chatId}`, sessaoAdvValor);
      await sessionDelete(base44, `adiantamento_valor_${chatId}`);

      const valorFmt = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      await sendTelegram(chatId, `✅ Valor: ${valorFmt}\n\n📝 Qual é a <b>descrição/motivo</b> do adiantamento?\n\n(exemplo: Adiantamento salarial, Emergência, etc)`);
      return Response.json({ ok: true });
    }

    // ── Fluxo de descrição de adiantamento
    const sessaoAdvDesc = await sessionGet(base44, `adiantamento_descricao_${chatId}`);
    if (sessaoAdvDesc) {
      const descricao = original.trim();
      sessaoAdvDesc.descricao = descricao;
      await sessionDelete(base44, `adiantamento_descricao_${chatId}`);

      // Buscar empresa JD Promotora
      let jdEmpresaId = null;
      try {
        const empresas = await base44.asServiceRole.entities.Empresa.filter(
          { nome: { $regex: "JD Promotora", $options: "i" } },
          '-created_date',
          1
        );
        if (empresas && empresas.length > 0) {
          jdEmpresaId = empresas[0].id;
        }
      } catch (_) {}

      if (!jdEmpresaId) {
        await sendTelegram(chatId, "⚠️ Empresa JD Promotora não encontrada.");
        return Response.json({ ok: true });
      }

      const tipoLabel = sessaoAdvDesc.tipo === "funcionario" ? "Funcionário" : "Vendedor";
      const hoje = new Date().toLocaleDateString('fr-CA');

      // Criar adiantamento
      let adiantamentoId = null;
      if (sessaoAdvDesc.tipo === "funcionario") {
        const adData = await base44.asServiceRole.entities.AdiantamentoFuncionario.create({
          empresa_id: jdEmpresaId,
          colaborador_id: sessaoAdvDesc.colaborador_id,
          colaborador_nome: sessaoAdvDesc.colaborador_nome,
          valor: sessaoAdvDesc.valor,
          data: hoje,
          descricao: sessaoAdvDesc.descricao,
          status: 'Pendente',
        });
        adiantamentoId = adData.id;
      } else {
        const adData = await base44.asServiceRole.entities.Adiantamento.create({
          empresa_id: jdEmpresaId,
          colaborador_id: sessaoAdvDesc.colaborador_id,
          colaborador_nome: sessaoAdvDesc.colaborador_nome,
          valor: sessaoAdvDesc.valor,
          data: hoje,
          descricao: sessaoAdvDesc.descricao,
          status: 'solicitado',
        });
        adiantamentoId = adData.id;
      }

      // Lançar como Despesa
      const created = await base44.asServiceRole.entities.Despesa.create({
        empresa_id: jdEmpresaId,
        valor: sessaoAdvDesc.valor,
        descricao: `Adiantamento ${tipoLabel} - ${sessaoAdvDesc.colaborador_nome}`,
        categoria: 'Adiantamento',
        data: hoje,
        data_vencimento: hoje,
        status: 'pago',
        data_pagamento: hoje,
        responsavel_id: sessaoAdvDesc.colaborador_id || 'telegram',
        responsavel_nome: sessaoAdvDesc.colaborador_nome,
        usuario_id: sessaoAdvDesc.colaborador_id || 'telegram',
        usuario_nome: 'Telegram Bot',
        observacao: `Adiantamento ${tipoLabel} lançado via Telegram - ID: ${adiantamentoId}`,
      });

      const valorFmt = sessaoAdvDesc.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      await sendTelegram(chatId,
        `✅ <b>Adiantamento Cadastrado com Sucesso!</b>\n\n` +
        `👤 ${sessaoAdvDesc.colaborador_nome}\n` +
        `🏷️ Tipo: <b>${tipoLabel}</b>\n` +
        `💰 Valor: <b>${valorFmt}</b>\n` +
        `📝 Descrição: ${sessaoAdvDesc.descricao}\n` +
        `📅 Data: ${hoje}\n` +
        `<code>ID Adiantamento: ${adiantamentoId}</code>\n` +
        `<code>ID Transação: ${created.id}</code>`
      );
      return Response.json({ ok: true });
    }

    // ──────────────────────────────────────────────────────────────────────

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
        "👤 <b>Funil de Vendas:</b>\n" +
        "• <code>nova oportunidade João Silva 81999998888</code>\n" +
        "• <code>lead consórcio Maria 81999997777</code>\n" +
        "• <code>novo lead empréstimo Pedro 71988887777</code>\n\n" +
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

    // Buscar primeira empresa com contas cadastradas
    let empresaId = null;
    let usuarioId = null;
    
    try {
      // Buscar primeira empresa que tem contas ativas
      const contas = await base44.asServiceRole.entities.ContaBancaria.filter(
        { status: 'ativa' },
        '-created_date',
        1
      );
      
      if (contas && contas.length > 0) {
        empresaId = contas[0].empresa_id;
      }
      
      // Se encontrou empresa, buscar colaborador dessa empresa
      if (empresaId) {
        const colaboradores = await base44.asServiceRole.entities.Colaborador.filter(
          { empresa_id: empresaId, status: 'ativo' },
          '-created_date',
          1
        );
        if (colaboradores && colaboradores.length > 0) {
          usuarioId = colaboradores[0].user_id;
        }
      }
    } catch (err) {
      console.error('Erro ao buscar empresa/colaborador:', err);
    }
    
    // Se ainda não achou empresa, tenta buscar qualquer colaborador ativo
    if (!empresaId) {
      try {
        const colaboradores = await base44.asServiceRole.entities.Colaborador.filter(
          { status: 'ativo' },
          '-created_date',
          1
        );
        if (colaboradores && colaboradores.length > 0) {
          empresaId = colaboradores[0].empresa_id;
          usuarioId = colaboradores[0].user_id;
        }
      } catch (err) {
        console.error('Erro ao buscar colaborador fallback:', err);
      }
    }

    // Carregar configuração customizada do robô (se existir)
    let configRobo = null;
    try {
      const configs = await base44.asServiceRole.entities.ConfiguracaoRoboTelegram.filter(
        empresaId ? { empresa_id: empresaId } : {},
        '-created_date', 1
      );
      if (configs && configs.length > 0) configRobo = configs[0];
    } catch (_) {}

    const intent = await callLLM(base44, original, context, configRobo);

    if (intent.action === "clarify") {
      await sendTelegram(chatId, `❓ ${intent.clarify?.question || "Me diga mais detalhes, por favor."}`);
      return Response.json({ ok: true });
    }

    if (intent.action === "create_advance") {
      // Iniciar fluxo: perguntar tipo
      await sessionSet(base44, `adiantamento_tipo_${chatId}`, {});

      await sendTelegram(chatId,
        `💰 <b>Novo Adiantamento</b>\n\n` +
        `É para um <b>Funcionário/Colaborador</b> ou <b>Vendedor/Parceiro</b>?`,
        {
          inline_keyboard: [
            [
              { text: "👤 Funcionário", callback_data: "adv_funcionario" },
              { text: "💼 Vendedor", callback_data: "adv_vendedor" }
            ]
          ]
        }
      );
      return Response.json({ ok: true });
    }

    if (intent.action === "create_opportunity") {
      const op = intent.opportunity || {};
      if (!op.nome) {
        await sendTelegram(chatId, "❓ Para criar a oportunidade, preciso do <b>nome/título</b>.");
        return Response.json({ ok: true });
      }

      // Guardar sessão e solicitar telefone
      await sessionSet(base44, `oportunidade_${chatId}`, {
        nome: op.nome,
        produto: op.produto || 'consorcio',
        observacao: op.observacao || null,
        valor: op.valor || 0,
      });

      await sendTelegram(chatId, `📞 Qual é o <b>telefone</b> do lead?\n\n(ou digite "skip" para pular)`);
      return Response.json({ ok: true });
    }

    // ── Fluxo de oportunidade - recebendo telefone ────────────────────────
    const sessaoOp = await sessionGet(base44, `oportunidade_${chatId}`);
    if (sessaoOp) {
      const telefone = original === "skip" ? null : original;
      await sessionDelete(base44, `oportunidade_${chatId}`);

      // Buscar primeira etapa ativa do funil
      let etapaId = null;
      let etapaNome = '';
      try {
        const etapas = await base44.asServiceRole.entities.EtapaFunil.filter(
          empresaId !== 'TELEGRAM_BOT' ? { empresa_id: empresaId, status: 'ativa' } : { status: 'ativa' },
          'ordem', 50
        );
        const primeiraEtapa = etapas.find(e => e.tipo === 'aberta') || etapas[0];
        if (primeiraEtapa) {
          etapaId = primeiraEtapa.id;
          etapaNome = primeiraEtapa.nome;
        }
      } catch (_) {}

      if (!etapaId) {
        await sendTelegram(chatId, "⚠️ Não encontrei etapas configuradas no funil. Configure as etapas primeiro.");
        return Response.json({ ok: true });
      }

      const hoje = new Date().toLocaleDateString('fr-CA');

      const created = await base44.asServiceRole.entities.Oportunidade.create({
        empresa_id: empresaId,
        titulo: sessaoOp.nome,
        cliente_nome: sessaoOp.nome,
        telefone_lead: telefone || null,
        etapa_id: etapaId,
        etapa_nome: etapaNome,
        produto: sessaoOp.produto,
        origem: 'Telegram',
        observacoes: sessaoOp.observacao,
        vendedor_id: usuarioId,
        data_cadastro_lead: hoje,
        data_ultima_movimentacao: new Date().toISOString(),
        status: 'aberta',
        valor_estimado: sessaoOp.valor,
      });

      try {
        await base44.asServiceRole.entities.MovimentacaoFunil.create({
          oportunidade_id: created.id,
          etapa_destino_id: etapaId,
          etapa_destino_nome: etapaNome,
          usuario_id: usuarioId || 'telegram',
          usuario_nome: 'Telegram Bot',
          observacao: 'Oportunidade criada via Telegram'
        });
      } catch (_) {}

      await sendTelegram(chatId,
        `✅ <b>Oportunidade criada no Funil!</b>\n\n` +
        `👤 <b>${created.titulo}</b>\n` +
        (telefone ? `📞 ${telefone}\n` : '') +
        `🏷️ Etapa: <b>${etapaNome}</b>\n` +
        `📦 Funil: <b>${sessaoOp.produto === 'consorcio' ? 'Consórcio' : 'Empréstimo'}</b>\n` +
        `<code>ID ${created.id}</code>`
      );
      return Response.json({ ok: true });
    }

    if (intent.action === "create_expense") {
      const ex = intent.expense || {};
      if (!ex.valor || !ex.descricao) {
        await sendTelegram(chatId, "❓ Para lançar despesa, preciso de: <b>valor</b> e <b>descrição</b>.");
        return Response.json({ ok: true });
      }

      const hoje = new Date().toLocaleDateString('fr-CA');
      const dataEx = ex.data || hoje;

      // Buscar empresa JD Promotora
      let jdEmpresaId = null;
      try {
        const empresas = await base44.asServiceRole.entities.Empresa.filter(
          { nome: { $regex: "JD Promotora", $options: "i" } },
          '-created_date',
          1
        );
        if (empresas && empresas.length > 0) {
          jdEmpresaId = empresas[0].id;
        }
      } catch (_) {}

      if (!jdEmpresaId) {
        await sendTelegram(chatId, "⚠️ Empresa JD Promotora não encontrada.");
        return Response.json({ ok: true });
      }

      // Guardar sessão e perguntar status
      await sessionSet(base44, `despesa_status_${chatId}`, {
        tipo: 'despesa',
        empresaId: jdEmpresaId,
        usuarioId,
        data: { ...ex, data: dataEx },
      });

      const valorFmt = Number(ex.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      await sendTelegram(chatId,
        `📉 <b>Despesa: ${ex.descricao} — ${valorFmt}</b>\n\nJá foi <b>quitada</b> ou vai ser <b>agendada</b>?`,
        {
          inline_keyboard: [
            [
              { text: "✅ Quitada", callback_data: "despesa_quitada" },
              { text: "📅 Agendada", callback_data: "despesa_agendada" }
            ]
          ]
        }
      );
      return Response.json({ ok: true });
    }

    if (intent.action === "create_revenue") {
      const r = intent.revenue || {};
      if (!r.valor || !r.descricao) {
        await sendTelegram(chatId, "❓ Para lançar receita, preciso de: <b>valor</b> e <b>descrição</b>.");
        return Response.json({ ok: true });
      }

      const hoje = new Date().toLocaleDateString('fr-CA');
      const dataRec = r.data || hoje;

      // Buscar empresa JD Promotora
      let jdEmpresaId = null;
      try {
        const empresas = await base44.asServiceRole.entities.Empresa.filter(
          { nome: { $regex: "JD Promotora", $options: "i" } },
          '-created_date',
          1
        );
        if (empresas && empresas.length > 0) {
          jdEmpresaId = empresas[0].id;
        }
      } catch (_) {}

      if (!jdEmpresaId) {
        await sendTelegram(chatId, "⚠️ Empresa JD Promotora não encontrada.");
        return Response.json({ ok: true });
      }

      // Guardar sessão e perguntar status
      await sessionSet(base44, `receita_status_${chatId}`, {
        tipo: 'receita',
        empresaId: jdEmpresaId,
        usuarioId,
        data: { ...r, data: dataRec },
      });

      const valorFmt = Number(r.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      await sendTelegram(chatId,
        `📈 <b>Receita: ${r.descricao} — ${valorFmt}</b>\n\nJá foi <b>recebida</b> ou vai ser <b>agendada</b>?`,
        {
          inline_keyboard: [
            [
              { text: "✅ Recebida", callback_data: "receita_recebida" },
              { text: "📅 Agendada", callback_data: "receita_agendada" }
            ]
          ]
        }
      );
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

      await sendTelegram(chatId, `✅ Agendado: <b>${created.titulo}</b>\n📅 ${new Date(created.inicio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n<code>ID ${created.id}</code>`);
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
      await sendTelegram(chatId, `✅ Remarcado: <b>${item.titulo}</b>\n📅 ${new Date(a.inicio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n<code>ID ${a.id}</code>`);
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