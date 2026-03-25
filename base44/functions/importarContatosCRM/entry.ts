import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { contatos, empresa_id } = body;

    if (!contatos || !Array.isArray(contatos) || contatos.length === 0) {
      return Response.json({ error: 'contatos array required' }, { status: 400 });
    }

    if (!empresa_id) {
      return Response.json({ error: 'empresa_id required' }, { status: 400 });
    }

    let criados = 0;
    let erros = [];
    let rejeitados = 0;

    for (const item of contatos) {
      try {
        const telefone = typeof item === 'string' ? item.trim() : (item.telefone || item.numero || '').trim();
        
        if (!telefone) continue;

        // Rejeitar texto puro (não é número)
        if (!/^\d/.test(telefone)) {
          rejeitados++;
          console.log(`⏭️ Ignorado (texto): ${telefone}`);
          continue;
        }

        // Extrair apenas números
        const tel = telefone.replace(/\D/g, '');
        
        // Aceitar número BR válido: 55 + 10-11 dígitos = 12-13 dígitos total
        if (!tel.startsWith('55')) {
          rejeitados++;
          console.log(`⏭️ Rejeitado (sem 55): ${tel}`);
          continue;
        }

        if (tel.length < 12 || tel.length > 13) {
          rejeitados++;
          console.log(`⏭️ Rejeitado (comprimento ${tel.length}): ${tel}`);
          continue;
        }

        // Normalizar: 55 + DDD + número (sem 9 extra)
        let telNorm = tel;
        if (tel.length === 13) {
          // Verificar se tem 9 extra no meio (55 99 XXXXX)
          if (tel.charAt(2) === '9') {
            telNorm = tel.slice(0, 2) + tel.slice(3); // Remove o 9 extra
          }
        }

        // Verificar duplicata
        const existente = await base44.asServiceRole.entities.ContatoWhatsapp.filter({
          empresa_id,
          telefone: telNorm
        }).catch(() => []);

        if (existente.length > 0) {
          console.log(`⏭️ Já existe: ${telNorm}`);
          continue;
        }

        // Criar contato
        await base44.asServiceRole.entities.ContatoWhatsapp.create({
          empresa_id,
          telefone: telNorm,
          nome: `Cliente ${telNorm}`,
          ultima_atualizacao: new Date().toISOString()
        });

        criados++;
        console.log(`✅ Criado: ${telNorm}`);
      } catch (e) {
        erros.push(`Erro em ${item}: ${e.message}`);
        console.error(`❌ ${item}: ${e.message}`);
      }
    }

    return Response.json({
      ok: true,
      criados,
      rejeitados,
      erros: erros.length > 0 ? erros : null,
      total: contatos.length,
      mensagem: `✅ ${criados} salvos | ⏭️ ${rejeitados} ignorados`
    });
  } catch (error) {
    console.error('Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});