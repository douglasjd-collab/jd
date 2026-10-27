import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

import {
  carregarAcessoWhatsapp,
  podeAcessarConversa,
  carregarConversaAutorizada,
} from '../../shared/acessoWhatsappShared.ts';
import {
  ESPERA_MINIMA_MS,
  REVISAO_ATENDIMENTO_MS,
  ADIAR_REVISAO_MS,
  ADIAR_ALERTA_MS,
  conversaPertinente,
  sincronizarAlertaAtendimento,
  marcadorConversa,
  minutosDesde,
  lerConfigHorario,
  avaliarHorario,
  parseConfigHorario,
  chaveConfigHorario,
} from '../../shared/atendimentoAlertaShared.ts';

const PERFIS_ADMIN = ['admin', 'master', 'super_admin'];
// Backfill gradual: cada chamada recalcula poucas conversas e a próxima
// continua de onde parou, respeitando o limite de leitura do app.
const MAX_RECALCULOS_POR_CHAMADA = 30;
const MAX_CONVERSAS = 800;
// Mesma janela da rotina de inatividade (>5 dias encerra): evita alertar
// conversas antigas que já saíram do fluxo de atendimento.
const JANELA_ALERTA_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ITENS = 40;
// Backlog: conversa ativa mais antiga que a janela de 7 dias e ainda sem
// registro é coberta por uma varredura rotativa, uma página por chamada.
const BACKLOG_PAGINA = 40;
const MAX_BACKLOG_RECALC = 8;
// Pendências já gravadas nunca saem da lista por idade; este é o teto de
// conversas antigas carregadas por chamada para reconstruir o item na tela.
const MAX_BACKLOG_PENDENTES = 200;

const comoLista = (resultado: any): any[] =>
  Array.isArray(resultado) ? resultado : (resultado?.items || []);

function nomeAtendente(user: any): string {
  return user?.nome_perfil || user?.full_name || user?.email || '';
}

function idAtendente(user: any): string {
  return user?.colaborador_id || user?.id || '';
}

async function carregarRegistro(db: any, empresaId: string, conversaId: string) {
  const registros = await db.AtendimentoAlerta.filter(
    { empresa_id: empresaId, conversa_id: conversaId },
    '-updated_date',
    1
  );
  return comoLista(registros)[0] || null;
}

function chaveCursorBacklog(empresaId: string) {
  return `alertas_atendimento_cursor_${empresaId}`;
}

async function salvarCursorBacklog(db: any, empresaId: string, valor: string | null) {
  const chave = chaveCursorBacklog(empresaId);
  const existente = comoLista(await db.ConfiguracaoSistema.filter({ chave }, '-updated_date', 1))[0] || null;
  const dados = { valor: valor ? String(valor) : '' };
  if (existente?.id) return db.ConfiguracaoSistema.update(existente.id, dados);
  return db.ConfiguracaoSistema.create({
    chave,
    valor: dados.valor,
    descricao: 'Cursor da varredura incremental do backlog de atendimento',
    tipo: 'texto',
  });
}

// Finalização reaproveita exatamente a regra já usada no cabeçalho do Bate-papo:
// status encerrada, atendente liberado, transferência encerrada e estrela de
// prioridade removida com auditoria. Nada é enviado ao cliente.
async function finalizarConversa({ db, conversa, user }: { db: any; conversa: any; user: any }) {
  const agora = new Date().toISOString();
  await db.ConversaWhatsapp.update(conversa.id, {
    status: 'encerrada',
    responsavel_id: null,
    responsavel_nome: null,
    responsavel_expira_em: null,
    atendimento_transferido_para_id: null,
    atendimento_prioritario: false,
    prioritario_removido_por_id: idAtendente(user),
    prioritario_removido_por_nome: nomeAtendente(user),
    prioritario_removido_em: agora,
  });

  // Encerra o ciclo do relógio: a próxima mensagem reabre a conversa e inicia
  // um novo atendimento do zero.
  const registro = await carregarRegistro(db, conversa.empresa_id, conversa.id);
  if (registro?.id) await db.AtendimentoAlerta.delete(registro.id).catch(() => {});
}

// ── Retorno agendado: idempotência no servidor ────────────────────────────
// A chave é estável (conversa) e guarda o ciclo do atendimento. Retry — mesmo
// com resposta perdida no caminho — reaproveita o compromisso já criado em vez
// de gerar um segundo. Nada aqui é decidido por id vindo do cliente.
function chaveRetorno(conversaId: string) {
  return `retorno_atendimento_${conversaId}`;
}

async function lerMarcadorRetorno(db: any, conversaId: string) {
  const registros = comoLista(
    await db.ConfiguracaoSistema.filter({ chave: chaveRetorno(conversaId) }, '-created_date', 5)
  );
  const registro = registros[0] || null;
  let dados: any = null;
  try {
    dados = registro ? JSON.parse(registro.valor || 'null') : null;
  } catch (_) {
    dados = null;
  }
  return { registro, dados };
}

async function gravarMarcadorRetorno(db: any, conversaId: string, dados: any) {
  const { registro } = await lerMarcadorRetorno(db, conversaId);
  const valor = JSON.stringify(dados);
  if (registro?.id) return db.ConfiguracaoSistema.update(registro.id, { valor });
  return db.ConfiguracaoSistema.create({
    chave: chaveRetorno(conversaId),
    valor,
    descricao: 'Controle de duplicidade do retorno agendado pelo alerta de atendimento',
    tipo: 'texto',
  });
}

async function garantirEventoRetorno({ db, conversa, user, motivo, descricao, instante, ciclo }: any) {
  const empresaId = conversa.empresa_id;
  const payload = {
    empresa_id: empresaId,
    titulo: motivo.substring(0, 120),
    descricao,
    tipo: 'reuniao',
    inicio: new Date(instante).toISOString(),
    fim: new Date(instante + 30 * 60000).toISOString(),
    telefone: conversa.cliente_telefone || '',
    usuario_id: idAtendente(user),
    usuario_nome: nomeAtendente(user),
    status: 'agendado',
  };

  // 1) Mesmo ciclo já tem compromisso salvo → atualiza e reaproveita.
  const { dados } = await lerMarcadorRetorno(db, conversa.id);
  if (dados?.ciclo === ciclo && dados?.evento_id) {
    const salvo = await db.Agenda.get(String(dados.evento_id)).catch(() => null);
    // Nunca reaproveita compromisso de outra empresa.
    if (salvo && salvo.empresa_id === empresaId) {
      await db.Agenda.update(salvo.id, payload);
      return salvo;
    }
  }

  const buscarMesmos = async () =>
    comoLista(
      await db.Agenda.filter(
        {
          empresa_id: empresaId,
          tipo: 'reuniao',
          inicio: payload.inicio,
          usuario_id: payload.usuario_id,
          titulo: payload.titulo,
        },
        'created_date',
        5
      )
    ).filter((e: any) => e.status !== 'cancelado');

  // 2) Compromisso criado mas marcador não gravado (resposta perdida):
  // reconhece pelo conteúdo exato antes de criar outro.
  const existentes = await buscarMesmos();
  if (existentes.length) {
    await db.Agenda.update(existentes[0].id, payload);
    await gravarMarcadorRetorno(db, conversa.id, {
      ciclo,
      evento_id: existentes[0].id,
      conversa_id: conversa.id,
      inicio: payload.inicio,
      atualizado_em: new Date().toISOString(),
    });
    return existentes[0];
  }

  const criado = await db.Agenda.create(payload);
  await gravarMarcadorRetorno(db, conversa.id, {
    ciclo,
    evento_id: criado.id,
    conversa_id: conversa.id,
    inicio: payload.inicio,
    criado_em: new Date().toISOString(),
  });

  // 3) Duplo envio simultâneo: mantém o mais antigo e descarta o excedente.
  const depois = await buscarMesmos();
  const maisAntigo = depois[0];
  if (depois.length > 1 && maisAntigo?.id && maisAntigo.id !== criado.id) {
    await db.Agenda.delete(criado.id).catch(() => {});
    await gravarMarcadorRetorno(db, conversa.id, {
      ciclo,
      evento_id: maisAntigo.id,
      conversa_id: conversa.id,
      inicio: payload.inicio,
      atualizado_em: new Date().toISOString(),
    });
    return maisAntigo;
  }

  return criado;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e: any) => (e?.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const db = base44.asServiceRole.entities;

    const empresaId = String(body.empresa_id || user.empresa_id || user.data?.empresa_id || '');
    if (!empresaId) return Response.json({ error: 'empresa_id é obrigatório' }, { status: 400 });

    const isGlobal = ['super_admin', 'master'].includes(user.perfil || '');
    const empresaUsuario = user.empresa_id || user.data?.empresa_id || null;
    if (!isGlobal && empresaUsuario && empresaUsuario !== empresaId) {
      return Response.json({ error: 'Sem permissão para esta empresa' }, { status: 403 });
    }
    const ehAdmin = PERFIS_ADMIN.includes(user.perfil || '') || isGlobal;

    const acao = String(body.acao || 'listar');

    // ── Horário de atendimento (configuração opcional) ────────────────────
    if (acao === 'salvar_horario') {
      if (!ehAdmin) return Response.json({ error: 'Apenas administradores configuram o horário' }, { status: 403 });
      const config = parseConfigHorario(body.horario);
      if (!config) return Response.json({ error: 'Horário inválido' }, { status: 400 });
      const chave = chaveConfigHorario(empresaId);
      const existentes = comoLista(await db.ConfiguracaoSistema.filter({ chave }, '-updated_date', 1));
      if (existentes[0]?.id) {
        await db.ConfiguracaoSistema.update(existentes[0].id, { valor: JSON.stringify(config) });
      } else {
        await db.ConfiguracaoSistema.create({
          chave,
          valor: JSON.stringify(config),
          descricao: 'Horário de atendimento usado pelos alertas do Bate-papo',
          tipo: 'texto',
        });
      }
      return Response.json({ success: true, horario: avaliarHorario(config) });
    }

    // ── Ações sobre uma conversa ─────────────────────────────────────────
    if (['adiar', 'continuar', 'finalizar', 'agendar_finalizar'].includes(acao)) {
      const conversaId = String(body.conversa_id || '');
      if (!conversaId) return Response.json({ error: 'conversa_id é obrigatório' }, { status: 400 });

      const autorizada = await carregarConversaAutorizada({ base44, user, conversaId });
      if ('erro' in autorizada) return Response.json({ error: autorizada.erro }, { status: autorizada.status });
      const conversa = autorizada.conversa;

      const registroAtual = await carregarRegistro(db, conversa.empresa_id, conversa.id);

      if (acao === 'adiar') {
        const minutos = Math.min(Math.max(Number(body.minutos) || 5, 1), 60);
        const ate = new Date(Date.now() + minutos * 60000).toISOString();
        const dados = { alerta_adiado_ate: ate };
        const registro = registroAtual
          ? await db.AtendimentoAlerta.update(registroAtual.id, dados)
          : await db.AtendimentoAlerta.create({
              empresa_id: conversa.empresa_id,
              conversa_id: conversa.id,
              connection_id: conversa.connection_id || '',
              cliente_nome: conversa.cliente_nome || conversa.cliente_telefone || '',
              cliente_telefone: conversa.cliente_telefone || '',
              ...dados,
            });
        return Response.json({ success: true, registro });
      }

      if (acao === 'continuar') {
        const ate = new Date(Date.now() + ADIAR_REVISAO_MS).toISOString();
        const dados: any = { revisao_adiada_ate: ate };
        if (!registroAtual?.atendimento_iniciado_em) {
          dados.atendimento_iniciado_em = new Date().toISOString();
        }
        const registro = registroAtual
          ? await db.AtendimentoAlerta.update(registroAtual.id, dados)
          : await db.AtendimentoAlerta.create({
              empresa_id: conversa.empresa_id,
              conversa_id: conversa.id,
              connection_id: conversa.connection_id || '',
              cliente_nome: conversa.cliente_nome || conversa.cliente_telefone || '',
              cliente_telefone: conversa.cliente_telefone || '',
              ...dados,
            });
        return Response.json({ success: true, registro });
      }

      if (acao === 'finalizar') {
        // Recalcula antes: nunca finalizar cliente que aguarda resposta.
        const registro = await sincronizarAlertaAtendimento({ db, conversa, registro: registroAtual });
        if (registro?.aguardando_desde) {
          return Response.json(
            { error: 'O cliente está aguardando resposta. Responda antes de finalizar.', aguardando_desde: registro.aguardando_desde },
            { status: 409 }
          );
        }
        await finalizarConversa({ db, conversa, user });
        return Response.json({ success: true, conversa_id: conversa.id });
      }

      if (acao === 'agendar_finalizar') {
        const motivo = String(body.motivo || '').trim();
        const inicio = String(body.inicio || '');
        const instante = new Date(inicio).getTime();
        if (motivo.length < 3) return Response.json({ error: 'Informe o motivo / próxima ação' }, { status: 400 });
        if (!Number.isFinite(instante) || instante <= Date.now()) {
          return Response.json({ error: 'Informe uma data e horário futuros' }, { status: 400 });
        }

        const registro = await sincronizarAlertaAtendimento({ db, conversa, registro: registroAtual });
        if (registro?.aguardando_desde) {
          return Response.json(
            { error: 'O cliente está aguardando resposta. Responda antes de finalizar.', aguardando_desde: registro.aguardando_desde },
            { status: 409 }
          );
        }

        // Compromisso garantido no servidor (chave estável por conversa + ciclo):
        // se a agenda falhar, a conversa continua aberta.
        let evento: any;
        try {
          evento = await garantirEventoRetorno({
            db,
            conversa,
            user,
            motivo,
            descricao: String(body.descricao || motivo),
            instante,
            ciclo: registro?.atendimento_iniciado_em || conversa.data_ultima_mensagem || '',
          });
        } catch (erroAgenda: any) {
          return Response.json(
            { error: 'Não foi possível salvar o retorno na agenda: ' + (erroAgenda?.message || 'erro desconhecido') },
            { status: 502 }
          );
        }

        if (!evento?.id) {
          return Response.json({ error: 'O retorno não foi confirmado na agenda. Nada foi finalizado.' }, { status: 502 });
        }

        try {
          await finalizarConversa({ db, conversa, user });
        } catch (erroFinalizacao: any) {
          // O compromisso permanece salvo e o retry o reaproveita.
          return Response.json(
            {
              error: 'O retorno foi salvo na agenda, mas a conversa não foi finalizada. Tente novamente.',
              evento_id: evento.id,
            },
            { status: 500 }
          );
        }

        return Response.json({ success: true, evento_id: evento.id, conversa_id: conversa.id });
      }
    }

    // ── Listagem (padrão): recalcula o que mudou e devolve as pendências ──
    const acesso = await carregarAcessoWhatsapp({ db, user, empresaId });
    if (acesso.erroLeitura) {
      return Response.json({ error: 'Não foi possível validar suas permissões' }, { status: 503 });
    }

    const registros = comoLista(await db.AtendimentoAlerta.filter({ empresa_id: empresaId }, '-updated_date', 2000));
    const mapa = new Map<string, any>(registros.map((r) => [r.conversa_id, r]));

    const conversas = comoLista(
      await db.ConversaWhatsapp.filter({ empresa_id: empresaId, status: 'ativa' }, '-data_ultima_mensagem', MAX_CONVERSAS)
    );
    const porId = new Map<string, any>(conversas.map((c) => [c.id, c]));

    // Pendência já gravada nunca é ignorada por idade: se o relógio está
    // correndo, a conversa é carregada mesmo fora da janela recente.
    const pendentesForaDaPagina = registros
      .filter((r) => (r.aguardando_desde || r.atendimento_iniciado_em) && !porId.has(r.conversa_id))
      .slice(0, MAX_BACKLOG_PENDENTES);
    for (let i = 0; i < pendentesForaDaPagina.length; i += 100) {
      const ids = pendentesForaDaPagina.slice(i, i + 100).map((r) => r.conversa_id);
      const lote = comoLista(await db.ConversaWhatsapp.filter({ id: { $in: ids } }, '-data_ultima_mensagem', 100));
      lote.forEach((c) => porId.set(c.id, c));
    }

    // Janela recente: recálculo barato dos últimos 7 dias (a rotina de
    // inatividade encerra conversas paradas há mais tempo). O que está fora da
    // janela e ainda tem pendência entra pela regra acima; o que está fora e
    // não tem registro entra pela varredura rotativa mais abaixo.
    const limiteJanela = Date.now() - JANELA_ALERTA_MS;
    const ehRecente = (c: any) => {
      const ultima = c.data_ultima_mensagem ? new Date(c.data_ultima_mensagem).getTime() : NaN;
      return Number.isFinite(ultima) && ultima >= limiteJanela;
    };

    const elegiveis = [...porId.values()].filter((c) => conversaPertinente(c));
    const autorizadas = elegiveis.filter((c) => {
      if (!podeAcessarConversa(acesso, c)) return false;
      const registro = mapa.get(c.id);
      const pendenteGravada = !!(registro && (registro.aguardando_desde || registro.atendimento_iniciado_em));
      return pendenteGravada || ehRecente(c);
    });

    // Limpeza de segurança: registro pendente de conversa que saiu do fluxo
    // (encerrada/bloqueada/grupo) é descartado — independe de quem está vendo.
    const idsElegiveis = new Set(elegiveis.map((c) => c.id));
    for (const registro of registros) {
      if (!(registro.aguardando_desde || registro.atendimento_iniciado_em)) continue;
      const conversa = porId.get(registro.conversa_id);
      if (conversa && !idsElegiveis.has(conversa.id)) {
        await db.AtendimentoAlerta.delete(registro.id).catch(() => {});
        mapa.delete(registro.conversa_id);
      }
    }

    // Só recalcula quem ainda não tem registro ou recebeu mensagem nova.
    // Quem já tem pendência gravada vem primeiro: o alerta vivo não espera fila.
    const precisaRecalcular = (c: any) => {
      const registro = mapa.get(c.id);
      return !registro || registro.marcador !== marcadorConversa(c);
    };
    const desatualizadas = autorizadas
      .filter(precisaRecalcular)
      .sort(
        (a, b) =>
          Number(!!mapa.get(b.id)?.aguardando_desde || !!mapa.get(b.id)?.atendimento_iniciado_em) -
          Number(!!mapa.get(a.id)?.aguardando_desde || !!mapa.get(a.id)?.atendimento_iniciado_em)
      )
      .slice(0, MAX_RECALCULOS_POR_CHAMADA);

    // Backlog fora da janela e ainda sem registro: uma página por chamada, com
    // cursor persistido por empresa. Ao chegar no fim, recomeça da janela —
    // cobertura completa ao longo do tempo, sem varredura integral por tick.
    let cursorProximo: string | null | undefined;
    if (desatualizadas.length < MAX_RECALCULOS_POR_CHAMADA) {
      const registroCursor =
        comoLista(
          await db.ConfiguracaoSistema.filter({ chave: chaveCursorBacklog(empresaId) }, '-updated_date', 1)
        )[0] || null;
      const cursorAtual = registroCursor?.valor || new Date(limiteJanela).toISOString();
      const antigas = comoLista(
        await db.ConversaWhatsapp.filter(
          { empresa_id: empresaId, status: 'ativa', data_ultima_mensagem: { $lt: cursorAtual } },
          '-data_ultima_mensagem',
          BACKLOG_PAGINA
        )
      );
      antigas.forEach((c) => porId.set(c.id, c));
      const vagas = Math.min(MAX_BACKLOG_RECALC, MAX_RECALCULOS_POR_CHAMADA - desatualizadas.length);
      const candidatas = antigas
        .filter((c) => conversaPertinente(c) && podeAcessarConversa(acesso, c))
        .filter(precisaRecalcular)
        .slice(0, vagas);
      desatualizadas.push(...candidatas);
      if (antigas.length < BACKLOG_PAGINA) {
        cursorProximo = null;
      } else {
        cursorProximo = antigas[antigas.length - 1]?.data_ultima_mensagem || null;
      }
    }

    let limiteAtingido = false;
    for (let i = 0; i < desatualizadas.length && !limiteAtingido; i += 3) {
      const lote = desatualizadas.slice(i, i + 3);
      const resultados = await Promise.allSettled(
        lote.map((conversa) =>
          sincronizarAlertaAtendimento({ db, conversa, registro: mapa.get(conversa.id) || null })
        )
      );
      resultados.forEach((resultado) => {
        if (resultado.status === 'fulfilled' && resultado.value?.conversa_id) {
          mapa.set(resultado.value.conversa_id, resultado.value);
        } else if (resultado.status === 'rejected') {
          const mensagem = String(resultado.reason?.message || '');
          if (mensagem.toLowerCase().includes('rate limit')) limiteAtingido = true;
          console.error('Falha ao recalcular relógio de atendimento:', mensagem);
        }
      });
      // Respiro entre lotes para não estourar o limite de leitura do app.
      await new Promise((resolve) => setTimeout(resolve, 180));
    }

    if (cursorProximo !== undefined) {
      await salvarCursorBacklog(db, empresaId, cursorProximo).catch(() => {});
    }

    // Limpeza limitada: registros de conversas que saíram do "em atendimento"
    // (finalizadas/arquivadas) são descartados para o próximo ciclo começar limpo.
    const idsAtivos = new Set(porId.keys());
    const orfaos = registros.filter((r) => !idsAtivos.has(r.conversa_id)).slice(0, 200);
    if (orfaos.length) {
      const orfasConversas = comoLista(
        await db.ConversaWhatsapp.filter({ id: { $in: orfaos.map((r) => r.conversa_id) } }, '-updated_date', 200)
      );
      const statusPorId = new Map(orfasConversas.map((c) => [c.id, c.status]));
      for (const registro of orfaos) {
        const status = statusPorId.get(registro.conversa_id);
        if (status && status !== 'ativa') {
          await db.AtendimentoAlerta.delete(registro.id).catch(() => {});
          mapa.delete(registro.conversa_id);
        }
      }
    }

    const agora = Date.now();
    const aguardando: any[] = [];
    const revisao: any[] = [];
    const adiados: any[] = [];

    for (const conversa of autorizadas) {
      const registro = mapa.get(conversa.id);
      if (!registro) continue;

      const item = {
        conversa_id: conversa.id,
        connection_id: conversa.connection_id || '',
        cliente_nome: registro.cliente_nome || conversa.cliente_nome || conversa.cliente_telefone || '',
        cliente_telefone: registro.cliente_telefone || conversa.cliente_telefone || '',
        status_conversa: conversa.status,
      };

      if (registro.aguardando_desde) {
        const minutos = minutosDesde(registro.aguardando_desde);
        if (minutos * 60000 < ESPERA_MINIMA_MS) continue;
        const entrada = { ...item, tipo: 'aguardando', aguardando_desde: registro.aguardando_desde, minutos };
        if (registro.alerta_adiado_ate && new Date(registro.alerta_adiado_ate).getTime() > agora) {
          adiados.push({ ...entrada, adiado_ate: registro.alerta_adiado_ate });
        } else {
          aguardando.push(entrada);
        }
        continue;
      }

      if (registro.atendimento_iniciado_em) {
        const minutos = minutosDesde(registro.atendimento_iniciado_em);
        if (minutos * 60000 < REVISAO_ATENDIMENTO_MS) continue;
        if (registro.revisao_adiada_ate && new Date(registro.revisao_adiada_ate).getTime() > agora) continue;
        revisao.push({
          ...item,
          tipo: 'revisao',
          atendimento_iniciado_em: registro.atendimento_iniciado_em,
          minutos,
        });
      }
    }

    // Mais recentes primeiro: são os clientes ainda com conversa viva.
    const porTempo = (a: any, b: any) => a.minutos - b.minutos;
    aguardando.sort(porTempo);
    revisao.sort(porTempo);
    adiados.sort(porTempo);

    const configHorario = await lerConfigHorario(db, empresaId);
    const horario = avaliarHorario(configHorario);

    return Response.json({
      horario_config: configHorario,
      aguardando: aguardando.slice(0, MAX_ITENS),
      revisao: revisao.slice(0, MAX_ITENS),
      adiados: adiados.slice(0, MAX_ITENS),
      total_aguardando: aguardando.length,
      total_revisao: revisao.length,
      total_adiados: adiados.length,
      total: aguardando.length + revisao.length + adiados.length,
      horario,
      atualizado_em: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Erro em alertasAtendimento:', error?.message);
    return Response.json({ error: error?.message || 'Erro inesperado' }, { status: 500 });
  }
}