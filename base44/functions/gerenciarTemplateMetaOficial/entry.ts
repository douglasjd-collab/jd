import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

// Versão da Graph API usada para criar/listar/atualizar templates.
const META_API_VERSION = "v20.0";
const META_BASE_URL = "https://graph.facebook.com";

// Converte um nome amigável em nome válido para template da Meta:
// minúsculo, underline, sem acentos/espaços/caracteres especiais.
function normalizeName(raw: string): string {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Monta o array de components exigido pela Meta a partir do template salvo no CRM.
function buildComponents(template: any): any[] {
  const components: any[] = [];
  let examples: any[] = [];
  try { examples = JSON.parse(template.variables_json || "[]"); } catch {}
  const bodyExamples = examples
    .filter((v) => v.component === "BODY")
    .sort((a, b) => a.position - b.position)
    .map((v) => v.example_value || "");

  // HEADER (TEXT, IMAGE ou VIDEO)
  if (template.type === "IMAGE" || template.header_type === "IMAGE") {
    components.push({
      type: "HEADER",
      format: "IMAGE",
      example: template.header_media_id ? { header_handle: [template.header_media_id] } : undefined,
    });
  } else if (template.type === "VIDEO" || template.header_type === "VIDEO") {
    components.push({
      type: "HEADER",
      format: "VIDEO",
      example: template.header_media_id ? { header_handle: [template.header_media_id] } : undefined,
    });
  } else if (template.header_text) {
    components.push({ type: "HEADER", format: "TEXT", text: template.header_text });
  }

  // BODY
  if (template.body_text) {
    const c: any = { type: "BODY", text: template.body_text };
    if (bodyExamples.length > 0) {
      c.example = { body_text: [bodyExamples] };
    }
    components.push(c);
  }

  // FOOTER — sem variáveis permitidas
  if (template.footer_text) {
    components.push({ type: "FOOTER", text: template.footer_text });
  }

  // BUTTONS
  let buttons: any[] = [];
  try { buttons = JSON.parse(template.buttons_json || "[]"); } catch {}
  if (buttons.length > 0) {
    const metaButtons = buttons.map((b) => {
      if (b.type === "QUICK_REPLY") {
        return { type: "QUICK_REPLY", text: b.text };
      }
      if (b.type === "URL") {
        return { type: "URL", text: b.text, url: b.url };
      }
      if (b.type === "PHONE_NUMBER") {
        return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone_number };
      }
      return null;
    }).filter(Boolean);
    if (metaButtons.length > 0) {
      components.push({ type: "BUTTONS", buttons: metaButtons });
    }
  }

  return components;
}

const tokenCache: Record<string, string> = {};

async function getToken(empresaId?: string | null, b44?: any): Promise<string> {
  if (empresaId && tokenCache[empresaId]) return tokenCache[empresaId];
  // 1) Token gravado pela empresa (Meta Embedded Signup)
  if (b44 && empresaId) {
    try {
      const empresas = await b44.asServiceRole.entities.Empresa.filter({ id: empresaId });
      const emp = empresas?.[0];
      if (emp?.whatsapp_access_token) {
        tokenCache[empresaId] = emp.whatsapp_access_token;
        return emp.whatsapp_access_token;
      }
    } catch {}
  }
  // 2) Fallback: token global da app
  const token = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN");
  if (!token) {
    throw new Error("Sem credencial de acesso à API Oficial da Meta. Conecte via Meta Embedded Signup ou configure META_WHATSAPP_ACCESS_TOKEN.");
  }
  if (empresaId) tokenCache[empresaId] = token;
  return token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const action = body?.action;
    const perfil = (user.perfil || user.role || "").toLowerCase();

    // ----------------------------------------------------------------
    // list_connections — lista conexões Cloud API / Meta Oficial conectadas
    // ----------------------------------------------------------------
    if (action === "list_connections") {
      const filtro: any = { provider_type: "meta_oficial" };
      if (user.empresa_id) filtro.empresa_id = user.empresa_id;
      const conns = await base44.entities.WhatsappConnection.filter(filtro, null, 200);
      const ativas = conns.filter((c) => c.status === "conectado");

      // Garantir uma conexão automática quando a empresa já tem credenciais salvas
      // via Meta Embedded Signup (LoginMetaOficialButton → /meta-login).
      if (user.empresa_id) {
        try {
          const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: user.empresa_id });
          const emp = empresas?.[0];
          if (emp && emp.whatsapp_conectado && emp.whatsapp_access_token && emp.whatsapp_business_account_id && emp.whatsapp_phone_number_id) {
            const jaExiste = ativas.find((c) => {
              let cfg: any = {};
              try { cfg = JSON.parse(c.config_json || "{}"); } catch {}
              return cfg.wabaId === emp.whatsapp_business_account_id || (c.phone_number && emp.meta_display_phone_number && c.phone_number === emp.meta_display_phone_number);
            });
            if (!jaExiste) {
              const cfg = JSON.stringify({ wabaId: emp.whatsapp_business_account_id, phoneNumberId: emp.whatsapp_phone_number_id });
              const nova = await base44.asServiceRole.entities.WhatsappConnection.create({
                empresa_id: user.empresa_id,
                nome: `WhatsApp Oficial — ${emp.meta_verified_name || emp.meta_display_phone_number || "Empresa"}`,
                provider_type: "meta_oficial",
                phone_number: emp.meta_display_phone_number || "",
                status: "conectado",
                config_json: cfg,
                is_active: true,
              });
              ativas.push(nova);
            }
          }
        } catch {}
      }

      return Response.json({
        connections: ativas.map((c) => ({
          id: c.id,
          nome: c.nome,
          phone_number: c.phone_number,
          status: c.status,
          provider_type: c.provider_type,
          config_json: c.config_json, // contém wabaId/phoneNumberId; token fica na Empresa
        })),
      });
    }

    // ----------------------------------------------------------------
    // check_name_duplicate — verifica nome+idioma dentro do WABA (CRM + Meta)
    // ----------------------------------------------------------------
    if (action === "check_name_duplicate") {
      const { name, language } = body;
      const normalized = normalizeName(name);
      const noCRM = await base44.entities.WhatsappTemplate.filter({
        empresa_id: user.empresa_id,
        name: normalized,
        language: language || "pt_BR",
      }, null, 200);
      // Verificamos também junto à Meta, na mesma WABA passada
      const waba_id = body.waba_id;
      if (waba_id) {
        const token = await getToken();
        const url = `${META_BASE_URL}/${META_API_VERSION}/${waba_id}/message_templates?name=${encodeURIComponent(normalized)}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        const metaExiste = Array.isArray(data?.data) && data.data.length > 0;
        return Response.json({
          exists: noCRM.length > 0 || metaExiste,
          crm_exists: noCRM.length > 0,
          meta_exists: metaExiste,
          normalized,
        });
      }
      return Response.json({ exists: noCRM.length > 0, crm_exists: noCRM.length > 0, meta_exists: false, normalized });
    }

    // ----------------------------------------------------------------
    // send_to_meta — cria o template na Meta e marca status em_analise
    // ----------------------------------------------------------------
    if (action === "send_to_meta") {
      const { template_id } = body;
      const template = await base44.entities.WhatsappTemplate.get(template_id);
      if (!template) return Response.json({ error: "Template não encontrado" }, { status: 404 });
      if (template.empresa_id !== user.empresa_id && perfil !== "super_admin" && perfil !== "master") {
        return Response.json({ error: "Sem permissão" }, { status: 403 });
      }
      if (!template.waba_id) {
        return Response.json({ error: "Não foi possível identificar a conta WhatsApp Business desta conexão." }, { status: 400 });
      }

      await base44.entities.WhatsappTemplate.update(template_id, {
        status: "enviando",
        submitted_at: new Date().toISOString(),
      });

      const components = buildComponents(template);
      const payload = {
        name: template.name,
        language: template.language,
        category: template.category,
        components,
      };

      const token = await getToken(template.empresa_id, base44);
      try {
        const url = `${META_BASE_URL}/${META_API_VERSION}/${template.waba_id}/message_templates`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(JSON.stringify(data.error || data));
        }

        await base44.entities.WhatsappTemplate.update(template_id, {
          meta_template_id: data.id,
          status: "em_analise",
          components_json: JSON.stringify(components),
        });
        await base44.entities.WhatsappTemplateLog.create({
          empresa_id: template.empresa_id,
          template_id,
          action: "enviar_aprovacao",
          previous_status: "enviando",
          new_status: "em_analise",
          request_json: JSON.stringify(payload),
          response_json: JSON.stringify(data),
          user_id: user.id,
          user_name: user.full_name,
        });
        return Response.json({
          success: true,
          meta_id: data.id,
          status: "em_analise",
          message: "Template enviado para análise da Meta.",
        });
      } catch (err) {
        const motivo = err.message || "Erro desconhecido";
        await base44.entities.WhatsappTemplate.update(template_id, {
          status: "erro_envio",
          rejection_reason: motivo,
        });
        await base44.entities.WhatsappTemplateLog.create({
          empresa_id: template.empresa_id,
          template_id,
          action: "enviar_aprovacao",
          previous_status: "enviando",
          new_status: "erro_envio",
          request_json: JSON.stringify(payload),
          error_message: motivo,
          user_id: user.id,
          user_name: user.full_name,
        });
        return Response.json({
          error: "Não foi possível enviar o template para análise da Meta.",
          details: motivo,
        }, { status: 502 });
      }
    }

    // ----------------------------------------------------------------
    // sync_status — consulta a Meta e atualiza o status interno
    // ----------------------------------------------------------------
    if (action === "sync_status") {
      const { template_id } = body;
      const template = await base44.entities.WhatsappTemplate.get(template_id);
      if (!template) return Response.json({ error: "Template não encontrado" }, { status: 404 });
      if (template.empresa_id !== user.empresa_id && perfil !== "super_admin" && perfil !== "master") {
        return Response.json({ error: "Sem permissão" }, { status: 403 });
      }
      if (!template.meta_template_id) {
        return Response.json({ error: "Template ainda não enviado à Meta" }, { status: 400 });
      }
      const token = await getToken(template.empresa_id, base44);
      const res = await fetch(
        `${META_BASE_URL}/${META_API_VERSION}/${template.meta_template_id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();
      const metaStatus = (data.status || "").toUpperCase();
      const mapping: Record<string, string> = {
        APPROVED: "aprovado",
        REJECTED: "rejeitado",
        PENDING: "em_analise",
        IN_APPEAL: "em_analise",
        PAUSED: "pausado",
        DISABLED: "desativado",
      };
      const newStatus = mapping[metaStatus] || "em_analise";
      const updates: any = {
        status: newStatus,
        last_synced_at: new Date().toISOString(),
      };
      if (data.quality_rating) updates.quality_rating = data.quality_rating;
      if (newStatus === "aprovado") updates.approved_at = new Date().toISOString();
      if (newStatus === "rejeitado") {
        updates.rejected_at = new Date().toISOString();
        let reasonParts = [];
        if (data.rejected_reason) reasonParts.push(data.rejected_reason);
        if (data.rejections) reasonParts.push(JSON.stringify(data.rejections));
        updates.rejection_reason = reasonParts.join(" | ");
      }
      await base44.entities.WhatsappTemplate.update(template_id, updates);
      await base44.entities.WhatsappTemplateLog.create({
        empresa_id: template.empresa_id,
        template_id,
        action: "sincronizar_status",
        previous_status: template.status,
        new_status: newStatus,
        response_json: JSON.stringify(data),
        user_id: user.id,
        user_name: user.full_name,
      });
      return Response.json({ success: true, status: newStatus, updates });
    }

    // ----------------------------------------------------------------
    // sync_all — sincroniza todos os templates em análise do usuário
    // ----------------------------------------------------------------
    if (action === "sync_all") {
      const all = await base44.entities.WhatsappTemplate.filter(
        user.empresa_id ? { empresa_id: user.empresa_id } : {},
        null,
        300,
      );
      const pendentes = all.filter((t) => ["em_analise", "enviando"].includes(t.status) && t.meta_template_id);
      let processados = 0;
      let aprovados = 0;
      let rejeitados = 0;
      for (const t of pendentes) {
        try {
          const token = await getToken(t.empresa_id, base44);
          const res = await fetch(
            `${META_BASE_URL}/${META_API_VERSION}/${t.meta_template_id}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const data = await res.json();
          const mapping: Record<string, string> = {
            APPROVED: "aprovado", REJECTED: "rejeitado", PENDING: "em_analise",
            IN_APPEAL: "em_analise", PAUSED: "pausado", DISABLED: "desativado",
          };
          const newStatus = mapping[(data.status || "").toUpperCase()] || "em_analise";
          const updates: any = { status: newStatus, last_synced_at: new Date().toISOString() };
          if (newStatus === "aprovado") { updates.approved_at = new Date().toISOString(); aprovados++; }
          if (newStatus === "rejeitado") {
            updates.rejected_at = new Date().toISOString();
            updates.rejection_reason = (data.rejected_reason || "") + (data.rejections ? " | " + JSON.stringify(data.rejections) : "");
            rejeitados++;
          }
          await base44.entities.WhatsappTemplate.update(t.id, updates);
          processados++;
        } catch {}
      }
      return Response.json({ success: true, processados, aprovados, rejeitados });
    }

    // ----------------------------------------------------------------
    // duplicate — cria uma cópia em rascunho (novo nome) e clona variáveis
    // ----------------------------------------------------------------
    if (action === "duplicate") {
      const { template_id, new_name, new_display_name } = body;
      const original = await base44.entities.WhatsappTemplate.get(template_id);
      if (!original || (original.empresa_id !== user.empresa_id && perfil !== "super_admin" && perfil !== "master")) {
        return Response.json({ error: "Sem permissão" }, { status: 403 });
      }
      const novoNome = normalizeName(new_name || `${original.name}_copia`);
      const copy: any = {
        empresa_id: original.empresa_id,
        connection_id: original.connection_id,
        connection_nome: original.connection_nome,
        session_id: original.session_id,
        waba_id: original.waba_id,
        phone_number_id: original.phone_number_id,
        name: novoNome,
        display_name: new_display_name || `${original.display_name || original.name} (cópia)`,
        language: original.language,
        category: original.category,
        type: original.type,
        header_type: original.header_type,
        header_text: original.header_text,
        header_media_url: original.header_media_url,
        header_media_id: original.header_media_id,
        body_text: original.body_text,
        footer_text: original.footer_text,
        buttons_json: original.buttons_json,
        variables_json: original.variables_json,
        status: "rascunho",
        created_by_id: user.id,
        created_by_nome: user.full_name,
      };
      const novo = await base44.entities.WhatsappTemplate.create(copy);
      const vars = await base44.entities.WhatsappTemplateVariable.filter({ template_id, empresa_id: original.empresa_id }, null, 100);
      for (const v of vars) {
        await base44.entities.WhatsappTemplateVariable.create({
          empresa_id: v.empresa_id,
          template_id: novo.id,
          component: v.component,
          position: v.position,
          crm_field: v.crm_field,
          description: v.description,
          example_value: v.example_value,
        });
      }
      await base44.entities.WhatsappTemplateLog.create({
        empresa_id: original.empresa_id,
        template_id: novo.id,
        action: "duplicar",
        previous_status: original.status,
        new_status: "rascunho",
        user_id: user.id,
        user_name: user.full_name,
      });
      return Response.json({ success: true, template: novo });
    }

    // ----------------------------------------------------------------
    // delete_draft — exclui apenas templates em rascunho (+ variáveis)
    // ----------------------------------------------------------------
    if (action === "delete_draft") {
      const { template_id } = body;
      const t = await base44.entities.WhatsappTemplate.get(template_id);
      if (!t || (t.empresa_id !== user.empresa_id && perfil !== "super_admin" && perfil !== "master")) {
        return Response.json({ error: "Sem permissão" }, { status: 403 });
      }
      if (t.status !== "rascunho") {
        return Response.json({ error: "Apenas rascunhos podem ser excluídos" }, { status: 400 });
      }
      const vars = await base44.entities.WhatsappTemplateVariable.filter({ template_id, empresa_id: t.empresa_id }, null, 100);
      for (const v of vars) {
        try { await base44.entities.WhatsappTemplateVariable.delete(v.id); } catch {}
      }
      await base44.entities.WhatsappTemplate.delete(template_id);
      await base44.entities.WhatsappTemplateLog.create({
        empresa_id: t.empresa_id,
        template_id,
        action: "excluir_rascunho",
        previous_status: t.status,
        new_status: "excluido",
        user_id: user.id,
        user_name: user.full_name,
      });
      return Response.json({ success: true });
    }

    return Response.json({ error: "Ação inválida: " + action }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || "Erro inesperado" }, { status: 500 });
  }
});