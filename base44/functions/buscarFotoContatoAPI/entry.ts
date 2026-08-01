import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// A D-API não documenta o schema do corpo do avatar. Localizar a primeira URL
// HTTP em qualquer envelope evita depender de nomes como avatarUrl/pictureUrl.
function encontrarUrlHttp(valor: unknown, profundidade = 0): string | null {
  if (profundidade > 6 || valor == null) return null;
  if (typeof valor === 'string') {
    const texto = valor.trim();
    if (/^https?:\/\//i.test(texto)) return texto;
    return null;
  }
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const encontrada = encontrarUrlHttp(item, profundidade + 1);
      if (encontrada) return encontrada;
    }
    return null;
  }
  if (typeof valor === 'object') {
    for (const item of Object.values(valor as Record<string, unknown>)) {
      const encontrada = encontrarUrlHttp(item, profundidade + 1);
      if (encontrada) return encontrada;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { contato_id, empresa_id, force, connection_id, session_id } = await req.json();

    if (!empresa_id || !contato_id) {
      return Response.json({ error: 'empresa_id e contato_id obrigatórios' }, { status: 400 });
    }

    const telLimpo = contato_id.replace(/\D/g, '');
    if (!telLimpo || telLimpo.length < 8) {
      return Response.json({ foto_url: null });
    }

    console.log(`🔍 Buscando foto para: ${telLimpo} | empresa: ${empresa_id}`);

    let fotoUrl = null;

    // ── Tentar via D-API primeiro (se houver conexão D-API ativa) ──────────
    try {
      const conexoesDapi = await base44.asServiceRole.entities.WhatsappConnection.filter({
        empresa_id,
        provider_type: 'dapi',
        is_active: true
      }, '-created_date', 50);
      // A API Oficial Cloud também usa provider_type='dapi', mas o endpoint
      // de avatar abaixo pertence à sessão comum da JD Promotora. Priorizar a
      // conexão da conversa e nunca trocar silenciosamente para cloud-*.
      const conexoesNaoOficiais = (conexoesDapi || []).filter(
        (c) => !/^cloud-/i.test(String(c.session_id || '').trim())
      );
      const conexaoDapi =
        (connection_id ? conexoesNaoOficiais.find((c) => c.id === connection_id) : null) ||
        (session_id ? conexoesNaoOficiais.find((c) => String(c.session_id || '') === String(session_id)) : null) ||
        conexoesNaoOficiais[0];

      if (conexaoDapi) {
        // Descriptografar API Key (mesma lógica do whatsappService)
        let apiKeyDecrypted = conexaoDapi.api_key_encrypted;
        try {
          const decoded = atob(conexaoDapi.api_key_encrypted);
          if (decoded && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.trim())) {
            apiKeyDecrypted = decoded.trim();
          } else {
            apiKeyDecrypted = conexaoDapi.api_key_encrypted.trim();
          }
        } catch (_) {
          apiKeyDecrypted = conexaoDapi.api_key_encrypted.trim();
        }

        const baseUrl = (conexaoDapi.base_url || 'https://api.d-api.cloud').replace(/\/$/, '');
        const sessionId = conexaoDapi.session_id || 'CRM JD';
        const forceParam = force ? '&force=true' : '';
        // async=false faz a rota aguardar a consulta ao WhatsApp e devolver a
        // foto na própria resposta, em vez de apenas enfileirar o processamento.
        const avatarUrl = `${baseUrl}/api/v1/contacts/${telLimpo}/avatar?sessionId=${encodeURIComponent(sessionId)}&async=false${forceParam}`;

        console.log(`📡 D-API avatar: ${avatarUrl}`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        const resDapi = await fetch(avatarUrl, {
          method: 'GET',
          headers: { 'Authorization': apiKeyDecrypted },
          signal: controller.signal
        });
        clearTimeout(timeout);

        const rawText = await resDapi.text();
        console.log(`📡 D-API avatar status: ${resDapi.status} | body: ${rawText?.slice(0, 500)}`);

        if (resDapi.ok) {
          let dataDapi = {};
          try { dataDapi = JSON.parse(rawText); } catch (_) { dataDapi = {}; }

          fotoUrl = encontrarUrlHttp(dataDapi) ||
            (/^https?:\/\//i.test(rawText?.trim() || '') ? rawText.trim() : null);
          console.log(`📸 Foto D-API encontrada: ${fotoUrl ? 'SIM' : 'NÃO'} | ${fotoUrl}`);
        }
      }
    } catch (e) {
      console.warn('⚠️ Erro ao buscar foto via D-API:', e.message);
    }

    // ── Fallback: Evolution API ────────────────────────────────────────────
    if (!fotoUrl) {
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id }, null, 1);
      const empresa = empresas[0];
      const evolutionUrl = (empresa?.evolution_url || Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
      const evolutionKey = empresa?.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY') || '';
      const evolutionInstance = empresa?.evolution_instance_name || Deno.env.get('EVOLUTION_INSTANCE_NAME') || '';

      console.log(`📡 Evolution: ${evolutionUrl} | Instance: ${evolutionInstance}`);

      if (evolutionUrl && evolutionKey && evolutionInstance) {
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
      } else {
        console.warn('⚠️ Evolution não configurada');
      }
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