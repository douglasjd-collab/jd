import { createClientFromRequest } from "npm:@base44/sdk";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const primeiroNome = (nome = "") => String(nome).trim().split(/\s+/)[0] || "cliente";
const somenteDigitos = (valor = "") => String(valor).replace(/\D/g, "");

async function marcarComoConversaDeCampanha(base44: any, campanha: any, destinatario: any, texto: string) {
  const telefone = somenteDigitos(destinatario.telefone);
  if (!telefone) return;
  const existentes = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
    { empresa_id: campanha.empresa_id, cliente_telefone: telefone },
    "-created_date",
    1
  );
  const dados = {
    status: "campanha",
    origem: "campanha",
    cliente_respondeu: false,
    ultimo_remetente: "vendedor",
    ultima_mensagem: String(texto || "").substring(0, 200),
    data_ultima_mensagem: new Date().toISOString(),
    connection_id: campanha.connection_id,
    provider: "dapi",
    canal_origem: "dapi",
    responsavel_id: null,
    responsavel_nome: null,
    responsavel_expira_em: null,
  };

  if (existentes?.length) {
    await base44.asServiceRole.entities.ConversaWhatsapp.update(existentes[0].id, dados);
  } else {
    await base44.asServiceRole.entities.ConversaWhatsapp.create({
      ...dados,
      empresa_id: campanha.empresa_id,
      cliente_id: destinatario.cliente_id || null,
      cliente_nome: destinatario.cliente_nome || telefone,
      cliente_telefone: telefone,
      tipo_conexao: "usuario",
    });
  }
}

async function processarCampanha(base44: any, campanha: any, campanhaId: string) {
  const destinatarios = await base44.asServiceRole.entities.CampanhaDestinatario.filter(
    { campanha_id: campanhaId, status: "na_fila" },
    "created_date",
    500
  );

  await base44.asServiceRole.entities.Campanha.update(campanhaId, {
    status: "executando",
    inicio_execucao: campanha.inicio_execucao || new Date().toISOString(),
  });

  let enviados = Number(campanha.enviados || 0);
  let falhas = Number(campanha.falhas || 0);
  const porMinuto = Math.max(1, Math.min(60, Number(campanha.velocidade_envio || 1)));
  const delayMs = Math.max(1000, Math.round(60000 / porMinuto));
  const pausarApos = Math.max(0, Number(campanha.pausa_apos || 0));
  const duracaoPausaMs = Math.max(0, Number(campanha.duracao_pausa_min || 0)) * 60000;
  let enviadosNestaExecucao = 0;

  for (const destinatario of destinatarios || []) {
    const campanhaAtual = await base44.asServiceRole.entities.Campanha.get(campanhaId);
    if (["cancelada", "pausada"].includes(campanhaAtual?.status)) break;

    await base44.asServiceRole.entities.CampanhaDestinatario.update(destinatario.id, { status: "enviando" });
    const texto = String(campanha.mensagem_texto || "")
      .replace(/\{nome\}/gi, primeiroNome(destinatario.cliente_nome));
    const payload: Record<string, unknown> = {
      connectionId: campanha.connection_id,
      phoneNumber: destinatario.telefone,
    };

    if (campanha.mensagem_tipo === "imagem_texto") {
      payload.action = "sendImage";
      payload.imageUrl = campanha.midia_url;
      payload.caption = texto;
    } else if (campanha.mensagem_tipo === "video_texto") {
      payload.action = "sendVideo";
      payload.videoUrl = campanha.midia_url;
      payload.caption = texto;
    } else {
      payload.action = "sendText";
      payload.text = texto;
    }

    try {
      const resposta = await base44.asServiceRole.functions.invoke("whatsappService", payload);
      const data = resposta?.data || resposta;
      if (data?.success === false) throw new Error(data?.error || "Falha informada pela D-API");
      const messageId = data?.messageId || data?.message_id || data?.data?.messageId || data?.data?.id || "";
      await base44.asServiceRole.entities.CampanhaDestinatario.update(destinatario.id, {
        status: "enviada",
        data_envio: new Date().toISOString(),
        whatsapp_message_id: String(messageId || ""),
        erro_mensagem: "",
      });
      await marcarComoConversaDeCampanha(base44, campanha, destinatario, texto);
      enviados++;
      enviadosNestaExecucao++;
    } catch (error) {
      falhas++;
      await base44.asServiceRole.entities.CampanhaDestinatario.update(destinatario.id, {
        status: "falhou",
        erro_mensagem: error instanceof Error ? error.message : String(error),
      });
      // Recuo operacional após erro do provedor.
      await sleep(Math.max(5000, delayMs));
    }

    await base44.asServiceRole.entities.Campanha.update(campanhaId, { enviados, falhas });

    if (pausarApos > 0 && enviadosNestaExecucao > 0 && enviadosNestaExecucao % pausarApos === 0 && duracaoPausaMs > 0) {
      await sleep(duracaoPausaMs);
    } else if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const restantes = await base44.asServiceRole.entities.CampanhaDestinatario.filter(
    { campanha_id: campanhaId, status: "na_fila" },
    null,
    1
  );
  const campanhaFinal = await base44.asServiceRole.entities.Campanha.get(campanhaId);
  if (!["cancelada", "pausada"].includes(campanhaFinal?.status) && !restantes?.length) {
    await base44.asServiceRole.entities.Campanha.update(campanhaId, {
      status: falhas > 0 && enviados === 0 ? "erro" : "concluida",
      enviados,
      falhas,
      fim_execucao: new Date().toISOString(),
    });
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (user && !["master", "super_admin", "admin", "gerente"].includes(user.perfil)) {
      return Response.json({ error: "Sem permissão para disparar campanhas" }, { status: 403 });
    }

    const { campanha_id } = await req.json();
    if (!campanha_id) return Response.json({ error: "campanha_id obrigatório" }, { status: 400 });

    const campanha = await base44.asServiceRole.entities.Campanha.get(campanha_id);
    if (!campanha || campanha.canal !== "whatsapp_nao_oficial") {
      return Response.json({ error: "Campanha não oficial não encontrada" }, { status: 404 });
    }
    if (!campanha.connection_id) {
      return Response.json({ error: "Conexão não oficial não informada" }, { status: 400 });
    }
    if (campanha.status === "agendada" && campanha.agendada_para && new Date(campanha.agendada_para) > new Date()) {
      return Response.json({ ok: true, agendada: true, inicio: campanha.agendada_para });
    }
    if (["concluida", "cancelada"].includes(campanha.status)) {
      return Response.json({ ok: true, ignorada: true, status: campanha.status });
    }

    await base44.asServiceRole.entities.Campanha.update(campanha_id, {
      status: "executando",
      inicio_execucao: campanha.inicio_execucao || new Date().toISOString(),
    });

    const tarefa = processarCampanha(base44, campanha, campanha_id).catch(async (error) => {
      console.error("Erro no processamento em segundo plano:", error);
      await base44.asServiceRole.entities.Campanha.update(campanha_id, {
        status: "erro",
        fim_execucao: new Date().toISOString(),
      });
    });

    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) {
      edgeRuntime.waitUntil(tarefa);
      return Response.json({ ok: true, iniciado: true, campanha_id }, { status: 202 });
    }

    await tarefa;
    return Response.json({ ok: true, iniciado: true, campanha_id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
