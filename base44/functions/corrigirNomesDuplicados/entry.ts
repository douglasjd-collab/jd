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

    // Buscar todas as conversas com "Douglas" - provavelmente estão erradas
    const todasConversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-updated_date',
      5000
    ).catch(() => []);

    // Contar quantas têm "Douglas"
    const comDouglas = todasConversas.filter(c => c.cliente_nome === 'Douglas');
    
    console.log(`📊 Total: ${todasConversas.length}, Com Douglas: ${comDouglas.length}`);
    console.log(`Números com Douglas:`, comDouglas.slice(0, 10).map(c => c.cliente_telefone));

    // Verificar se há duplicatas (múltiplas conversas com mesmo telefone)
    const porTelefone = {};
    for (const conv of todasConversas) {
      const tel = conv.cliente_telefone;
      if (!porTelefone[tel]) porTelefone[tel] = [];
      porTelefone[tel].push(conv);
    }

    const comDuplicatas = Object.entries(porTelefone).filter(([_, convs]) => convs.length > 1);
    console.log(`🔍 Telefones com múltiplas conversas: ${comDuplicatas.length}`);

    // Limpar nomes de "Douglas" para deixar vazio e sincronizar de novo
    // Estratégia: manter apenas a conversa mais recente para cada telefone
    const paraLimpar = [];
    for (const [tel, convs] of comDuplicatas) {
      if (convs.some(c => c.cliente_nome === 'Douglas')) {
        // Manter apenas a mais recente
        const mais_recente = convs.sort((a, b) => 
          new Date(b.updated_date) - new Date(a.updated_date)
        )[0];
        
        // As outras deletar ou limpar
        for (const conv of convs) {
          if (conv.id !== mais_recente.id) {
            paraLimpar.push(conv.id);
          }
        }
      }
    }

    console.log(`🗑️  Conversas duplicadas para deletar: ${paraLimpar.length}`);

    // Deletar duplicatas
    let deletadas = 0;
    const BATCH_SIZE = 10;
    for (let i = 0; i < paraLimpar.length; i += BATCH_SIZE) {
      const batch = paraLimpar.slice(i, i + BATCH_SIZE);
      const promises = batch.map(id =>
        base44.asServiceRole.entities.ConversaWhatsapp.delete(id)
          .then(() => deletadas++)
          .catch(() => {})
      );
      await Promise.all(promises);
      if (i + BATCH_SIZE < paraLimpar.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return Response.json({
      ok: true,
      totalConversas: todasConversas.length,
      comDouglas: comDouglas.length,
      duplicatas: comDuplicatas.length,
      deletadas,
      mensagem: `✅ ${deletadas} conversas duplicadas deletadas`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});