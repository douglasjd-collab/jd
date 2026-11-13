import { createClientFromRequest } from "npm:@base44/sdk";
import { waitUntil } from "base44:runtime";
import { processarLoteCampanha, reabrirInterrompidos } from "../../shared/campanhaDisparoShared.ts";

/**
 * Arma/retoma uma campanha não oficial e dispara UM LOTE CURTO.
 *
 * - Não existe mais laço longo, sleep de centenas de segundos nem processamento
 *   de toda a fila em um único worker.
 * - O lote é limitado por tempo (orçamento) e termina gravando `proximo_envio_em`.
 * - A continuidade é garantida pelo agendador backend (processarCampanhasNaoOficiais),
 *   que retoma a campanha sem depender desta requisição ou de aba aberta.
 * - A trava atômica por campanha impede workers concorrentes e envios duplicados.
 */
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    let user: any = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (user && !["master", "super_admin", "admin", "gerente"].includes(user.perfil)) {
      return Response.json({ error: "Sem permissão para disparar campanhas" }, { status: 403 });
    }

    const corpo: any = await req.json().catch(() => ({}));
    const campanha_id = corpo?.campanha_id;
    const acao = String(corpo?.acao || "iniciar");
    if (!campanha_id) return Response.json({ error: "campanha_id obrigatório" }, { status: 400 });

    const campanha: any = await base44.asServiceRole.entities.Campanha
      .get(campanha_id)
      .catch((e: any) => (e?.status === 404 ? null : Promise.reject(e)));
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

    // Retomada explícita: reabre apenas interrompidos e nunca enviados.
    const reabertos = acao === "retomar" ? await reabrirInterrompidos(base44, campanha_id) : 0;

    const agora = new Date().toISOString();
    await base44.asServiceRole.entities.Campanha.update(campanha_id, {
      status: "executando",
      inicio_execucao: campanha.inicio_execucao || agora,
      proximo_envio_em: agora,
      motivo_pausa: "",
      fim_execucao: null,
    });

    const orcamentoMs = Math.max(15000, Math.min(240000, Number(corpo?.orcamento_ms) || 150000));
    const tarefa = processarLoteCampanha(base44, campanha_id, { orcamentoMs }).catch(async (erro: any) => {
      const mensagem = erro?.message || String(erro);
      console.error("Erro no processamento do lote da campanha:", mensagem);
      // Falha real fica visível e retomável — nunca "executando" indefinido.
      await base44.asServiceRole.entities.Campanha.update(campanha_id, {
        status: "pausada",
        motivo_pausa: `Erro ao processar o lote: ${mensagem}`,
        ultimo_erro: mensagem,
        proximo_envio_em: null,
        heartbeat_em: new Date().toISOString(),
      }).catch(() => {});
    });

    try {
      waitUntil(tarefa);
      return Response.json({ ok: true, iniciado: true, campanha_id, reabertos }, { status: 202 });
    } catch (_e) {
      const resultado = await tarefa;
      return Response.json({ ok: true, iniciado: true, campanha_id, reabertos, resultado });
    }
  } catch (error: any) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});