import { createClientFromRequest } from "npm:@base44/sdk";
import {
  processarLoteCampanha,
  recuperarEnviosSemConfirmacao,
  travaAtiva,
  contadoresDaCampanha,
} from "../../shared/campanhaDisparoShared.ts";

/**
 * Agendador durável das campanhas não oficiais (chamado a cada 5 minutos).
 *
 * Responsabilidades:
 *  1. Recuperar campanhas órfãs (executando sem sinal), destinatários presos em
 *     'enviando' e campanhas sem pendências.
 *  2. Retomar as campanhas cujo `proximo_envio_em` já venceu, processando um
 *     lote curto por campanha, dentro de um orçamento global.
 *  3. Nunca reiniciar envios já concluídos nem reenviar resultados incertos.
 */
const ORCAMENTO_GLOBAL_MS = 220000;
const SINAL_VALIDO_MS = 3 * 60000;

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    let user: any = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (user && !["master", "super_admin", "admin"].includes(user.perfil)) {
      return Response.json({ error: "Sem permissão" }, { status: 403 });
    }

    const inicio = Date.now();
    const Campanhas = base44.asServiceRole.entities.Campanha;
    const Destinatarios = base44.asServiceRole.entities.CampanhaDestinatario;

    // 1) Destinatários que ficaram 'enviando' após queda do worker → conferência.
    const recuperadosIncerto = await recuperarEnviosSemConfirmacao(base44);

    // 2) Campanhas executando sem nenhum pendente: fecha o estado real.
    const executando = await Campanhas.filter(
      { canal: "whatsapp_nao_oficial", status: "executando" },
      "proximo_envio_em",
      50
    );
    const lista = Array.isArray(executando) ? executando : (executando?.items || []);

    const finalizadas: any[] = [];
    const processadas: any[] = [];
    const aguardando: any[] = [];

    for (const campanha of lista) {
      const contadores = await contadoresDaCampanha(base44, campanha.id);

      if (contadores.pendentes === 0) {
        const statusFinal = contadores.enviados === 0 && contadores.falhas > 0 ? "erro" : "concluida";
        await Campanhas.update(campanha.id, {
          status: statusFinal,
          enviados: contadores.enviados,
          falhas: contadores.falhas,
          revisar: contadores.revisar,
          proximo_envio_em: null,
          fim_execucao: new Date().toISOString(),
          heartbeat_em: new Date().toISOString(),
        });
        finalizadas.push({ id: campanha.id, status: statusFinal });
        continue;
      }

      // Ainda dentro da pausa programada / intervalo: só registra o estado real.
      if (campanha.proximo_envio_em && new Date(campanha.proximo_envio_em).getTime() > Date.now()) {
        aguardando.push({ id: campanha.id, proximo_envio_em: campanha.proximo_envio_em });
        continue;
      }

      if (travaAtiva(campanha)) {
        aguardando.push({ id: campanha.id, motivo: "worker ativo" });
        continue;
      }

      // Heartbeat antigo: campanha órfã, mas retomamos pelo lote (recuperação real).
      const heartbeat = campanha.heartbeat_em ? new Date(campanha.heartbeat_em).getTime() : 0;
      const orfa = !heartbeat || Date.now() - heartbeat > SINAL_VALIDO_MS;

      if (Date.now() - inicio > ORCAMENTO_GLOBAL_MS) {
        aguardando.push({ id: campanha.id, motivo: "orçamento do ciclo esgotado" });
        continue;
      }

      const restante = ORCAMENTO_GLOBAL_MS - (Date.now() - inicio);
      const resultado = await processarLoteCampanha(base44, campanha.id, {
        orcamentoMs: Math.min(120000, Math.max(20000, restante)),
        workerId: `cron_${crypto.randomUUID()}`,
      });
      processadas.push({ id: campanha.id, orfa, ...resultado });
    }

    // 3) Segurança extra: nenhum destinatário pode ficar preso em 'enviando'.
    const presosResposta: any = await Destinatarios.filter({ status: "enviando" }, "created_date", 500);
    const presos = Array.isArray(presosResposta) ? presosResposta.length : (presosResposta?.items || []).length;

    return Response.json({
      success: true,
      campanhas_avaliadas: lista.length,
      processadas,
      finalizadas,
      aguardando,
      incertos_recuperados: recuperadosIncerto,
      destinatarios_em_envio: Number(presos) || 0,
      duracao_ms: Date.now() - inicio,
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});