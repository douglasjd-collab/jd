// Regras comuns dos lembretes de reunião da Agenda (WhatsApp).
// Usado pelos lembretes agendados por compromisso — cada um acorda no seu
// horário exato, sem verificação periódica da agenda.

export const MSG_CLIENTE_DEFAULT = `Olá {cliente_nome} 👋\n\nLembramos que você possui uma reunião agendada hoje às {hora}.\n\nAssunto: {titulo}\n\nEquipe JD Promotora.`;

export const MSG_RESPONSAVEL_DEFAULT = `⏰ *Lembrete de reunião*\n\nCliente: {cliente_nome}\nHorário: {hora}\nAssunto: {titulo}\n\nFaltam {faltam} para a reunião.`;

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

export function resolverTemplate(template: string, vars: any) {
  return String(template || '')
    .replace(/{cliente_nome}/g, vars.cliente_nome || 'Cliente')
    .replace(/{hora}/g, vars.hora || '')
    .replace(/{titulo}/g, vars.titulo || '')
    .replace(/{faltam}/g, vars.faltam || '');
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
  return await base44.functions.invoke('whatsappService', {
    connectionId: conexao.id,
    action: 'sendText',
    phoneNumber: telefone.replace(/\D/g, ''),
    text: mensagem,
  });
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
  const msgCliente = config.mensagem_cliente || MSG_CLIENTE_DEFAULT;
  const msgResponsavel = config.mensagem_responsavel || MSG_RESPONSAVEL_DEFAULT;
  const clienteNome = nomeDoCliente(comp);

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
      const mensagem = resolverTemplate(msgCliente, { cliente_nome: clienteNome, hora, titulo: comp.titulo, faltam });
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

  // Responsáveis — a Agenda guarda o responsável em usuario_id (usuário
  // autenticado); compromissos antigos podem ter a lista em responsaveis_ids.
  if (config.enviar_para_responsaveis !== false) {
    let responsaveis: any[] = [];
    try {
      responsaveis = JSON.parse(comp.responsaveis_ids || '[]') || [];
    } catch {
      responsaveis = [];
    }
    if (!responsaveis.length && comp.usuario_id) {
      responsaveis = [{ user_id: comp.usuario_id }];
    }

    for (const resp of responsaveis) {
      const alvo = typeof resp === 'string' ? { id: resp } : (resp || {});
      if (!alvo.user_id && !alvo.id) continue;

      const colabs = await base44.asServiceRole.entities.Colaborador.filter(
        alvo.user_id ? { user_id: alvo.user_id } : { id: alvo.id }
      );
      const colab = colabs?.[0];
      if (!colab || !colab.telefone) continue;

      const telefone = String(colab.telefone).replace(/\D/g, '');
      if (telefone.length < 10) continue;
      if (jaEnviados.find((j: any) => j.tipo === 'responsavel' && j.destinatario_telefone === telefone)) continue;

      const mensagem = resolverTemplate(msgResponsavel, { cliente_nome: clienteNome, hora, titulo: comp.titulo, faltam });
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
        destinatario_nome: colab.nome,
        tipo: 'responsavel',
        minutos_antes: minutosAntes,
        status,
        erro,
      });
    }
  }

  return { enviados, erros };
}