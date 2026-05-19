import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { contato_id, empresa_id } = await req.json();

    if (!empresa_id || !contato_id) {
      return Response.json({ error: 'empresa_id e contato_id obrigatórios' }, { status: 400 });
    }

    const telLimpo = contato_id.replace(/\D/g, '');
    if (!telLimpo || telLimpo.length < 8) {
      return Response.json({ foto_url: null });
    }

    console.log(`🔍 Buscando foto para: ${telLimpo} | empresa: ${empresa_id}`);

    // Buscar configurações da empresa via service role
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id }, null, 1);
    const empresa = empresas[0];
    const evolutionUrl = (empresa?.evolution_url || Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
    const evolutionKey = empresa?.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY') || '';
    const evolutionInstance = empresa?.evolution_instance_name || Deno.env.get('EVOLUTION_INSTANCE_NAME') || '';

    console.log(`📡 Evolution: ${evolutionUrl} | Instance: ${evolutionInstance}`);

    if (!evolutionUrl || !evolutionKey || !evolutionInstance) {
      console.warn('⚠️ Evolution não configurada');
      return Response.json({ foto_url: null });
    }

    // Buscar foto via Evolution API
    let fotoUrl = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${evolutionUrl}/chat/fetchProfile/${evolutionInstance}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: telLimpo }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      console.log(`📡 fetchProfile status: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        fotoUrl = data?.picture || data?.profilePictureUrl || data?.pictureUrl || null;
        console.log(`📸 Foto encontrada: ${fotoUrl ? 'SIM' : 'NÃO'} | ${fotoUrl}`);
      }
    } catch (e) {
      console.warn('⚠️ Erro ao buscar foto via Evolution:', e.message);
    }

    // Salvar no banco se encontrou foto
    if (fotoUrl) {
      const variacoes = [telLimpo];
      if (telLimpo.startsWith('55') && telLimpo.length === 13) {
        variacoes.push(telLimpo.slice(0, 4) + telLimpo.slice(5));
      }
      if (telLimpo.startsWith('55') && telLimpo.length === 12) {
        variacoes.push(telLimpo.slice(0, 4) + '9' + telLimpo.slice(4));
      }

      for (const tel of variacoes) {
        const found = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
          { empresa_id, telefone: tel }, '-created_date', 1
        );
        if (found?.length > 0) {
          await base44.asServiceRole.entities.ContatoWhatsapp.update(found[0].id, {
            foto_url: fotoUrl,
            ultima_atualizacao: new Date().toISOString()
          });
          console.log(`✅ Foto salva no contato ${found[0].id}`);
          break;
        }
      }
    }

    return Response.json({ foto_url: fotoUrl });
  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});