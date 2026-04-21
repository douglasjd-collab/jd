import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || user.empresa_id;

    if (!empresaId) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    // Buscar configuração da empresa
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId }).catch(() => []);
    const emp = empresas?.[0];
    if (!emp?.evolution_url || !emp?.evolution_api_key || !emp?.evolution_instance_name) {
      return Response.json({ error: 'Evolution não configurada' }, { status: 400 });
    }

    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    // Buscar conversas sem nome ou com nome genérico
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      5000
    ).catch(() => []);

    const semNome = conversas.filter(c => {
      const nome = (c.cliente_nome || '').trim();
      const tel = (c.cliente_telefone || '').replace(/\D/g, '');
      return !nome || nome === tel || nome.toLowerCase() === 'cliente' || nome.startsWith('Cliente ');
    });

    console.log(`📋 ${conversas.length} conversas totais, ${semNome.length} sem nome`);

    const atualizadas = [];
    const erros = [];

    // Helper: buscar com retry
    const buscarMensagensComRetry = async (jid, tentativa = 0) => {
      try {
        const msgRes = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ remoteJid: jid, limit: 100 })
        });
        
        if (msgRes.status === 429) {
          if (tentativa < 2) {
            const delay = 1000 * (tentativa + 1);
            await new Promise(r => setTimeout(r, delay));
            return buscarMensagensComRetry(jid, tentativa + 1);
          }
          throw new Error('Rate limit exceeded após retries');
        }

        return await msgRes.json();
      } catch (e) {
        throw e;
      }
    };

    // Processar sequencialmente com delay entre batches (para evitar rate limit)
    const BATCH_SIZE = 5;
    for (let i = 0; i < semNome.length; i += BATCH_SIZE) {
      const batch = semNome.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (conversa) => {
        try {
          const jid = `${conversa.cliente_telefone}@s.whatsapp.net`;

          // Buscar mensagens na Evolution com retry
          const msgData = await buscarMensagensComRetry(jid);
          const msgs = msgData?.messages?.records || [];

          // Extrair pushName da primeira mensagem recebida (fromMe: false)
          const msgRecebida = msgs.find(m => !m.key?.fromMe && m.pushName);
          if (!msgRecebida) {
            return { conversa: conversa.id, sucesso: false, motivo: 'Sem pushName nas mensagens' };
          }

          const novoNome = msgRecebida.pushName.trim();
          if (!novoNome || novoNome === '0' || novoNome.match(/^\d+$/)) {
            return { conversa: conversa.id, sucesso: false, motivo: `pushName inválido: "${novoNome}"` };
          }

          // Atualizar conversa
          await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa.id, {
            cliente_nome: novoNome
          });

          return { conversa: conversa.id, sucesso: true, nome: novoNome };
        } catch (e) {
          return { conversa: conversa.id, sucesso: false, motivo: e.message };
        }
      });

      const resultados = await Promise.all(promises);
      resultados.forEach(r => {
        if (r.sucesso) atualizadas.push(r);
        else erros.push(r);
      });

      console.log(`✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${resultados.filter(r => r.sucesso).length} atualizadas`);

      // Delay entre batches para evitar rate limit
      if (i + BATCH_SIZE < semNome.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    return Response.json({
      ok: true,
      mensagem: `✅ ${atualizadas.length} conversas atualizadas com nome`,
      atualizadas: atualizadas.length,
      erros: erros.length,
      exemplosAtualizadas: atualizadas.slice(0, 5),
      exemplosErros: erros.slice(0, 5)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});