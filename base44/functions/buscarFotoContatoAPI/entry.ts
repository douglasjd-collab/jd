import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Busca foto do contato via Evolution API e salva no banco
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { contato_id, empresa_id } = await req.json();

    if (!empresa_id || !contato_id) {
      return Response.json({ error: 'empresa_id e contato_id obrigatórios' }, { status: 400 });
    }

    // Buscar configurações da empresa
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id }, null, 1);
    const empresa = empresas[0];
    const evolutionUrl = empresa?.evolution_url || Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = empresa?.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY');
    const evolutionInstance = empresa?.evolution_instance_name || Deno.env.get('EVOLUTION_INSTANCE_NAME');

    if (!evolutionUrl || !evolutionKey || !evolutionInstance) {
      return Response.json({ foto_url: null, erro: 'Evolution não configurada' });
    }

    // Normalizar o número de telefone
    const telLimpo = contato_id.replace(/\D/g, '');
    if (!telLimpo || telLimpo.length < 8) {
      return Response.json({ foto_url: null });
    }

    // Buscar foto via Evolution API
    let fotoUrl = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${evolutionUrl.replace(/\/$/, '')}/contact/fetchProfile/${evolutionInstance}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: telLimpo }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        fotoUrl = data?.profilePictureUrl || data?.picture || data?.pictureUrl || null;
      }
    } catch (e) {
      console.warn('Erro ao buscar foto via Evolution:', e.message);
    }

    // Buscar contato no banco e atualizar foto se encontrou
    if (fotoUrl) {
      const variacoes = [telLimpo];
      if (telLimpo.startsWith('55') && telLimpo.length === 13) {
        variacoes.push(telLimpo.slice(0, 4) + telLimpo.slice(5)); // sem 9
      }
      if (telLimpo.startsWith('55') && telLimpo.length === 12) {
        variacoes.push(telLimpo.slice(0, 4) + '9' + telLimpo.slice(4)); // com 9
      }

      for (const tel of variacoes) {
        const contatosEncontrados = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
          { empresa_id, telefone: tel }, '-created_date', 1
        );
        if (contatosEncontrados?.length > 0) {
          const c = contatosEncontrados[0];
          if (c.foto_url !== fotoUrl) {
            await base44.asServiceRole.entities.ContatoWhatsapp.update(c.id, {
              foto_url: fotoUrl,
              ultima_atualizacao: new Date().toISOString()
            });
          }
          return Response.json({ foto_url: fotoUrl });
        }
      }
    }

    return Response.json({ foto_url: fotoUrl });
  } catch (error) {
    console.error('Erro ao buscar foto:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});