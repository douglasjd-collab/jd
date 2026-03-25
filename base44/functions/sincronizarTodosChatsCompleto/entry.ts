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

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId });
    if (!empresas?.[0]?.evolution_url || !empresas?.[0]?.evolution_api_key) {
      return Response.json({ erro: 'Evolution não configurada' }, { status: 400 });
    }

    const emp = empresas[0];
    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    console.log(`🔄 Iniciando sincronização COMPLETA...`);

    // ═══════════════════════════════════════════════════════════
    // PASSO 1: Buscar TODAS as mensagens dos últimos 90 dias
    // ═══════════════════════════════════════════════════════════
    const agoSeconds = Math.floor((Date.now() - (90 * 24 * 60 * 60 * 1000)) / 1000);
    let todasMensagens = [];
    try {
      const resMsgs = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          where: { messageTimestamp: { $gte: agoSeconds } },
          limit: 10000
        })
      });
      if (resMsgs.ok) {
        const dataMsgs = await resMsgs.json();
        todasMensagens = Array.isArray(dataMsgs) ? dataMsgs : (dataMsgs.messages?.records || dataMsgs.messages || []);
        console.log(`📨 ${todasMensagens.length} mensagens encontradas (últimos 90 dias)`);
      }
    } catch (e) {
      console.warn(`⚠️ Erro ao buscar mensagens: ${e.message}`);
    }

    // ═══════════════════════════════════════════════════════════
    // PASSO 2: Extrair JIDs únicos de todas as mensagens
    // ═══════════════════════════════════════════════════════════
    const jidsUnicos = new Set();
    const jidsMap = {};

    for (const msg of todasMensagens) {
      const jid = msg.key?.remoteJid || '';
      
      // Rejeitar grupos e broadcasts
      if (jid.includes('@g.us') || jid.includes('@broadcast') || !jid) continue;
      
      jidsUnicos.add(jid);
      if (!jidsMap[jid]) {
        jidsMap[jid] = {
          jid,
          pushName: msg.pushName || msg.senderName || '',
          lastMessageTime: msg.messageTimestamp || 0
        };
      } else if ((msg.messageTimestamp || 0) > jidsMap[jid].lastMessageTime) {
        jidsMap[jid].lastMessageTime = msg.messageTimestamp || 0;
        jidsMap[jid].pushName = msg.pushName || jidsMap[jid].pushName;
      }
    }

    console.log(`🔗 ${jidsUnicos.size} contatos únicos extraídos das mensagens`);

    // ═══════════════════════════════════════════════════════════
    // PASSO 3: Normalizar números e filtrar válidos
    // ═══════════════════════════════════════════════════════════
    const contatosValidos = [];
    
    for (const jid of jidsUnicos) {
      const tel = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
      
      // Validar: 55 + 2 dígitos (DDD) + 8-9 dígitos (número)
      if (!tel.startsWith('55') || (tel.length !== 12 && tel.length !== 13)) {
        continue;
      }
      
      // Normalizar BR (se 13 dígitos, remover 9 extra)
      const telNorm = tel.length === 13 ? tel.slice(0, 4) + tel.slice(5) : tel;
      
      contatosValidos.push({
        jid,
        tel: telNorm,
        pushName: jidsMap[jid]?.pushName || `Cliente ${telNorm}`
      });
    }

    console.log(`✅ ${contatosValidos.length} contatos válidos filtrados`);

    // ═══════════════════════════════════════════════════════════
    // PASSO 4: Buscar conversas e contatos existentes
    // ═══════════════════════════════════════════════════════════
    const [conversasExistentes, contatosExistentes] = await Promise.all([
      base44.asServiceRole.entities.ConversaWhatsapp.filter(
        { empresa_id: empresaId },
        '-created_date',
        10000
      ),
      base44.asServiceRole.entities.ContatoWhatsapp.filter(
        { empresa_id: empresaId },
        '-created_date',
        10000
      )
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
    // PASSO 5: Criar conversas e contatos faltantes
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
          });
          criadasNovasConversas++;
          console.log(`✅ Conversa criada: ${telNorm}`);
        } catch (e) {
          console.error(`❌ Erro ao criar conversa ${telNorm}: ${e.message}`);
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
          });
          criadosNovosContatos++;
          console.log(`✅ Contato CRM criado: ${telNorm}`);
        } catch (e) {
          console.error(`❌ Erro ao criar contato ${telNorm}: ${e.message}`);
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