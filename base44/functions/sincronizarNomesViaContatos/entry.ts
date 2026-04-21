import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    let empresaId = body.empresa_id || user.empresa_id;

    if (!empresaId && user.perfil === 'super_admin') {
      const todasEmps = await base44.asServiceRole.entities.Empresa.filter({}, '-created_date', 50).catch(() => []);
      const empComEvo = todasEmps.find(e => e.evolution_url && e.evolution_api_key && e.evolution_instance_name);
      if (empComEvo) empresaId = empComEvo.id;
    }

    if (!empresaId) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId }).catch(() => []);
    const emp = empresas?.[0];
    if (!emp?.evolution_url || !emp?.evolution_api_key || !emp?.evolution_instance_name) {
      return Response.json({ error: 'Evolution não configurada' }, { status: 400 });
    }

    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    // Buscar TODOS os contatos da instância (não filtrados por empresa)
    console.log(`🔍 Buscando contatos da Evolution...`);
    const contatosRes = await fetch(`${evolutionUrl}/contact/contacts/${instanceName}`, {
      headers: { 'apikey': evolutionKey }
    });

    if (!contatosRes.ok) {
      return Response.json({ error: `Erro ao buscar contatos: HTTP ${contatosRes.status}` }, { status: 400 });
    }

    const contatosData = await contatosRes.json();
    const contatos = contatosData.contacts || [];

    console.log(`✅ ${contatos.length} contatos encontrados`);

    // Mapear JID -> { name, pushName }
    const contatosMap = {};
    for (const c of contatos) {
      if (c.id && c.name) {
        // Extrair número do JID
        const match = c.id.match(/^(\d+)@/);
        const numero = match ? match[1] : null;
        if (numero) {
          contatosMap[numero] = {
            name: c.name,
            pushName: c.pushName || c.name,
            id: c.id
          };
        }
      }
    }

    console.log(`📊 Mapa de contatos: ${Object.keys(contatosMap).length} números`);

    // Buscar conversas da empresa
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-updated_date',
      5000
    ).catch(() => []);

    // Atualizar conversas com nomes dos contatos
    let atualizadas = 0;
    let erros = 0;
    const BATCH_SIZE = 20;

    for (let i = 0; i < conversas.length; i += BATCH_SIZE) {
      const batch = conversas.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (conv) => {
        try {
          const numero = conv.cliente_telefone.replace(/\D/g, '');
          const contatoEvo = contatosMap[numero];

          if (!contatoEvo) {
            return { conversa: conv.id, sucesso: false, motivo: 'Contato não encontrado' };
          }

          const novoNome = (contatoEvo.name || contatoEvo.pushName || '').trim();

          // Validações
          if (!novoNome || novoNome.match(/^\d+$/) || novoNome === numero) {
            return { conversa: conv.id, sucesso: false, motivo: `Nome inválido: "${novoNome}"` };
          }

          // Só atualizar se for diferente
          if (conv.cliente_nome !== novoNome) {
            await base44.asServiceRole.entities.ConversaWhatsapp.update(conv.id, {
              cliente_nome: novoNome
            });
            atualizadas++;
            return { conversa: conv.id, sucesso: true, nome: novoNome };
          }

          return { conversa: conv.id, sucesso: false, motivo: 'Nome já correto' };
        } catch (e) {
          erros++;
          return { conversa: conv.id, sucesso: false, motivo: e.message };
        }
      });

      const resultados = await Promise.all(promises);
      console.log(`✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${resultados.filter(r => r.sucesso).length} atualizadas`);

      if (i + BATCH_SIZE < conversas.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    return Response.json({
      ok: true,
      mensagem: `✅ ${atualizadas} conversas atualizadas com nomes corretos da Evolution`,
      atualizadas,
      erros,
      contatosEvolution: Object.keys(contatosMap).length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});