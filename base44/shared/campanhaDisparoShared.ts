/**
 * Núcleo do disparo de campanhas NÃO OFICIAIS (WhatsApp via D-API).
 *
 * Regras de segurança operacional:
 *  - Nenhum laço longo: cada execução processa um LOTE CURTO, limitado por tempo
 *    (orçamento), nunca centenas de destinatários em um único worker.
 *  - Continuidade durável: a campanha guarda `proximo_envio_em` e é retomada pelo
 *    agendador backend. Não depende de aba aberta, sleep longo ou fire-and-forget.
 *  - Trava atômica por campanha (ConfiguracaoSistema + CAS no valor) impede
 *    workers concorrentes e envios duplicados.
 *  - Destinatários já enviados/entregues/lidos/respondidos nunca são reenviados.
 *  - Resultado incerto (timeout/rede) fica em 'revisar' para conferência humana,
 *    sem retry cego.
 */

export const STATUS_ENVIADOS = ["enviada", "entregue", "lida", "respondida"];
export const STATUS_FALHAS = ["falhou", "numero_invalido", "sem_whatsapp", "bloqueado"];
export const STATUS_PENDENTES = ["na_fila", "enviando"];
export const MAX_ORCAMENTO_MS = 240000;

export const dormir = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

export const somenteDigitos = (valor = "") => String(valor).replace(/\D/g, "");

export const telefoneInternacionalDapiBrasil = (valor = "") => {
  const digitos = somenteDigitos(valor);
  // A D-API espera DDI + DDD + número, sem sinal de +.
  // Aceita também o formato nacional salvo no CRM, adicionando o DDI do Brasil.
  if (digitos.startsWith("55") && [12, 13].includes(digitos.length)) return digitos;
  if ([10, 11].includes(digitos.length)) return `55${digitos}`;
  throw new Error("Telefone inválido: informe DDD e número brasileiro com 10 ou 11 dígitos.");
};

export const chaveTelefone = (valor = "") => {
  try {
    return telefoneInternacionalDapiBrasil(valor);
  } catch (_e) {
    return somenteDigitos(valor);
  }
};

export const primeiroNome = (nome = "") => String(nome).trim().split(/\s+/)[0] || "cliente";

const withTimeout = <T>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

/** Texto final da campanha com as variáveis de primeiro nome resolvidas. */
export function textoDaCampanha(campanha: any, destinatario: any) {
  return String(campanha?.mensagem_texto ?? "")
    .replace(/\\([*_~])/g, "$1")
    .replace(/(?:\{\s*(?:nome|primeiro_nome)\s*\}|\bnome\s*\})/gi, () => primeiroNome(destinatario?.cliente_nome));
}

/** Intervalo entre mensagens (faixa aleatória configurada, com legado por minuto). */
export function geradorIntervalo(campanha: any) {
  const minConfigurado = Number(campanha?.intervalo_min_segundos);
  const maxConfigurado = Number(campanha?.intervalo_max_segundos);
  const temFaixa = Number.isFinite(minConfigurado) && minConfigurado > 0 &&
    Number.isFinite(maxConfigurado) && maxConfigurado >= minConfigurado;
  const porMinuto = Math.max(1, Math.min(60, Number(campanha?.velocidade_envio || 60)));
  const atrasoLegadoMs = Math.max(1000, Math.round(60000 / porMinuto));
  const minMs = temFaixa ? Math.max(1000, Math.min(120000, minConfigurado * 1000)) : atrasoLegadoMs;
  const maxMs = temFaixa ? Math.max(minMs, Math.min(120000, maxConfigurado * 1000)) : atrasoLegadoMs;
  return () => Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
}

/** Lê todos os status dos destinatários (paginado) — o runtime não expõe count. */
async function lerStatusDestinatarios(base44: any, campanhaId: string) {
  const alvo = base44.asServiceRole.entities.CampanhaDestinatario;
  const statuses: string[] = [];
  let cursor: string | undefined;
  for (let pagina = 0; pagina < 20; pagina++) {
    const opcoes: any = { limit: 500, fields: ["status"] };
    if (cursor) opcoes.cursor = cursor;
    const resposta: any = await alvo.filter({ campanha_id: campanhaId }, opcoes);
    const itens: any[] = Array.isArray(resposta) ? resposta : (resposta?.items || []);
    statuses.push(...itens.map((r: any) => r.status));
    if (Array.isArray(resposta) || !resposta?.has_more) break;
    cursor = resposta?.next_cursor;
    if (!cursor) break;
  }
  return statuses;
}

/** Contadores sempre derivados dos destinatários (fonte da verdade). */
export async function contadoresDaCampanha(base44: any, campanhaId: string) {
  const statuses = await lerStatusDestinatarios(base44, campanhaId);
  return {
    enviados: statuses.filter((s) => STATUS_ENVIADOS.includes(s)).length,
    falhas: statuses.filter((s) => STATUS_FALHAS.includes(s)).length,
    revisar: statuses.filter((s) => s === "revisar").length,
    pendentes: statuses.filter((s) => STATUS_PENDENTES.includes(s)).length,
    cancelados: statuses.filter((s) => s === "cancelado").length,
    total: statuses.length,
  };
}

// ─── Trava atômica por campanha ───────────────────────────────────────────
/** A trava está ocupada por um worker? (baseada no próprio registro da campanha) */
export function travaAtiva(campanha: any) {
  return Number(campanha?.trava_expira_ts || 0) > Date.now();
}

/**
 * Adquire a trava com compare-and-swap no registro da campanha.
 * Existe um único documento por campanha, então o `updateMany` condicional é
 * atômico: só quem casar com a condição (sem trava ou trava expirada) modifica.
 * Quem recebe 0 modificações desiste — nunca há dois workers no mesmo lote.
 */
export async function adquirirTravaCampanha(base44: any, campanhaId: string, workerId: string, ttlMs: number) {
  const agora = Date.now();
  const filtro: any = {
    id: campanhaId,
    $or: [{ trava_expira_ts: { $exists: false } }, { trava_expira_ts: { $lte: agora } }],
  };
  const resposta: any = await base44.asServiceRole.entities.Campanha.updateMany(filtro, {
    $set: { trava_worker: workerId, trava_expira_ts: agora + ttlMs },
  });
  return Number(resposta?.updated ?? resposta?.modified_count ?? resposta?.n ?? 0) === 1;
}

export async function liberarTravaCampanha(base44: any, campanhaId: string, workerId: string) {
  try {
    // Só libera a trava que é nossa — nunca a de outro worker.
    await base44.asServiceRole.entities.Campanha.updateMany(
      { id: campanhaId, trava_worker: workerId },
      { $set: { trava_worker: "", trava_expira_ts: 0 } }
    );
  } catch (_e) {
    // A trava expira sozinha pelo TTL.
  }
}

// ─── Envio de um destinatário ─────────────────────────────────────────────
async function enviarUmDestinatario(base44: any, campanha: any, destinatario: any) {
  const texto = textoDaCampanha(campanha, destinatario);
  let telefone = "";
  try {
    telefone = telefoneInternacionalDapiBrasil(destinatario.telefone);
  } catch (erro: any) {
    return { status: "numero_invalido", error: erro.message, texto };
  }

  const payload: Record<string, any> = {
    connectionId: campanha.connection_id,
    phoneNumber: telefone,
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

  let resposta: any;
  try {
    resposta = await withTimeout(
      base44.asServiceRole.functions.invoke("whatsappService", payload),
      60000,
      "A integração não respondeu em 60 segundos."
    );
  } catch (erro: any) {
    // Sem resposta do provedor: não sabemos se saiu. Conferência manual.
    return {
      status: "incerto",
      error: `Envio não confirmado (${erro?.message || erro}). Confira no WhatsApp antes de reenviar.`,
      texto,
    };
  }

  const envelope = resposta?.data || resposta;
  const resultadoApi = envelope?.data || envelope;
  const corpoApi = resultadoApi?.data || resultadoApi;
  const camadas = [envelope, resultadoApi, corpoApi].filter(Boolean);
  const falha: any = camadas.find((camada: any) => {
    const codigo = Number(camada?.httpStatus ?? camada?.http_status);
    return camada?.success === false || (Number.isFinite(codigo) && codigo >= 400);
  });

  if (falha) {
    const codigo = Number(falha.httpStatus ?? falha.http_status ?? 0);
    const erro = falha.error || falha.message || corpoApi?.error || "Falha informada pela D-API";
    // Código 0 = falha de rede/credencial antes da entrega do pedido: incerto.
    return { status: codigo >= 400 ? "falhou" : "incerto", error: String(erro), texto };
  }

  const messageId =
    corpoApi?.messageId ||
    corpoApi?.message_id ||
    corpoApi?.id ||
    corpoApi?.key?.id ||
    corpoApi?.message?.id ||
    resultadoApi?.messageId ||
    resultadoApi?.message_id ||
    resultadoApi?.id ||
    "";

  return { status: "enviada", messageId: String(messageId || ""), error: "", texto };
}

/** Atualiza a conversa do CRM. Falha aqui NUNCA invalida o envio concluído. */
async function marcarConversaDeCampanha(base44: any, campanha: any, destinatario: any, texto: string) {
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

/** Reabre somente destinatários interrompidos pelo usuário e nunca enviados. */
export async function reabrirInterrompidos(base44: any, campanhaId: string) {
  const alvo = base44.asServiceRole.entities.CampanhaDestinatario;
  const registros = await alvo.filter(
    { campanha_id: campanhaId, status: "cancelado", erro_mensagem: "Envio interrompido pelo usuário" },
    "created_date",
    1000
  );
  let reabertos = 0;
  for (const registro of registros || []) {
    if (registro.data_envio || registro.whatsapp_message_id) continue;
    await alvo.update(registro.id, { status: "na_fila", erro_mensagem: "" });
    reabertos++;
  }
  return reabertos;
}

export type ResultadoLote = {
  ok: boolean;
  pulado?: boolean;
  motivo?: string;
  enviados?: number;
  falhas?: number;
  revisar?: number;
  pendentes?: number;
  status?: string;
  proximo_envio_em?: string | null;
};

/**
 * Processa UM LOTE CURTO da campanha.
 * - Trava atômica: apenas um worker por campanha.
 * - Respeita pausa/cancelamento a cada destinatário.
 * - Persiste proximo_envio_em, heartbeat e contadores derivados.
 */
export async function processarLoteCampanha(
  base44: any,
  campanhaId: string,
  opcoes: { workerId?: string; orcamentoMs?: number; maxEnvios?: number } = {}
): Promise<ResultadoLote> {
  const workerId = opcoes.workerId || `worker_${crypto.randomUUID()}`;
  const orcamentoMs = Math.max(10000, Math.min(MAX_ORCAMENTO_MS, Number(opcoes.orcamentoMs) || 120000));
  const maxEnvios = Math.max(1, Math.min(50, Number(opcoes.maxEnvios) || 25));
  const Campanhas = base44.asServiceRole.entities.Campanha;
  const Destinatarios = base44.asServiceRole.entities.CampanhaDestinatario;

  const adquiriu = await adquirirTravaCampanha(base44, campanhaId, workerId, Math.max(300000, orcamentoMs + 120000));
  if (!adquiriu) {
    return { ok: true, pulado: true, motivo: "Outro worker já está processando esta campanha." };
  }

  const inicio = Date.now();
  let proximoEnvioEm: number | null = null;
  let motivoPausa = "";
  let ultimoErro = "";
  let enviadosNoLote = 0;
  let falhasNoLote = 0;
  let incertosNoLote = 0;

  try {
    let campanha: any = await Campanhas.get(campanhaId).catch((e: any) => (e?.status === 404 ? null : Promise.reject(e)));
    if (!campanha) return { ok: false, motivo: "Campanha não encontrada" };
    if (campanha.status !== "executando") {
      return { ok: true, pulado: true, motivo: `Campanha está ${campanha.status}.` };
    }

    await Campanhas.update(campanhaId, {
      heartbeat_em: new Date().toISOString(),
      inicio_execucao: campanha.inicio_execucao || new Date().toISOString(),
      motivo_pausa: "",
    });

    // Nunca reenviar quem já recebeu esta campanha.
    const historico = await Destinatarios.filter(
      { campanha_id: campanhaId, status: { $in: STATUS_ENVIADOS } },
      null,
      5000
    );
    const telefonesEnviados = new Set((historico || []).map((d: any) => chaveTelefone(d.telefone)));

    const proximoIntervalo = geradorIntervalo(campanha);
    const pausarApos = Math.max(0, Number(campanha.pausa_apos || 0));
    const duracaoPausaMs = Math.max(0, Number(campanha.duracao_pausa_min || 0)) * 60000;

    const pagina = await Destinatarios.filter({ campanha_id: campanhaId, status: "na_fila" }, "created_date", maxEnvios);
    const fila = Array.isArray(pagina) ? pagina : (pagina?.items || []);

    let falhasConsecutivas = 0;

    for (const alvo of fila) {
      if (Date.now() - inicio > orcamentoMs) break;
      if (enviadosNoLote + falhasNoLote + incertosNoLote >= maxEnvios) break;

      // Respeita pausa/cancelamento do usuário a cada mensagem.
      campanha = await Campanhas.get(campanhaId);
      if (campanha.status !== "executando") break;

      const atual: any = await Destinatarios.get(alvo.id).catch((e: any) => (e?.status === 404 ? null : Promise.reject(e)));
      if (!atual || atual.status !== "na_fila") continue;

      const chave = chaveTelefone(atual.telefone);
      if (telefonesEnviados.has(chave)) {
        await Destinatarios.update(atual.id, {
          status: "cancelado",
          erro_mensagem: "Número já recebeu esta campanha; duplicidade preservada sem novo envio.",
        });
        continue;
      }

      await Destinatarios.update(atual.id, { status: "enviando", data_tentativa_envio: new Date().toISOString() });
      const resultado: any = await enviarUmDestinatario(base44, campanha, atual);

      if (resultado.status === "enviada") {
        await Destinatarios.update(atual.id, {
          status: "enviada",
          data_envio: new Date().toISOString(),
          whatsapp_message_id: resultado.messageId || "",
          erro_mensagem: "",
        });
        telefonesEnviados.add(chave);
        enviadosNoLote++;
        falhasConsecutivas = 0;
        // Atualização de conversa é separada: falhar aqui não desfaz o envio.
        try {
          await marcarConversaDeCampanha(base44, campanha, atual, resultado.texto);
        } catch (erroConversa: any) {
          console.warn("Aviso: conversa não atualizada após envio da campanha:", erroConversa?.message);
        }
      } else if (resultado.status === "incerto") {
        await Destinatarios.update(atual.id, { status: "revisar", erro_mensagem: resultado.error });
        incertosNoLote++;
      } else {
        await Destinatarios.update(atual.id, { status: resultado.status, erro_mensagem: resultado.error });
        falhasNoLote++;
        ultimoErro = resultado.error;
        if (resultado.status === "falhou") {
          falhasConsecutivas++;
          if (falhasConsecutivas >= 3) {
            motivoPausa = `Pausada após ${falhasConsecutivas} falhas seguidas: ${resultado.error}`;
            break;
          }
        }
      }

      await Campanhas.update(campanhaId, { heartbeat_em: new Date().toISOString() });

      // Intervalo configurado entre mensagens, sempre dentro do orçamento do lote.
      const espera = proximoIntervalo();
      proximoEnvioEm = Date.now() + espera;
      const restante = orcamentoMs - (Date.now() - inicio);
      if (restante > espera + 1500) {
        await dormir(espera);
      } else {
        break;
      }

      // Pausa automática após N envios (contagem derivada dos destinatários).
      if (pausarApos > 0 && duracaoPausaMs > 0) {
        const enviadosTotais = (historico || []).length + enviadosNoLote;
        if (enviadosTotais > 0 && enviadosTotais % pausarApos === 0) {
          proximoEnvioEm = Date.now() + duracaoPausaMs;
          break;
        }
      }
    }

    const contadores = await contadoresDaCampanha(base44, campanhaId);
    const campanhaFinal: any = await Campanhas.get(campanhaId);
    let statusFinal = campanhaFinal?.status || "executando";
    let fim = campanhaFinal?.fim_execucao || null;

    if (motivoPausa) {
      statusFinal = "pausada";
    } else if (statusFinal === "executando" && contadores.pendentes === 0) {
      statusFinal = contadores.enviados === 0 && contadores.falhas > 0 ? "erro" : "concluida";
      fim = new Date().toISOString();
    }

    const continuaExecutando = statusFinal === "executando";
    const proximoIso = continuaExecutando
      ? new Date(Math.max(proximoEnvioEm || Date.now(), Date.now())).toISOString()
      : null;

    await Campanhas.update(campanhaId, {
      status: statusFinal,
      enviados: contadores.enviados,
      falhas: contadores.falhas,
      revisar: contadores.revisar,
      proximo_envio_em: proximoIso,
      heartbeat_em: new Date().toISOString(),
      motivo_pausa: motivoPausa || (statusFinal === "pausada" ? campanhaFinal?.motivo_pausa || "" : ""),
      ultimo_erro: ultimoErro || campanhaFinal?.ultimo_erro || "",
      fim_execucao: fim,
    });

    return {
      ok: true,
      enviados: enviadosNoLote,
      falhas: falhasNoLote,
      revisar: incertosNoLote,
      pendentes: contadores.pendentes,
      status: statusFinal,
      proximo_envio_em: proximoIso,
    };
  } finally {
    await liberarTravaCampanha(base44, campanhaId, workerId);
  }
}

/** Recupera destinatários que ficaram 'enviando' quando o worker caiu. */
export async function recuperarEnviosSemConfirmacao(base44: any, campanhaId?: string) {
  const alvo = base44.asServiceRole.entities.CampanhaDestinatario;
  const limite = new Date(Date.now() - 10 * 60000).toISOString();
  const consulta: any = { status: "enviando" };
  if (campanhaId) consulta.campanha_id = campanhaId;

  const registros = await alvo.filter(consulta, "created_date", 500);
  let recuperados = 0;
  for (const registro of registros || []) {
    const referencia = registro.data_tentativa_envio || registro.updated_date || registro.created_date;
    if (referencia && referencia > limite) continue;
    await alvo.update(registro.id, {
      status: "revisar",
      erro_mensagem: "Resultado do envio não confirmado (worker interrompido). Confira no WhatsApp antes de reenviar.",
    });
    recuperados++;
  }
  return recuperados;
}