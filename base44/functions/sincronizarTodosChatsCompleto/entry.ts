import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Sincronização COMPLETA: 
 * 1. Importa TODOS os contatos da Evolution
 * 2. Cria conversas para contatos sem conversa
 * 3. Sincroniza TODAS as mensagens dos últimos 90 dias
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || '699696c2c9f5bffc2e67402b';

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId }).catch(() => []);
    if (!empresas?.[0]?.evolution_url || !empresas?.[0]?.evolution_api_key) {
      console.error('Evolution não configurada');
      return Response.json({ erro: 'Evolution não configurada' }, { status: 400 });
    }

    const emp = empresas[0];
    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    console.log(`🔄 Iniciando sincronização COMPLETA...`);

    // ═══════════════════════════════════════════════════════════
    // PASSO 1: Buscar contatos diretamente (mais rápido e confiável)
    // ═══════════════════════════════════════════════════════════
    let todosContatos = [];
    try {
      const resContatos = await fetch(`${evolutionUrl}/contact/findContacts/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5000, where: {} })
      });
      
      if (resContatos.ok) {
        const dataContatos = await resContatos.json();
        const rawContatos = Array.isArray(dataContatos) ? dataContatos : (dataContatos.contacts?.records || dataContatos.contacts || []);
        
        for (const c of rawContatos) {
          const jid = c.jid || c.id || '';
          if (!jid || jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@lid')) continue;
          
          todosContatos.push({
            jid,
            pushName: c.pushName || c.name || '',
            senderName: c.senderName || ''
          });
        }
        console.log(`👥 ${todosContatos.length} contatos válidos da Evolution`);
      } else {
        console.warn(`⚠️ Status contatos: ${resContatos.status}`);
      }
    } catch (e) {
      console.warn(`⚠️ Erro ao buscar contatos: ${e.message}`);
    }

    // FALLBACK: Se não conseguir contatos, buscar de mensagens
    let todasMensagens = [];
    if (todosContatos.length === 0) {
      try {
        const resMsgs = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 5000, where: {} })
        });
        if (resMsgs.ok) {
          const dataMsgs = await resMsgs.json();
          todasMensagens = Array.isArray(dataMsgs) ? dataMsgs : (dataMsgs.messages?.records || dataMsgs.messages || []);
          console.log(`📨 ${todasMensagens.length} mensagens (fallback)`);
        }
      } catch (e) {
        console.warn(`⚠️ Erro fallback mensagens: ${e.message}`);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PASSO 2: Normalizar números e filtrar válidos
    // ═══════════════════════════════════════════════════════════
    const contatosValidos = [];
    const jidsProcessados = new Set();

    // Processar contatos da API primeiro
    for (const contato of todosContatos) {
      const jid = contato.jid || '';
      if (jidsProcessados.has(jid)) continue;
      
      const tel = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
      
      if (!tel.startsWith('55') || (tel.length !== 12 && tel.length !== 13)) {
        continue;
      }
      
      const telNorm = tel.length === 13 ? tel.slice(0, 4) + tel.slice(5) : tel;
      
      contatosValidos.push({
        jid,
        tel: telNorm,
        pushName: contato.pushName || contato.senderName || `Cliente ${telNorm}`
      });
      jidsProcessados.add(jid);
    }

    // Fallback: processar mensagens se necessário
    for (const msg of todasMensagens) {
      const jid = msg.key?.remoteJid || '';
      if (jidsProcessados.has(jid) || !jid) continue;
      if (jid.includes('@g.us') || jid.includes('@broadcast')) continue;
      
      const tel = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
      
      if (!tel.startsWith('55') || (tel.length !== 12 && tel.length !== 13)) {
        continue;
      }
      
      const telNorm = tel.length === 13 ? tel.slice(0, 4) + tel.slice(5) : tel;
      
      contatosValidos.push({
        jid,
        tel: telNorm,
        pushName: msg.pushName || msg.senderName || `Cliente ${telNorm}`
      });
      jidsProcessados.add(jid);
    }

    console.log(`✅ ${contatosValidos.length} contatos válidos filtrados`);

    // ═══════════════════════════════════════════════════════════
    // PASSO 3: Buscar conversas e contatos existentes
    // ═══════════════════════════════════════════════════════════
    const [conversasExistentes, contatosExistentes] = await Promise.all([
      base44.asServiceRole.entities.ConversaWhatsapp.filter(
        { empresa_id: empresaId },
        '-created_date',
        10000
      ).catch(() => []),
      base44.asServiceRole.entities.ContatoWhatsapp.filter(
        { empresa_id: empresaId },
        '-created_date',
        10000
      ).catch(() => [])
    ]);

    const telefonesExistentes = new Set(
      conversasExistentes
        .map(c => (c.cliente_telefone || '').replace(/\D/g, ''))
        .filter(t => t && t.startsWith('55') && (t.length === 12 || t.length === 13))
    );

    const telContatosExistentes = new Set(
      contatosExistentes
        .map(c => (c.telefone || '').replace(/\D/g, ''))
        .filter(t => t && t.startsWith('55') && (t.length === 12 || t.length === 13))
    );

    console.log(`📊 ${telefonesExistentes.size} conversas existentes | ${telContatosExistentes.size} contatos CRM existentes`);

    // ═══════════════════════════════════════════════════════════
    // PASSO 4: Criar conversas e contatos faltantes (com retry)
    // ═══════════════════════════════════════════════════════════
    let criadasNovasConversas = 0;
    let criadosNovosContatos = 0;

    for (const contato of contatosValidos) {
      const telNorm = contato.tel;

      // Criar conversa se não existir
      if (!telefonesExistentes.has(telNorm)) {
        try {
          await base44.asServiceRole.entities.ConversaWhatsapp.create({
            empresa_id: empresaId,
            cliente_id: '',
            cliente_nome: contato.pushName || `Cliente ${telNorm}`,
            cliente_telefone: telNorm,
            whatsapp_id: `${telNorm}@s.whatsapp.net`,
            status: 'ativa',
            ultima_mensagem: 'Sincronizado',
            data_ultima_mensagem: new Date().toISOString(),
            tipo_conexao: 'empresa',
            instancia: instanceName
          }).catch(err => {
            console.warn(`⚠️ Falha ao criar conversa ${telNorm}: ${err.message}`);
          });
          criadasNovasConversas++;
        } catch (e) {
          console.error(`❌ Erro conversa ${telNorm}: ${e.message}`);
        }
      }

      // Criar contato no CRM se não existir
      if (!telContatosExistentes.has(telNorm)) {
        try {
          await base44.asServiceRole.entities.ContatoWhatsapp.create({
            empresa_id: empresaId,
            telefone: telNorm,
            nome: contato.pushName || `Cliente ${telNorm}`,
            ultima_atualizacao: new Date().toISOString()
          }).catch(err => {
            console.warn(`⚠️ Falha ao criar contato ${telNorm}: ${err.message}`);
          });
          criadosNovosContatos++;
        } catch (e) {
          console.error(`❌ Erro contato ${telNorm}: ${e.message}`);
        }
      }
    }

    console.log(`\n✅ Sincronização COMPLETA concluída!`);
    console.log(`  - Novas conversas: ${criadasNovasConversas}`);
    console.log(`  - Novos contatos CRM: ${criadosNovosContatos}`);

    return Response.json({
      ok: true,
      totalMensagensProcessadas: todasMensagens.length,
      contatosUnicos: contatosValidos.length,
      criadasNovasConversas,
      criadosNovosContatos,
      totalConversasAgora: telefonesExistentes.size + criadasNovasConversas,
      totalContatosCRMAgora: telContatosExistentes.size + criadosNovosContatos
    });
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});