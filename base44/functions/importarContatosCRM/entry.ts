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

    for (const item of contatos) {
      try {
        const telefone = typeof item === 'string' ? item.trim() : (item.telefone || item.numero || '').trim();
        const nome = item.nome || item.name || telefone;

        if (!telefone) continue;

        // Validar número BR
        const tel = telefone.replace(/\D/g, '');
        if (!tel.startsWith('55') || (tel.length !== 12 && tel.length !== 13)) {
          erros.push(`${telefone}: formato inválido`);
          continue;
        }

        // Normalizar (se 13 dígitos, remover 9 extra)
        const telNorm = tel.length === 13 ? tel.slice(0, 4) + tel.slice(5) : tel;

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
          nome: nome || `Cliente ${telNorm}`,
          ultima_atualizacao: new Date().toISOString()
        });

        criados++;
        console.log(`✅ ${telNorm} | ${nome}`);
      } catch (e) {
        erros.push(`Erro: ${e.message}`);
      }
    }

    return Response.json({
      ok: true,
      criados,
      erros,
      total: contatos.length
    });
  } catch (error) {
    console.error('Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});