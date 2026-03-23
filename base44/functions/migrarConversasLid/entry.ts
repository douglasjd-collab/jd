// Migra conversas com cliente_telefone = lid_XXXX para o número real de WhatsApp
// Usa o mapeamento em ContatoWhatsapp.lid_jid e tenta resolver via Evolution API
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

async function resolverLidViaEvolution(lidNumerico, evolutionUrl, evolutionKey, instanceName) {
  // Estratégia 1: findChats
  try {
    const res = await fetch(`${evolutionUrl}/chat/findChats/${instanceName}`, {
      method: 'GET',
      headers: { 'apikey': evolutionKey }
    });
    if (res.ok) {
      const data = await res.json();
      const chats = Array.isArray(data) ? data : (data.chats || data.records || []);
      for (const c of chats) {
        const cId = (c.id || c.remoteJid || '').replace(/@lid/g, '').replace(/\D/g, '');
        if (cId === lidNumerico) {
          // Tentar achar o número real
          const jidAlt = c.remoteJidAlt || c.jidAlt || '';
          if (jidAlt.includes('@s.whatsapp.net')) {
            const tel = jidAlt.replace(/@s\.whatsapp\.net/g, '').replace(/\D/g, '');
            if (tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) return tel;
          }
          if (c.phone || c.phoneNumber || c.number) {
            const tel = String(c.phone || c.phoneNumber || c.number).replace(/\D/g, '');
            if (tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) return tel;
          }
        }
      }
    }
  } catch (_) {}

  // Estratégia 2: findContacts
  try {
    const res = await fetch(`${evolutionUrl}/chat/findContacts/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: {} })
    });
    if (res.ok) {
      const data = await res.json();
      const contatos = Array.isArray(data) ? data : (data.contacts || data.records || []);
      for (const c of contatos) {
        const cId = (c.id || c.remoteJid || '').replace(/@lid/g, '').replace(/\D/g, '');
        if (cId === lidNumerico) {
          const fontes = [c.phone, c.phoneNumber, c.number];
          for (const f of fontes) {
            if (!f) continue;
            const tel = String(f).replace(/\D/g, '');
            if (tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) return tel;
          }
          const jidAlt = c.remoteJidAlt || '';
          if (jidAlt.includes('@s.whatsapp.net')) {
            const tel = jidAlt.replace(/@s\.whatsapp\.net/g, '').replace(/\D/g, '');
            if (tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) return tel;
          }
        }
      }
    }
  } catch (_) {}

  // Estratégia 3: fetchProfile
  try {
    const res = await fetch(`${evolutionUrl}/contact/fetchProfile/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: lidNumerico })
    });
    if (res.ok) {
      const data = await res.json();
      const jid = data?.jid || data?.wuid || data?.id || '';
      if (jid.includes('@s.whatsapp.net')) {
        const tel = jid.replace(/@s\.whatsapp\.net/g, '').replace(/\D/g, '');
        if (tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) return tel;
      }
    }
  } catch (_) {}

  return null;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const JD_ID = '699696c2c9f5bffc2e67402b';

    // Buscar configuração da empresa para Evolution API
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: JD_ID });
    const empresa = empresas?.[0];
    const evolutionUrl = empresa?.evolution_url?.replace(/\/$/, '');
    const evolutionKey = empresa?.evolution_api_key;
    const instanceName = empresa?.evolution_instance_name;

    // Buscar todas as conversas com telefone lid_
    const todasConversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: JD_ID }, '-created_date', 300
    );
    const conversasLid = todasConversas.filter(c => (c.cliente_telefone || '').startsWith('lid_'));

    console.log(`🔍 Encontradas ${conversasLid.length} conversas com lid_`);

    if (conversasLid.length === 0) {
      return Response.json({ ok: true, migradas: 0, message: 'Nenhuma conversa lid_ encontrada' });
    }

    // Buscar mapeamentos já salvos em ContatoWhatsapp
    const contatosComLid = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
      { empresa_id: JD_ID }, '-created_date', 300
    );
    const lidMap = {};
    for (const c of contatosComLid) {
      if (c.lid_jid && c.telefone) {
        lidMap[c.lid_jid] = c.telefone;
      }
    }
    console.log(`📒 Mapeamentos no banco: ${JSON.stringify(lidMap)}`);

    let migradas = 0;
    let semMapeamento = 0;
    const resultados = [];

    for (const conv of conversasLid) {
      const lidNumerico = (conv.cliente_telefone || '').replace('lid_', '');
      let telefoneReal = lidMap[lidNumerico];

      // Se não tem no banco, tentar via Evolution API
      if (!telefoneReal && evolutionUrl && evolutionKey) {
        console.log(`🔎 Tentando resolver ${lidNumerico} via Evolution API...`);
        telefoneReal = await resolverLidViaEvolution(lidNumerico, evolutionUrl, evolutionKey, instanceName);
        if (telefoneReal) {
          console.log(`✅ Evolution resolveu: ${lidNumerico} → ${telefoneReal}`);
          // Salvar o mapeamento para uso futuro
          try {
            await base44.asServiceRole.entities.ContatoWhatsapp.create({
              empresa_id: JD_ID,
              telefone: telefoneReal,
              nome: conv.cliente_nome || telefoneReal,
              lid_jid: lidNumerico,
              ultima_atualizacao: new Date().toISOString()
            });
          } catch (_) {}
        }
      }

      if (!telefoneReal) {
        semMapeamento++;
        resultados.push({ id: conv.id, lid: conv.cliente_telefone, status: 'sem_mapeamento' });
        console.warn(`⚠️ Sem mapeamento para ${conv.cliente_telefone}`);
        continue;
      }

      // Verificar se já existe conversa com o número real
      const conversaExistente = todasConversas.find(c =>
        c.id !== conv.id && (
          c.cliente_telefone === telefoneReal ||
          c.cliente_telefone === telefoneReal.slice(0, 4) + telefoneReal.slice(5) ||
          c.cliente_telefone === telefoneReal.slice(0, 4) + '9' + telefoneReal.slice(4)
        )
      );

      if (conversaExistente) {
        // Migrar mensagens para a conversa existente e deletar a lid_
        const mensagensLid = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
          { conversa_id: conv.id }, 'data_envio', 500
        );
        for (const msg of mensagensLid) {
          await base44.asServiceRole.entities.MensagemWhatsapp.update(msg.id, {
            conversa_id: conversaExistente.id
          });
        }
        await base44.asServiceRole.entities.ConversaWhatsapp.delete(conv.id);
        console.log(`✅ ${mensagensLid.length} msgs migradas de ${conv.id} → ${conversaExistente.id}`);
        resultados.push({ id: conv.id, lid: conv.cliente_telefone, telefone: telefoneReal, status: 'mesclado', msgs: mensagensLid.length });
      } else {
        // Atualizar a conversa com o número real
        await base44.asServiceRole.entities.ConversaWhatsapp.update(conv.id, {
          cliente_telefone: telefoneReal,
          cliente_nome: (conv.cliente_nome || '').startsWith('lid_') ? telefoneReal : conv.cliente_nome,
        });
        console.log(`✅ ${conv.id}: ${conv.cliente_telefone} → ${telefoneReal}`);
        resultados.push({ id: conv.id, lid: conv.cliente_telefone, telefone: telefoneReal, status: 'atualizado' });
      }

      migradas++;
    }

    return Response.json({ ok: true, migradas, sem_mapeamento: semMapeamento, resultados });

  } catch (e) {
    console.error('❌ Erro:', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
});