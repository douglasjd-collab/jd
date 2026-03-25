// Diagnóstico: busca mensagens recentes da Evolution e mostra quais são bloqueadas e por quê
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const JD_ID = '699696c2c9f5bffc2e67402b';
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
    const empresa = empresas?.[0];

    if (!empresa?.evolution_url || !empresa?.evolution_api_key || !empresa?.evolution_instance_name) {
      return Response.json({ erro: 'Configuração Evolution incompleta' }, { status: 400 });
    }

    const evolutionUrl = empresa.evolution_url.replace(/\/$/, '');
    const evolutionKey = empresa.evolution_api_key;
    const instanceName = empresa.evolution_instance_name;

    // Buscar mensagens recentes (últimas 3 horas)
    const agoSeconds = Math.floor((Date.now() - (3 * 60 * 60 * 1000)) / 1000);
    const resMsgs = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        where: { messageTimestamp: { $gte: agoSeconds } },
        limit: 200
      })
    });

    if (!resMsgs.ok) {
      return Response.json({ erro: `Evolution ${resMsgs.status}: ${await resMsgs.text()}` }, { status: 500 });
    }

    const dataMsgs = await resMsgs.json();
    const mensagens = Array.isArray(dataMsgs) ? dataMsgs : (dataMsgs.messages?.records || dataMsgs.messages || []);

    const bloqueadas = [];
    const lidNaoResolvidos = [];
    const ok = [];
    const jidsVistos = new Set();

    for (const msg of mensagens) {
      const key = msg.key || {};
      const jid = key.remoteJid || '';
      if (jidsVistos.has(jid)) continue;
      jidsVistos.add(jid);

      const pushName = msg.pushName || '';
      const timestamp = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000).toLocaleString('pt-BR') : '?';

      if (jid.includes('@g.us') || jid.includes('@broadcast')) continue;

      if (jid.includes('@lid')) {
        lidNaoResolvidos.push({ jid, pushName, timestamp, motivo: 'JID @lid — privacidade WhatsApp' });
        continue;
      }

      const numeros = jid.replace(/@s\.whatsapp\.net|@c\.us|@s\.whatsapp\.net:\d+/g, '').replace(/\D/g, '');

      if (!numeros) {
        bloqueadas.push({ jid, pushName, timestamp, motivo: 'Número vazio após limpeza' });
        continue;
      }

      if (numeros.length < 8 || numeros.length > 15) {
        bloqueadas.push({ jid, numeros, pushName, timestamp, motivo: `Tamanho inválido: ${numeros.length} dígitos` });
        continue;
      }

      if (!numeros.startsWith('55')) {
        bloqueadas.push({ jid, numeros, pushName, timestamp, motivo: `DDI diferente de 55 (BR): começa com "${numeros.substring(0, 4)}"` });
        continue;
      }

      if (numeros.length !== 12 && numeros.length !== 13) {
        bloqueadas.push({ jid, numeros, pushName, timestamp, motivo: `Comprimento inválido para BR: ${numeros.length} dígitos` });
        continue;
      }

      ok.push({ jid, numeros, pushName, timestamp });
    }

    return Response.json({
      total_mensagens_analisadas: mensagens.length,
      ok_count: ok.length,
      bloqueadas_count: bloqueadas.length,
      lid_count: lidNaoResolvidos.length,
      resumo: `${ok.length} OK | ${bloqueadas.length} bloqueadas | ${lidNaoResolvidos.length} @lid não resolvidos`,
      bloqueadas,
      lid_nao_resolvidos: lidNaoResolvidos,
    });

  } catch (e) {
    return Response.json({ erro: e.message, stack: e.stack }, { status: 500 });
  }
});