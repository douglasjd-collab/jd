// Diagnóstico específico para o número de teste 87991426333
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const JD_ID = '699696c2c9f5bffc2e67402b';
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
    const empresa = empresas?.[0];

    const evolutionUrl = empresa.evolution_url.replace(/\/$/, '');
    const evolutionKey = empresa.evolution_api_key;
    const instanceName = empresa.evolution_instance_name;

    // 1. Buscar todas as mensagens do número específico na Evolution
    const resTel = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        where: {
          key: { remoteJid: { $regex: '5587991426333' } }
        },
        limit: 20
      })
    });
    
    const dataTel = await resTel.json();
    const msgsTel = Array.isArray(dataTel) ? dataTel : (dataTel.messages?.records || dataTel.messages || dataTel.records || []);

    // 2. Sem filtro nenhum — últimas 10
    const resAll = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 10 })
    });
    const dataAll = await resAll.json();
    const msgsAll = Array.isArray(dataAll) ? dataAll : (dataAll.messages?.records || dataAll.messages || dataAll.records || []);

    // 3. Checar conversa no banco
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
      empresa_id: JD_ID, cliente_telefone: '5587991426333'
    });
    const conversa87 = conversas?.[0];

    let mensagensDB = [];
    if (conversa87) {
      mensagensDB = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
        { conversa_id: conversa87.id },
        '-created_date',
        10
      );
    }

    // 4. Logs de webhook recentes para esse número
    const logs = await base44.asServiceRole.entities.LogRecebimentoWebhook.filter(
      { empresa_id: JD_ID, telefone: { $regex: '87991426333' } },
      '-created_date',
      20
    ).catch(() => []);

    return Response.json({
      evolution: {
        total_sem_filtro: msgsAll.length,
        ultimas_10_raw: msgsAll.map(m => ({
          id: m.key?.id,
          jid: m.key?.remoteJid,
          fromMe: m.key?.fromMe,
          ts: m.messageTimestamp,
          data: m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toISOString() : null,
          texto: m.message?.conversation || m.message?.extendedTextMessage?.text || JSON.stringify(m.message).substring(0, 60)
        })),
        msgs_numero_teste: msgsTel.map(m => ({
          id: m.key?.id,
          jid: m.key?.remoteJid,
          fromMe: m.key?.fromMe,
          ts: m.messageTimestamp,
          data: m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toISOString() : null,
          texto: m.message?.conversation || JSON.stringify(m.message).substring(0, 60)
        }))
      },
      banco: {
        conversa: conversa87 ? { id: conversa87.id, ultima_msg: conversa87.ultima_mensagem, data: conversa87.data_ultima_mensagem } : null,
        total_mensagens_db: mensagensDB.length,
        ultimas_msgs_db: mensagensDB.map(m => ({ remetente: m.remetente, texto: m.texto, data: m.data_envio, wid: m.whatsapp_message_id }))
      },
      logs_webhook: logs.map(l => ({ tipo: l.tipo_evento, telefone: l.telefone, conteudo: l.conteudo, status: l.status, ts: l.created_date }))
    });

  } catch (e) {
    return Response.json({ erro: e.message, stack: e.stack }, { status: 500 });
  }
});