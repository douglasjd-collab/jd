/**
 * Relógio de atendimento do Bate-papo (primeira etapa).
 *
 * Duas esperas são medidas em cima das mensagens já gravadas, nunca do que o
 * usuário faz na tela:
 *   - cliente aguardando: desde a PRIMEIRA mensagem do cliente que ainda não
 *     recebeu resposta humana. Abrir, ler, marcar como lida ou transferir não
 *     mexe nesse relógio; nota interna e mensagem automática também não contam
 *     como resposta; resposta humana enviada com sucesso encerra a espera.
 *   - atendimento em curso: desde a última resposta humana quando não há
 *     pendência do cliente. É a base do aviso de revisão de 1 hora.
 *
 * O resultado é persistido em AtendimentoAlerta por conversa, com um marcador
 * da última mensagem processada: só recalcula quando chega mensagem nova.
 */

export const ESPERA_MINIMA_MS = 5 * 60 * 1000;      // alerta de espera
export const REVISAO_ATENDIMENTO_MS = 60 * 60 * 1000; // revisão após 1 hora
export const ADIAR_REVISAO_MS = 30 * 60 * 1000;     // "Continuar atendimento"
export const ADIAR_ALERTA_MS = 5 * 60 * 1000;       // adiamento curto do popup

// Rótulos usados pelas automações ao gravar mensagem de saída. Qualquer
// mensagem com um destes nomes é automática e não encerra a espera do cliente.
const ROTULOS_AUTOMATICOS = [
  'agendamento automatico',
  'assistente ia',
  'assistente gpt',
  'telegram bot',
  'robo',
  'sistema',
  'automacao',
  'campanha',
  'disparo automatico',
];

export function normalizar(valor: any): string {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function mensagemHumanaEnviada(msg: any): boolean {
  if (!msg || msg.remetente !== 'vendedor') return false;
  if (msg.mensagem_tecnica) return false;
  if (!['enviada', 'entregue', 'lida'].includes(String(msg.status || ''))) return false;
  const nome = normalizar(msg.usuario_nome);
  if (!nome) return true; // enviada pelo celular conectado: é o atendente
  return !ROTULOS_AUTOMATICOS.some((rotulo) => nome.includes(rotulo));
}

export function ehGrupo(conversa: any): boolean {
  const telefone = String(conversa?.cliente_telefone || '');
  const whatsappId = String(conversa?.whatsapp_id || '');
  return telefone.includes('@g.us') || whatsappId.includes('@g.us');
}

// Conversa individual pertinente: fora grupos, bloqueadas e campanhas que o
// cliente ainda não respondeu.
export function conversaPertinente(conversa: any): boolean {
  if (!conversa) return false;
  if (conversa.bloqueado) return false;
  if (ehGrupo(conversa)) return false;
  if (conversa.status !== 'ativa') return false;
  if (conversa.origem === 'campanha' && !conversa.cliente_respondeu) return false;
  return true;
}

export interface EstadoAtendimento {
  aguardando_desde: string | null;
  atendimento_iniciado_em: string | null;
  ultima_mensagem_cliente_em: string | null;
  ultima_resposta_humana_em: string | null;
}

/**
 * Calcula o estado do relógio a partir das mensagens da conversa.
 * Recebe as mensagens já ordenadas da mais nova para a mais antiga.
 */
export function calcularEstadoAtendimento(mensagens: any[]): EstadoAtendimento {
  const validas = (mensagens || []).filter(
    (m) => m && m.data_envio && !m.mensagem_tecnica && Number.isFinite(new Date(m.data_envio).getTime())
  );

  let ultimaHumana = 0;
  for (const m of validas) {
    if (!mensagemHumanaEnviada(m)) continue;
    const t = new Date(m.data_envio).getTime();
    if (t > ultimaHumana) ultimaHumana = t;
  }

  let primeiraPendente = 0;
  let ultimaCliente = 0;
  for (const m of validas) {
    if (m.remetente !== 'cliente') continue;
    const t = new Date(m.data_envio).getTime();
    if (t > ultimaCliente) ultimaCliente = t;
    if (t > ultimaHumana && (primeiraPendente === 0 || t < primeiraPendente)) primeiraPendente = t;
  }

  const iso = (t: number) => (t > 0 ? new Date(t).toISOString() : null);
  return {
    aguardando_desde: iso(primeiraPendente),
    // Sem pendência do cliente, o atendimento em curso começou na última resposta humana.
    atendimento_iniciado_em: primeiraPendente ? null : iso(ultimaHumana),
    ultima_mensagem_cliente_em: iso(ultimaCliente),
    ultima_resposta_humana_em: iso(ultimaHumana),
  };
}

// ── Horário de atendimento ────────────────────────────────────────────────
// Não existe expediente configurado neste app. A configuração é opcional e,
// quando ausente, o comportamento é explícito: alertas valem 24 horas por dia.
export interface ConfigHorario {
  ativo: boolean;
  dias: number[]; // 1 = segunda ... 7 = domingo
  inicio: string; // HH:MM
  fim: string;    // HH:MM
}

export function chaveConfigHorario(empresaId: string): string {
  return `atendimento_horario_${empresaId}`;
}

export function parseConfigHorario(bruto: any): ConfigHorario | null {
  try {
    const obj = typeof bruto === 'string' ? JSON.parse(bruto || 'null') : bruto;
    if (!obj || typeof obj !== 'object') return null;
    const dias = Array.isArray(obj.dias)
      ? obj.dias.map((d: any) => Number(d)).filter((d: number) => d >= 1 && d <= 7)
      : [];
    return {
      ativo: obj.ativo !== false,
      dias: dias.length ? dias : [1, 2, 3, 4, 5],
      inicio: /^\d{2}:\d{2}$/.test(obj.inicio) ? obj.inicio : '08:00',
      fim: /^\d{2}:\d{2}$/.test(obj.fim) ? obj.fim : '18:00',
    };
  } catch (_) {
    return null;
  }
}

export async function lerConfigHorario(db: any, empresaId: string): Promise<ConfigHorario | null> {
  try {
    const registros = await db.ConfiguracaoSistema.filter({ chave: chaveConfigHorario(empresaId) }, '-updated_date', 1);
    if (!registros?.length) return null;
    return parseConfigHorario(registros[0].valor);
  } catch (_) {
    return null;
  }
}

function agoraEmSaoPaulo(): { dia: number; minutos: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const partes = fmt.formatToParts(new Date());
  const pegar = (tipo: string) => partes.find((p) => p.type === tipo)?.value || '';
  const mapa: Record<string, number> = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dia = mapa[pegar('weekday')] || 1;
  const minutos = Number(pegar('hour')) * 60 + Number(pegar('minute'));
  return { dia, minutos };
}

function minutosDeHora(hora: string): number {
  const [h, m] = String(hora).split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export interface AvaliacaoHorario {
  configurado: boolean;
  ativo: boolean;
  dentro: boolean;
  descricao: string;
}

export function avaliarHorario(config: ConfigHorario | null): AvaliacaoHorario {
  if (!config || !config.ativo) {
    return {
      configurado: false,
      ativo: false,
      dentro: true,
      descricao: 'Sem horário de atendimento configurado: os alertas valem 24 horas por dia.',
    };
  }
  const { dia, minutos } = agoraEmSaoPaulo();
  const inicio = minutosDeHora(config.inicio);
  const fim = minutosDeHora(config.fim);
  const diaUtil = config.dias.includes(dia);
  const dentro = diaUtil && minutos >= inicio && minutos < fim;
  const nomes = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  const diasTexto = config.dias.map((d) => nomes[d - 1]).join(', ');
  return {
    configurado: true,
    ativo: true,
    dentro,
    descricao: `Atendimento ${diasTexto}, ${config.inicio} às ${config.fim} (horário de Brasília).${
      dentro ? '' : ' Fora do horário: a pendência continua na lista, sem popup automático.'
    }`,
  };
}

// ── Persistência do relógio ───────────────────────────────────────────────
export function marcadorConversa(conversa: any): string {
  return `${conversa?.data_ultima_mensagem || ''}|${conversa?.status || ''}`;
}

/**
 * Recalcula e grava o estado da conversa em AtendimentoAlerta.
 * Retorna o registro atualizado (ou null quando a conversa não é pertinente).
 */
export async function sincronizarAlertaAtendimento({
  db,
  conversa,
  registro,
}: {
  db: any;
  conversa: any;
  registro: any | null;
}) {
  if (!conversaPertinente(conversa)) {
    if (registro?.id) await db.AtendimentoAlerta.delete(registro.id).catch(() => {});
    return null;
  }

  const mensagens = await db.MensagemWhatsapp.filter(
    { conversa_id: conversa.id, empresa_id: conversa.empresa_id },
    '-data_envio',
    200
  );
  const estado = calcularEstadoAtendimento(Array.isArray(mensagens) ? mensagens : (mensagens?.items || []));

  const marcador = marcadorConversa(conversa);
  const dados: any = {
    empresa_id: conversa.empresa_id,
    conversa_id: conversa.id,
    connection_id: conversa.connection_id || '',
    cliente_nome: conversa.cliente_nome || conversa.cliente_telefone || '',
    cliente_telefone: conversa.cliente_telefone || '',
    marcador,
    status_conversa: conversa.status,
    atualizado_em: new Date().toISOString(),
  };

  // Ciclo novo: o relógio acompanha as mensagens gravadas. O adiamento do
  // alerta é descartado apenas quando muda a mensagem pendente (chega novo
  // ciclo de espera) — o de revisão sobrevive ao ciclo.
  const aguardandoAnterior = registro?.aguardando_desde || null;
  const mudouPendencia = aguardandoAnterior !== estado.aguardando_desde;

  dados.aguardando_desde = estado.aguardando_desde;
  dados.atendimento_iniciado_em = estado.atendimento_iniciado_em;

  if (estado.aguardando_desde) {
    // Cliente esperando: o aviso de revisão não se aplica enquanto não houver resposta.
    dados.revisao_adiada_ate = null;
  } else if (registro?.atendimento_iniciado_em && registro.atendimento_iniciado_em === estado.atendimento_iniciado_em) {
    dados.revisao_adiada_ate = registro.revisao_adiada_ate || null;
  } else {
    dados.revisao_adiada_ate = null;
  }

  dados.alerta_adiado_ate = mudouPendencia ? null : (registro?.alerta_adiado_ate || null);

  if (registro?.id) {
    return await db.AtendimentoAlerta.update(registro.id, dados);
  }
  return await db.AtendimentoAlerta.create(dados);
}

export function minutosDesde(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
}