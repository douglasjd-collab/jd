import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || '699696c2c9f5bffc2e67402b';
    const numero = (body.numero || '5587991426333').replace(/\D/g, '');

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId });
    if (!empresas || empresas.length === 0) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const empresa = empresas[0];
    const evolutionUrl = (empresa.evolution_url || '').replace(/\/$/, '');
    const apiKey = empresa.evolution_api_key || '';
    const instanceName = empresa.evolution_instance_name || '';

    console.log(`🔍 Buscando mensagens do número: ${numero}`);

    // Buscar mensagens recentes via Evolution API
    const resp = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        where: {
          key: {
            remoteJid: `${numero}@s.whatsapp.net`
          }
        },
        limit: 10
      })
    });

    const respText = await resp.text();
    console.log(`📊 Status: ${resp.status} | Body: ${respText.substring(0, 500)}`);

    let mensagens = null;
    try { mensagens = JSON.parse(respText); } catch (_) { mensagens = respText; }

    // Também verificar chats ativos
    const chatsResp = await fetch(`${evolutionUrl}/chat/findChats/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ where: {} })
    });

    const chatsText = await chatsResp.text();
    let chats = null;
    try { chats = JSON.parse(chatsText); } catch (_) { chats = chatsText; }
    
    // Filtrar pelo número
    let chatDoNumero = null;
    if (Array.isArray(chats)) {
      chatDoNumero = chats.find(c => c.id?.includes(numero) || c.remoteJid?.includes(numero));
      console.log(`💬 Total chats: ${chats.length} | Chat do número encontrado: ${!!chatDoNumero}`);
    }

    return Response.json({
      numero_buscado: numero,
      instancia: instanceName,
      mensagens_na_evolution: mensagens,
      chat_encontrado: chatDoNumero,
      total_chats: Array.isArray(chats) ? chats.length : 'erro'
    });

  } catch (e) {
    console.error(`❌ Erro: ${e.message}`);
    return Response.json({ error: e.message }, { status: 500 });
  }
});