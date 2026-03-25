import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Função auxiliar que converte conversas com @lid em número correto
 * Chamada automaticamente quando uma conversa @lid recebe nova mensagem
 */

async function resolverLidParaTelefone(lid, evolutionUrl, evolutionKey, instanceName) {
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
      const jid = data?.jid || data?.wuid || data?.id || '';
      if (jid.includes('@s.whatsapp.net') || jid.includes('@c.us')) {
        const tel = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
        if (tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) return tel;
      }
    }
  } catch (e) { console.warn('⚠️ fetchProfile falhou:', e.message); }

  // Método 2: buscar nas mensagens por remoteJidAlt
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
          console.log(`✅ @lid resolvido via mensagem: ${lid} → ${tel}`);
          return tel;
        }
      }
    }
  } catch (e) { console.warn('⚠️ findMessages falhou:', e.message); }

  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id;
    if (!empresaId) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    // Buscar TODAS as conversas com @lid no telefone ou whatsapp_id
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId }, '-created_date', 2000
    );

    const conversasLid = conversas.filter(c =>
      (c.cliente_telefone || '').includes('@lid') ||
      (c.cliente_telefone || '').includes('lid_') ||
      (c.whatsapp_id || '').includes('@lid')
    );

    let convertidas = 0;
    let falhas = 0;

    console.log(`🔍 Encontradas ${conversasLid.length} conversas com @lid`);

    for (const conv of conversasLid) {
      const lidOriginal = conv.cliente_telefone || conv.whatsapp_id;
      const empresaData = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId });
      
      if (!empresaData?.[0]?.evolution_url) {
        console.warn(`⚠️ Empresa sem Evolution configurada: ${empresaId}`);
        falhas++;
        continue;
      }

      const emp = empresaData[0];
      const telefoneCorreto = await resolverLidParaTelefone(
        lidOriginal,
        emp.evolution_url.replace(/\/$/, ''),
        emp.evolution_api_key,
        emp.evolution_instance_name
      );

      if (telefoneCorreto) {
        // Atualizar conversa com número correto
        await base44.asServiceRole.entities.ConversaWhatsapp.update(conv.id, {
          cliente_telefone: telefoneCorreto,
          whatsapp_id: `${telefoneCorreto}@s.whatsapp.net`,
          cliente_nome: conv.cliente_nome || `Cliente ${telefoneCorreto}`
        });
        console.log(`✅ Convertida: ${lidOriginal} → ${telefoneCorreto}`);
        convertidas++;

        // Salvar no cache ContatoWhatsapp para proximas mensagens
        const lidNumerico = lidOriginal.replace(/\D/g, '');
        await base44.asServiceRole.entities.ContatoWhatsapp.create({
          empresa_id: empresaId,
          telefone: telefoneCorreto,
          nome: conv.cliente_nome || `Cliente ${telefoneCorreto}`,
          lid_jid: lidNumerico,
          ultima_atualizacao: new Date().toISOString()
        }).catch(() => {});
      } else {
        console.warn(`⚠️ Não foi possível resolver: ${lidOriginal}`);
        falhas++;
      }
    }

    return Response.json({
      ok: true,
      convertidas,
      falhas,
      totalLid: conversasLid.length
    });
  } catch (error) {
    console.error('❌ Erro em converterLidEmNumero:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});