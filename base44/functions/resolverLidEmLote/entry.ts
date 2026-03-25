// Tenta resolver todos os @lid recentes em lote e criar conversas para eles
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

async function tentarResolverLid(lid, evolutionUrl, evolutionKey, instanceName) {
  const lidNumerico = lid.replace(/@lid/g, '').replace(/\D/g, '');

  // Método 1: fetchProfile
  try {
    const res = await fetch(`${evolutionUrl}/contact/fetchProfile/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: lidNumerico })
    });
    if (res.ok) {
      const data = await res.json();
      const jid = data?.jid || data?.wuid || data?.id || data?.remoteJid || '';
      const tel = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
      if (tel && tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) {
        return { telefone: tel, metodo: 'fetchProfile' };
      }
    }
  } catch (e) { console.warn('fetchProfile falhou:', e.message); }

  // Método 2: getWhatsappContact
  try {
    const res2 = await fetch(`${evolutionUrl}/misc/getWhatsappContact/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: lidNumerico })
    });
    if (res2.ok) {
      const data2 = await res2.json();
      const jid = data2?.jid || data2?.id || '';
      const tel = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
      if (tel && tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) {
        return { telefone: tel, metodo: 'getWhatsappContact' };
      }
    }
  } catch (e) { console.warn('getWhatsappContact falhou:', e.message); }

  // Método 3: buscar nas mensagens pelo lid para tentar encontrar um número real associado
  try {
    const res3 = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: { key: { remoteJid: lid } }, limit: 5 })
    });
    if (res3.ok) {
      const data3 = await res3.json();
      const msgs = Array.isArray(data3) ? data3 : (data3.messages?.records || data3.messages || []);
      for (const m of msgs) {
        const alt = m.key?.remoteJidAlt || m.key?.participant || '';
        const tel = alt.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
        if (tel && tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) {
          return { telefone: tel, metodo: 'mensagem_alt' };
        }
      }
    }
  } catch (e) { console.warn('findMessages lid falhou:', e.message); }

  return null;
}

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

    // Buscar mensagens recentes com @lid (últimas 24h)
    const agoSeconds = Math.floor((Date.now() - (24 * 60 * 60 * 1000)) / 1000);
    const resMsgs = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        where: { messageTimestamp: { $gte: agoSeconds } },
        limit: 500
      })
    });

    if (!resMsgs.ok) {
      return Response.json({ erro: `Evolution ${resMsgs.status}` }, { status: 500 });
    }

    const dataMsgs = await resMsgs.json();
    const mensagens = Array.isArray(dataMsgs) ? dataMsgs : (dataMsgs.messages?.records || dataMsgs.messages || []);

    // Coletar @lid únicos
    const lidsUnicos = new Map();
    for (const msg of mensagens) {
      const jid = msg.key?.remoteJid || '';
      if (jid.includes('@lid') && !lidsUnicos.has(jid)) {
        lidsUnicos.set(jid, { pushName: msg.pushName || 'Cliente', timestamp: msg.messageTimestamp, msg });
      }
    }

    console.log(`🔍 ${lidsUnicos.size} @lid únicos para resolver`);

    const resultados = [];
    let resolvidos = 0;
    let falhas = 0;

    for (const [lid, info] of lidsUnicos) {
      const lidNumerico = lid.replace(/@lid/g, '').replace(/\D/g, '');

      // Verificar se já temos no ContatoWhatsapp
      const contatosExistentes = await base44.asServiceRole.entities.ContatoWhatsapp.filter({
        empresa_id: JD_ID, lid_jid: lidNumerico
      });

      if (contatosExistentes.length > 0 && contatosExistentes[0].telefone) {
        const tel = contatosExistentes[0].telefone;
        resultados.push({ lid, pushName: info.pushName, status: 'ja_resolvido', telefone: tel });
        
        // Garantir que tem conversa
        const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
          empresa_id: JD_ID, cliente_telefone: tel
        });
        if (conversas.length === 0) {
          await base44.asServiceRole.entities.ConversaWhatsapp.create({
            empresa_id: JD_ID,
            cliente_nome: info.pushName || tel,
            cliente_telefone: tel,
            whatsapp_id: lid,
            status: 'ativa',
            ultima_mensagem: 'Conversa restaurada',
            data_ultima_mensagem: new Date().toISOString(),
            tipo_conexao: 'empresa',
            instancia: instanceName
          });
          console.log(`✅ Conversa criada para LID já resolvido: ${tel}`);
        }
        continue;
      }

      // Tentar resolver
      const resultado = await tentarResolverLid(lid, evolutionUrl, evolutionKey, instanceName);

      if (resultado) {
        const { telefone, metodo } = resultado;
        resolvidos++;

        // Salvar no ContatoWhatsapp
        await base44.asServiceRole.entities.ContatoWhatsapp.create({
          empresa_id: JD_ID,
          telefone,
          nome: info.pushName || telefone,
          lid_jid: lidNumerico,
          ultima_atualizacao: new Date().toISOString()
        }).catch(() => {});

        // Criar ou atualizar conversa
        const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
          empresa_id: JD_ID, cliente_telefone: telefone
        });
        if (conversas.length === 0) {
          await base44.asServiceRole.entities.ConversaWhatsapp.create({
            empresa_id: JD_ID,
            cliente_nome: info.pushName || telefone,
            cliente_telefone: telefone,
            whatsapp_id: lid,
            status: 'ativa',
            ultima_mensagem: 'Conversa via resolução @lid',
            data_ultima_mensagem: new Date().toISOString(),
            tipo_conexao: 'empresa',
            instancia: instanceName
          });
        }

        resultados.push({ lid, pushName: info.pushName, status: 'resolvido', telefone, metodo });
        console.log(`✅ LID resolvido: ${lid} → ${telefone} (${metodo})`);
      } else {
        falhas++;
        resultados.push({ lid, pushName: info.pushName, status: 'falha', motivo: 'Não foi possível resolver o @lid via API' });
        console.warn(`❌ LID não resolvido: ${lid} (${info.pushName})`);
      }

      // Pequeno delay para não sobrecarregar a API
      await new Promise(r => setTimeout(r, 300));
    }

    return Response.json({
      total_lids: lidsUnicos.size,
      resolvidos,
      falhas,
      resultados
    });

  } catch (e) {
    return Response.json({ erro: e.message }, { status: 500 });
  }
});