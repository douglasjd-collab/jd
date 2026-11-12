// Regras comuns dos lembretes de reunião da Agenda (WhatsApp).
// Usado pelos lembretes agendados por compromisso — cada um acorda no seu
// horário exato, sem verificação periódica da agenda.

export const MSG_CLIENTE_DEFAULT = `📅 *LEMBRETE DE REUNIÃO — JD PROMOTORA*\n\nOlá, {cliente_nome}! 👋\n\nPassando para lembrar que você tem uma reunião agendada conosco.\n\n📆 *Data:* {data}\n🕒 *Horário:* {hora}\n📌 *Assunto:* {titulo}\n{descricao_bloco}{local_bloco}{link_bloco}\n🤝 Nossa equipe estará aguardando você no horário combinado!\n\n*JD Promotora*\n_Seu sonho, nosso compromisso!_ 💚`;

export const MSG_RESPONSAVEL_DEFAULT = `📅 *LEMBRETE DE REUNIÃO — JD PROMOTORA*\n\nOlá, {colaborador_nome}! 👋\n\nVocê tem uma reunião agendada para {data_referencia}. Confira as informações:\n\n👤 *Cliente:* {cliente_nome}\n📆 *Data:* {data}\n🕒 *Horário:* {hora}\n📌 *Assunto:* {titulo}\n{descricao_colaborador}{participantes_bloco}{local_bloco}{link_bloco}\n⚠️ *Prepare-se para o atendimento!*\n\nConfira as informações do cliente e esteja disponível no horário agendado.\n\n💚 *JD Promotora — Gestão de Reuniões*`;

// Janela em que um lembrete atrasado ainda faz sentido ser enviado.
export const JANELA_TOLERANCIA_MS = 15 * 60 * 1000;

export function formatarTempo(minutos: number) {
  if (minutos >= 1440) return `${Math.round(minutos / 1440)} dia(s)`;
  if (minutos >= 60) return `${Math.round(minutos / 60)} hora(s)`;
  return `${minutos} minuto(s)`;
}

// A Agenda não guarda o nome do cliente: quando o compromisso não tem esse
// campo, usamos o trecho depois do separador do título (ex: "Reunião - Murcio").
export function nomeDoCliente(comp: any) {
  if (comp.cliente_nome) return comp.cliente_nome;
  const titulo = String(comp.titulo || '').trim();
  const partes = titulo.split(/\s+[-–—]\s+/);
  const nome = partes.length > 1 ? partes.slice(1).join(' - ') : titulo;
  return nome.trim() || 'Cliente';
}

// Participantes da reunião — todos recebem o aviso no WhatsApp.
// Ordem de leitura: participantes_json (novo) → responsaveis_ids (legado)
// → usuario_id (responsável único antigo).
export function participantesDoCompromisso(comp: any) {
  let lista: any[] = [];
  for (const bruto of [comp.participantes_json, comp.responsaveis_ids]) {
    if (!bruto) continue;
    try {
      const parsed = typeof bruto === 'string' ? JSON.parse(bruto) : bruto;
      if (Array.isArray(parsed) && parsed.length) {
        lista = parsed;
        break;
      }
    } catch {
      // formato inválido: segue para a próxima origem
    }
  }
  if (!lista.length && comp.usuario_id) {
    lista = [{ user_id: comp.usuario_id, nome: comp.usuario_nome }];
  }

  const vistos = new Set<string>();
  const resultado: any[] = [];
  for (const item of lista) {
    const alvo = typeof item === 'string' ? { id: item } : (item || {});
    const chave = alvo.user_id || alvo.id;
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push(alvo);
  }
  return resultado;
}

export function resolverTemplate(template: string, vars: any) {
  return String(template || '')
    .replace(/{cliente_nome}/g, vars.cliente_nome || 'Cliente')
    .replace(/{hora}/g, vars.hora || '')
    .replace(/{titulo}/g, vars.titulo || '')
    .replace(/{faltam}/g, vars.faltam || '')
    .replace(/{data}/g, vars.data || '')
    .replace(/{data_referencia}/g, vars.data_referencia || '')
    .replace(/{colaborador_nome}/g, vars.colaborador_nome || '')
    .replace(/{descricao_bloco}/g, vars.descricao_bloco || '')
    .replace(/{descricao_colaborador}/g, vars.descricao_colaborador || '')
    .replace(/{participantes_bloco}/g, vars.participantes_bloco || '')
    .replace(/{local_bloco}/g, vars.local_bloco || '')
    .replace(/{link_bloco}/g, vars.link_bloco || '');
}

export function horaLocal(inicio: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(inicio);
}

export function temposDoConfig(config: any) {
  const lista = config?.tempos_minutos?.length ? config.tempos_minutos : [60, 10];
  return lista
    .map((n: any) => Number(n))
    .filter((n: number) => Number.isFinite(n) && n >= 0)
    .sort((a: number, b: number) => b - a);
}

export function horaDoLembrete(inicioMs: number, minutosAntes: number) {
  return inicioMs - minutosAntes * 60000;
}

async function enviarWhatsApp(base44: any, empresaId: string, telefone: string, mensagem: string) {
  // Lembretes automáticos usam sempre a D-API (nunca a Meta Oficial)
  const conexoes = await base44.asServiceRole.entities.WhatsappConnection.filter(
    { empresa_id: empresaId, provider_type: 'dapi', is_active: true },
    '-created_date',
    1
  );
  const conexao = conexoes[0];
  if (!conexao) throw new Error('Nenhuma conexão D-API ativa para esta empresa');
  const digits = telefone.replace(/\D/g, '');
  const numeroInternacional = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  if (!/^\d{12,15}$/.test(numeroInternacional)) throw new Error('Telefone inválido para envio internacional');
  const resposta = await base44.functions.invoke('whatsappService', {
    connectionId: conexao.id,
    action: 'sendText',
    phoneNumber: numeroInternacional,
    text: mensagem,
  });
  const envelope = resposta?.data;
  const resultado = envelope?.data;
  if (envelope?.success !== true || resultado?.success !== true) {
    throw new Error(resultado?.error || envelope?.error || 'Provedor não confirmou o envio do lembrete');
  }
  return resposta;
}

async function registrar(base44: any, comp: any, dados: any) {
  await base44.asServiceRole.entities.AgendaLembretesEnviados.create({
    agenda_id: comp.id,
    empresa_id: comp.empresa_id,
    horario_programado: new Date(horaDoLembrete(new Date(comp.inicio).getTime(), dados.minutos_antes)).toISOString(),
    horario_enviado: new Date().toISOString(),
    ...dados,
  });
}

// Envia os lembretes de um compromisso para um tempo específico (minutos antes).
// Retorna quantos foram enviados e quantos falharam.
export async function enviarLembretesDoTempo(base44: any, comp: any, config: any, minutosAntes: number) {
  const inicio = new Date(comp.inicio);
  const hora = horaLocal(inicio);
  const faltam = formatarTempo(Math.max(1, Math.round((inicio.getTime() - Date.now()) / 60000)));
  // Configurações antigas com os modelos legados migram para o novo padrão.
  // Modelos personalizados continuam sendo respeitados.
  const legadoCliente = 'Olá {cliente_nome} 👋';
  const legadoResponsavel = '⏰ *Lembrete de reunião*';
  const msgCliente = !config.mensagem_cliente || config.mensagem_cliente.startsWith(legadoCliente)
    ? MSG_CLIENTE_DEFAULT : config.mensagem_cliente;
  const msgResponsavel = !config.mensagem_responsavel || config.mensagem_responsavel.startsWith(legadoResponsavel)
    ? MSG_RESPONSAVEL_DEFAULT : config.mensagem_responsavel;
  const clienteNome = nomeDoCliente(comp);
  const data = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(inicio);
  const hoje = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
  const participantesNomes = participantesDoCompromisso(comp).map(p => p.nome).filter(Boolean).join(', ');
  const campos = {
    cliente_nome: clienteNome, hora: hora.replace(':', 'h'), titulo: comp.titulo, faltam, data,
    data_referencia: data === hoje ? 'hoje' : data,
    descricao_bloco: comp.descricao?.trim() ? '\n📝 *Sobre a reunião:*\n' + comp.descricao.trim() + '\n' : '',
    descricao_colaborador: comp.descricao?.trim() ? '\n📝 *Descrição da reunião:*\n' + comp.descricao.trim() + '\n' : '',
    participantes_bloco: participantesNomes ? '\n👥 *Participantes:* ' + participantesNomes + '\n' : '',
    local_bloco: comp.local?.trim() ? '\n📍 *Local:* ' + comp.local.trim() + '\n' : '',
    link_bloco: comp.link_reuniao?.trim() ? '🔗 *Link da reunião:* ' + comp.link_reuniao.trim() + '\n' : '',
  };

  let enviados = 0;
  let erros = 0;

  const existentes = await base44.asServiceRole.entities.AgendaLembretesEnviados.filter({
    agenda_id: comp.id,
    minutos_antes: minutosAntes,
  });
  const jaEnviados = (existentes || []).filter((e: any) => e.status === 'enviado');

  // Cliente
  if (config.enviar_para_cliente !== false && comp.telefone) {
    const telefone = String(comp.telefone).replace(/\D/g, '');
    const jaEnviado = jaEnviados.find((j: any) => j.tipo === 'cliente' && j.destinatario_telefone === telefone);

    if (!jaEnviado && telefone.length >= 10) {
      const mensagem = resolverTemplate(msgCliente, campos);
      let status = 'enviado';
      let erro: string | null = null;
      try {
        await enviarWhatsApp(base44, comp.empresa_id, telefone, mensagem);
        enviados++;
      } catch (e: any) {
        status = 'erro';
        erro = e.message;
        erros++;
      }
      await registrar(base44, comp, {
        destinatario_telefone: telefone,
        destinatario_nome: clienteNome,
        tipo: 'cliente',
        minutos_antes: minutosAntes,
        status,
        erro,
      });
    }
  }

  // Participantes da reunião — todos recebem o aviso no WhatsApp.
  if (config.enviar_para_responsaveis !== false) {
    for (const alvo of participantesDoCompromisso(comp)) {
      let colab = (await base44.asServiceRole.entities.Colaborador.filter(
        alvo.user_id ? { user_id: alvo.user_id } : { id: alvo.id }
      ))?.[0];
      if (!colab && alvo.id && alvo.user_id) {
        colab = (await base44.asServiceRole.entities.Colaborador.filter({ id: alvo.id }))?.[0];
      }

      // Telefone do cadastro do colaborador; se não houver, usa o snapshot
      // gravado no próprio participante.
      const telefoneBruto = colab?.telefone || alvo.telefone;
      if (!telefoneBruto) continue;

      const telefone = String(telefoneBruto).replace(/\D/g, '');
      if (telefone.length < 10) continue;
      if (jaEnviados.find((j: any) => j.tipo === 'responsavel' && j.destinatario_telefone === telefone)) continue;

      const mensagem = resolverTemplate(msgResponsavel, { ...campos, colaborador_nome: (colab?.nome || alvo.nome || 'Colaborador').split(' ')[0] });
      let status = 'enviado';
      let erro: string | null = null;
      try {
        await enviarWhatsApp(base44, comp.empresa_id, telefone, mensagem);
        enviados++;
      } catch (e: any) {
        status = 'erro';
        erro = e.message;
        erros++;
      }
      await registrar(base44, comp, {
        destinatario_telefone: telefone,
        destinatario_nome: colab?.nome || alvo.nome || 'Participante',
        tipo: 'responsavel',
        minutos_antes: minutosAntes,
        status,
        erro,
      });
    }
  }

  return { enviados, erros };
}