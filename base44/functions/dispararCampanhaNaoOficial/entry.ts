import { createClientFromRequest } from "npm:@base44/sdk";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const primeiroNome = (nome = "") => String(nome).trim().split(/\s+/)[0] || "cliente";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user || !["master", "super_admin", "admin", "gerente"].includes(user.perfil)) {
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

    const destinatarios = await base44.asServiceRole.entities.CampanhaDestinatario.filter(
      { campanha_id, status: "na_fila" },
      "created_date",
      500
    );

    await base44.asServiceRole.entities.Campanha.update(campanha_id, {
      status: "executando",
      inicio_execucao: campanha.inicio_execucao || new Date().toISOString(),
    });

    let enviados = 0;
    let falhas = 0;
    const delayMs = Math.max(1000, Math.round(60000 / Math.max(1, Number(campanha.velocidade_envio || 30))));

    for (const destinatario of destinatarios || []) {
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
        enviados++;
      } catch (error) {
        falhas++;
        await base44.asServiceRole.entities.CampanhaDestinatario.update(destinatario.id, {
          status: "falhou",
          erro_mensagem: error instanceof Error ? error.message : String(error),
        });
      }

      await base44.asServiceRole.entities.Campanha.update(campanha_id, { enviados, falhas });
      if (delayMs > 0) await sleep(delayMs);
    }

    await base44.asServiceRole.entities.Campanha.update(campanha_id, {
      status: falhas > 0 && enviados === 0 ? "erro" : "concluida",
      enviados,
      falhas,
      fim_execucao: new Date().toISOString(),
    });

    return Response.json({ ok: true, enviados, falhas, total: destinatarios?.length || 0 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
