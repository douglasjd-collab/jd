import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * Monitor de recebimento do WhatsApp (D-API).
 *
 * Motivo: em 28/09/2026 a sessão ficou fora do ar por ~2h40 e o CRM parou de receber mensagens
 * sem avisar ninguém — mensagens com placa/CPF do cliente se perderam. Esta rotina roda de
 * tempos em tempos (workflow agendado) e:
 *   1. Reconecta automaticamente sessões que a própria D-API reporta fora do ar;
 *   2. Avisa no Telegram quando NENHUMA mensagem entra no CRM por mais de MINUTOS_SILENCIO.
 */

const MINUTOS_SILENCIO = 60; // sem receber nada por 60 min => provável queda
const HORA_INICIO = 7; // só monitora silêncio entre 07h e 22h (America/Sao_Paulo)
const HORA_FIM = 22;
const INTERVALO_ALERTA_MIN = 120; // não repetir o mesmo alerta antes de 2h

async function avisarTelegram(texto) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return false;

  const resposta = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML' }),
  });
  const dados = await resposta.json().catch(() => ({}));
  return !!dados.ok;
}

async function alertaRecente(db, empresaId) {
  const configs = await db.entities.ConfiguracaoSistema.filter({ chave: `alerta_silencio_whatsapp_${empresaId}` }, '-created_date', 1);
  const valor = configs[0]?.valor;
  if (!valor) return false;
  const minutos = (Date.now() - new Date(valor).getTime()) / 60000;
  return minutos < INTERVALO_ALERTA_MIN;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Chamadas do workflow agendado chegam sem usuário (service role) — só essas são liberadas sem perfil admin.
    const isServiceRoleCall = !user || !user.email || !user.perfil;
    if (!isServiceRoleCall && !['master', 'super_admin', 'admin'].includes(user.perfil)) {
      return Response.json({ error: 'Forbidden - Admin only' }, { status: 403 });
    }
    const db = isServiceRoleCall ? base44.asServiceRole : base44;

    const conexoes = await db.entities.WhatsappConnection.filter({ provider_type: 'dapi', is_active: true }, '-created_date', 200);
    const empresas = [...new Set(conexoes.map((c) => c.empresa_id).filter(Boolean))];

    const resultado = {
      sessoes_verificadas: conexoes.length,
      sessoes_reconectadas: [],
      empresas_sem_receber: [],
      alertas_enviados: 0,
    };

    // 1) Sessões que a D-API reporta fora do ar: reconecta na hora e avisa.
    for (const conexao of conexoes) {
      try {
        const resposta = await db.functions.invoke('whatsappService', {
          connectionId: conexao.id,
          action: 'getStatus',
        });
        const status = (resposta?.data ?? resposta ?? {}).status;
        if (!status || status === 'conectado' || status === 'reiniciando') continue;

        const reconexao = await db.functions.invoke('whatsappService', {
          connectionId: conexao.id,
          action: 'reconnect',
        });
        const reconectou = (reconexao?.data ?? reconexao ?? {}).success !== false;

        await db.entities.WhatsappConnection.update(conexao.id, {
          status: reconectou ? 'reiniciando' : 'desconectado',
          last_error_at: new Date().toISOString(),
          last_error_message: `Sessão reportada como "${status}" pela D-API — reconexão automática ${reconectou ? 'disparada' : 'falhou'}`,
        });

        resultado.sessoes_reconectadas.push({ conexao: conexao.nome, status, reconectou });
        await avisarTelegram(
          `⚠️ <b>WhatsApp fora do ar</b>\nSessão: <b>${conexao.nome || conexao.session_id}</b>\nStatus: ${status}\nReconexão automática: ${reconectou ? 'disparada' : 'falhou'}`
        );
        resultado.alertas_enviados++;
      } catch (e) {
        console.error(`Erro ao verificar sessão ${conexao.nome}:`, e.message);
      }
    }

    // 2) Silêncio total de recebimento (nenhuma mensagem entrando no CRM).
    const horaLocal = Number(
      new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date())
    );
    if (horaLocal < HORA_INICIO || horaLocal >= HORA_FIM) {
      return Response.json({ ...resultado, observacao: 'Fora do horário monitorado — silêncio não avaliado.' });
    }

    for (const empresaId of empresas) {
      const ultimos = await db.entities.WhatsappConnectionLog.filter({ empresa_id: empresaId, direction: 'inbound' }, '-created_date', 1);
      const ultimoEvento = ultimos[0]?.created_date;
      if (!ultimoEvento) continue;

      const minutosSemReceber = Math.floor((Date.now() - new Date(ultimoEvento).getTime()) / 60000);
      if (minutosSemReceber < MINUTOS_SILENCIO) continue;

      resultado.empresas_sem_receber.push({ empresa_id: empresaId, minutos_sem_receber: minutosSemReceber });
      if (await alertaRecente(db, empresaId)) continue;

      await avisarTelegram(
        `🚨 <b>CRM sem receber mensagens</b>\nNenhuma mensagem entrou no sistema há <b>${minutosSemReceber} minutos</b>.\nQuando isso aconteceu antes, mensagens com placa e CPF do cliente se perderam. Verifique o celular/sessão do WhatsApp e reconecte se necessário.`
      );
      await db.entities.ConfiguracaoSistema.create({
        chave: `alerta_silencio_whatsapp_${empresaId}`,
        valor: new Date().toISOString(),
      });
      resultado.alertas_enviados++;
    }

    return Response.json(resultado);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}