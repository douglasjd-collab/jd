import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MSG_CLIENTE_DEFAULT = `Olá {cliente_nome} 👋\n\nLembramos que você possui uma reunião agendada hoje às {hora}.\n\nAssunto: {titulo}\n\nEquipe JD Promotora.`;
const MSG_RESPONSAVEL_DEFAULT = `⏰ *Lembrete de reunião*\n\nCliente: {cliente_nome}\nHorário: {hora}\nAssunto: {titulo}\n\nFaltam {faltam} para a reunião.`;

function formatarTempo(minutos) {
  if (minutos >= 1440) return `${Math.round(minutos / 1440)} dia(s)`;
  if (minutos >= 60) return `${Math.round(minutos / 60)} hora(s)`;
  return `${minutos} minuto(s)`;
}

function resolverTemplate(template, vars) {
  return template
    .replace(/{cliente_nome}/g, vars.cliente_nome || 'Cliente')
    .replace(/{hora}/g, vars.hora || '')
    .replace(/{titulo}/g, vars.titulo || '')
    .replace(/{faltam}/g, vars.faltam || '');
}

async function enviarWhatsApp(base44, empresaId, telefone, mensagem) {
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
    text: mensagem
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Buscar todas empresas com configuração ativa
    const configs = await base44.asServiceRole.entities.ConfiguracaoLembretesAgenda.filter({ ativo: true });
    if (!configs || configs.length === 0) {
      return Response.json({ success: true, message: 'Nenhuma configuração ativa encontrada' });
    }

    const now = new Date();
    let totalEnviados = 0;
    let totalErros = 0;

    for (const config of configs) {
      const empresaId = config.empresa_id;
      const tempos = config.tempos_minutos || [60, 10];
      const msgCliente = config.mensagem_cliente || MSG_CLIENTE_DEFAULT;
      const msgResponsavel = config.mensagem_responsavel || MSG_RESPONSAVEL_DEFAULT;

      // Buscar compromissos ativos das próximas X horas (pega o maior intervalo + 30min)
      const maxMinutos = Math.max(...tempos, 60);
      const futuro = new Date(now.getTime() + (maxMinutos + 60) * 60 * 1000);

      const compromissos = await base44.asServiceRole.entities.Agenda.filter({
        empresa_id: empresaId,
        status: { $in: ['agendado', 'confirmado'] },
        inicio: { $gte: now.toISOString(), $lte: futuro.toISOString() },
      }, 'inicio', 500);

      for (const comp of (compromissos || [])) {
        const inicio = new Date(comp.inicio);
        const diffMin = (inicio.getTime() - now.getTime()) / 60000;
        const hora = `${String(inicio.getHours()).padStart(2,'0')}:${String(inicio.getMinutes()).padStart(2,'0')}`;

        for (const minAntes of tempos) {
          // Janela: entre minAntes+2 e minAntes-2 minutos antes
          if (diffMin > minAntes + 2 || diffMin < minAntes - 2) continue;

          // Verificar se já foi enviado para este compromisso + minutos
          const jaEnviado = await base44.asServiceRole.entities.AgendaLembretesEnviados.filter({
            agenda_id: comp.id,
            minutos_antes: minAntes,
            status: 'enviado',
          });

          // Enviar para cliente
          if (config.enviar_para_cliente !== false && comp.telefone) {
            const telefone = comp.telefone.replace(/\D/g, '');
            const jaEnviadoCliente = (jaEnviado || []).find(j => j.tipo === 'cliente' && j.destinatario_telefone === telefone);
            
            if (!jaEnviadoCliente && telefone.length >= 10) {
              const clienteNome = comp.cliente_nome || comp.titulo || 'Cliente';
              const msg = resolverTemplate(msgCliente, { cliente_nome: clienteNome, hora, titulo: comp.titulo, faltam: formatarTempo(minAntes) });
              
              let status = 'enviado';
              let erro = null;
              try {
                await enviarWhatsApp(base44, empresaId, telefone, msg);
                totalEnviados++;
              } catch (e) {
                status = 'erro';
                erro = e.message;
                totalErros++;
              }

              await base44.asServiceRole.entities.AgendaLembretesEnviados.create({
                agenda_id: comp.id,
                empresa_id: empresaId,
                destinatario_telefone: telefone,
                destinatario_nome: clienteNome,
                tipo: 'cliente',
                minutos_antes: minAntes,
                horario_programado: new Date(inicio.getTime() - minAntes * 60000).toISOString(),
                horario_enviado: new Date().toISOString(),
                status,
                erro,
              });
            }
          }

          // Enviar para responsáveis
          if (config.enviar_para_responsaveis !== false && comp.responsaveis_ids) {
            let responsaveisIds = [];
            try { responsaveisIds = JSON.parse(comp.responsaveis_ids); } catch {}

            for (const respId of responsaveisIds) {
              const colabs = await base44.asServiceRole.entities.Colaborador.filter({ id: respId });
              const colab = colabs?.[0];
              if (!colab || !colab.telefone) continue;
              
              const telefone = colab.telefone.replace(/\D/g, '');
              const jaEnviadoResp = (jaEnviado || []).find(j => j.tipo === 'responsavel' && j.destinatario_telefone === telefone);
              if (jaEnviadoResp || telefone.length < 10) continue;

              const msg = resolverTemplate(msgResponsavel, {
                cliente_nome: comp.cliente_nome || comp.titulo || 'Cliente',
                hora,
                titulo: comp.titulo,
                faltam: formatarTempo(minAntes),
              });

              let status = 'enviado';
              let erro = null;
              try {
                await enviarWhatsApp(base44, empresaId, telefone, msg);
                totalEnviados++;
              } catch (e) {
                status = 'erro';
                erro = e.message;
                totalErros++;
              }

              await base44.asServiceRole.entities.AgendaLembretesEnviados.create({
                agenda_id: comp.id,
                empresa_id: empresaId,
                destinatario_telefone: telefone,
                destinatario_nome: colab.nome,
                tipo: 'responsavel',
                minutos_antes: minAntes,
                horario_programado: new Date(inicio.getTime() - minAntes * 60000).toISOString(),
                horario_enviado: new Date().toISOString(),
                status,
                erro,
              });
            }
          }
        }
      }
    }

    return Response.json({ success: true, enviados: totalEnviados, erros: totalErros });
  } catch (e) {
    console.error('Erro processarLembretesAgendaWhatsApp:', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
});