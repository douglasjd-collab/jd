// Resolve todos os @lid pendentes: busca no banco E nas mensagens recentes da Evolution
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

  // Método 2: buscar nas mensagens pelo lid — remoteJidAlt (mais confiável)
  try {
    const res2 = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: { key: { remoteJid: lid } }, limit: 10 })
    });
    if (res2.ok) {
      const data2 = await res2.json();
      const msgs = Array.isArray(data2) ? data2 : (data2.messages?.records || data2.messages || []);
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

    // ====================================================
    // FONTE 1: Conversas no banco com whatsapp_id contendo @lid
    // ====================================================
    const todasConversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: JD_ID },
      '-created_date',
      500
    );

    const conversasLid = todasConversas.filter(c =>
      c.whatsapp_id && c.whatsapp_id.includes('@lid') &&
      (!c.cliente_telefone || c.cliente_telefone.includes('@lid') || c.cliente_telefone.length < 10)
    );

    console.log(`🗄️ ${conversasLid.length} conversas com @lid no banco`);

    // ====================================================
    // FONTE 2: Mensagens recentes na Evolution (30 dias)
    // ====================================================
    const agoSeconds = Math.floor((Date.now() - (30 * 24 * 60 * 60 * 1000)) / 1000);
    const resMsgs = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        where: { messageTimestamp: { $gte: agoSeconds } },
        limit: 1000
      })
    });

    const lidsUnicos = new Map();

    // Adicionar @lid das conversas do banco
    for (const conv of conversasLid) {
      const lid = conv.whatsapp_id;
      if (!lidsUnicos.has(lid)) {
        lidsUnicos.set(lid, {
          pushName: conv.cliente_nome || 'Cliente',
          conversa_id: conv.id,
          conversa: conv
        });
      }
    }

    // Adicionar @lid das mensagens da Evolution
    if (resMsgs.ok) {
      const dataMsgs = await resMsgs.json();
      const mensagens = Array.isArray(dataMsgs) ? dataMsgs : (dataMsgs.messages?.records || dataMsgs.messages || []);
      console.log(`📨 ${mensagens.length} mensagens encontradas na Evolution`);

      for (const msg of mensagens) {
        const jid = msg.key?.remoteJid || '';
        if (jid.includes('@lid') && !lidsUnicos.has(jid)) {
          lidsUnicos.set(jid, {
            pushName: msg.pushName || 'Cliente',
            timestamp: msg.messageTimestamp
          });
        }
      }
    }

    console.log(`🔍 Total de @lid únicos para resolver: ${lidsUnicos.size}`);

    const resultados = [];
    let resolvidos = 0;
    let falhas = 0;
    let jaResolvidos = 0;

    for (const [lid, info] of lidsUnicos) {
      const lidNumerico = lid.replace(/@lid/g, '').replace(/\D/g, '');

      // Verificar se já temos no ContatoWhatsapp com número real
      const contatosExistentes = await base44.asServiceRole.entities.ContatoWhatsapp.filter({
        empresa_id: JD_ID, lid_jid: lidNumerico
      });

      if (contatosExistentes.length > 0 && contatosExistentes[0].telefone && !contatosExistentes[0].telefone.includes('@')) {
        const tel = contatosExistentes[0].telefone;
        jaResolvidos++;

        // Garantir que a conversa existe e está com telefone correto
        if (info.conversa_id) {
          const conv = info.conversa;
          if (!conv.cliente_telefone || conv.cliente_telefone.includes('@lid') || conv.cliente_telefone.length < 10) {
            await base44.asServiceRole.entities.ConversaWhatsapp.update(info.conversa_id, {
              cliente_telefone: tel
            });
            console.log(`🔄 Conversa atualizada com telefone: ${tel}`);
          }
        }

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
        }

        resultados.push({ lid, pushName: info.pushName, status: 'ja_resolvido', telefone: tel });
        continue;
      }

      // Tentar resolver via Evolution API
      const resultado = await tentarResolverLid(lid, evolutionUrl, evolutionKey, instanceName);

      if (resultado) {
        const { telefone, metodo } = resultado;
        resolvidos++;

        // Salvar/atualizar no ContatoWhatsapp
        if (contatosExistentes.length > 0) {
          await base44.asServiceRole.entities.ContatoWhatsapp.update(contatosExistentes[0].id, {
            telefone,
            ultima_atualizacao: new Date().toISOString()
          }).catch(() => {});
        } else {
          await base44.asServiceRole.entities.ContatoWhatsapp.create({
            empresa_id: JD_ID,
            telefone,
            nome: info.pushName || telefone,
            lid_jid: lidNumerico,
            ultima_atualizacao: new Date().toISOString()
          }).catch(() => {});
        }

        // Atualizar conversa existente com @lid para ter o telefone correto
        if (info.conversa_id) {
          await base44.asServiceRole.entities.ConversaWhatsapp.update(info.conversa_id, {
            cliente_telefone: telefone
          });
          console.log(`🔄 Conversa ${info.conversa_id} atualizada: @lid → ${telefone}`);
        }

        // Garantir que existe conversa com o telefone real
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

      await new Promise(r => setTimeout(r, 200));
    }

    return Response.json({
      total_lids: lidsUnicos.size,
      resolvidos,
      ja_resolvidos: jaResolvidos,
      falhas,
      resultados
    });

  } catch (e) {
    console.error('Erro geral:', e.message);
    return Response.json({ erro: e.message }, { status: 500 });
  }
});