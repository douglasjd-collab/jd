import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const empresaId = user.empresa_id;
    if (!empresaId) {
      return Response.json({ error: 'Empresa não identificada' }, { status: 400 });
    }

    console.log(`🔄 Sincronizando TODAS as fotos de contatos da empresa ${empresaId}`);

    // 1. Buscar TODAS as conversas (elas têm foto_url salva)
    const conversas = await base44.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      5000 // Limite máximo
    );

    console.log(`📋 Total de conversas encontradas: ${conversas.length}`);

    if (conversas.length === 0) {
      return Response.json({ success: true, mensagem: 'Nenhuma conversa encontrada', atualizados: 0 });
    }

    // 2. Descobrir qual provider buscar foto: D-API (preferencial) ou Evolution (fallback)
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    const conexoesDapi = await base44.asServiceRole.entities.WhatsappConnection.filter({
      empresa_id: empresaId,
      provider_type: 'dapi',
      is_active: true
    }, '-created_date', 1);
    const conexaoDapi = conexoesDapi?.[0];

    let dapiBaseUrl = null;
    let dapiApiKey = null;
    let dapiSessionId = null;
    if (conexaoDapi) {
      dapiBaseUrl = (conexaoDapi.base_url || 'https://api.d-api.cloud').replace(/\/$/, '');
      dapiSessionId = conexaoDapi.session_id || 'CRM JD';
      try {
        const decoded = atob(conexaoDapi.api_key_encrypted);
        dapiApiKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.trim())
          ? decoded.trim()
          : conexaoDapi.api_key_encrypted.trim();
      } catch (_) {
        dapiApiKey = conexaoDapi.api_key_encrypted.trim();
      }
    }

    if (!conexaoDapi && (!evolutionUrl || !evolutionKey || !instanceName)) {
      return Response.json({ error: 'Nenhum provider (D-API ou Evolution) configurado' }, { status: 400 });
    }

    let atualizados = 0;
    const erros = [];

    // Processar em paralelo com controle de concorrência
    const batchSize = 10;
    for (let i = 0; i < conversas.length; i += batchSize) {
      const batch = conversas.slice(i, i + batchSize);
      
      const promises = batch.map(async (conversa) => {
        try {
          // Formatar telefone (sem símbolos)
          const tel = conversa.cliente_telefone?.replace(/\D/g, '');
          if (!tel || tel.length < 10) return null;

          let fotoUrl = null;

          // Tentar D-API primeiro
          if (dapiApiKey && dapiBaseUrl) {
            try {
              const avatarUrl = `${dapiBaseUrl}/api/v1/contacts/${tel}/avatar?sessionId=${encodeURIComponent(dapiSessionId)}`;
              const resDapi = await fetch(avatarUrl, {
                method: 'GET',
                headers: { 'Authorization': dapiApiKey }
              });
              if (resDapi.ok) {
                const rawText = await resDapi.text();
                let dataDapi = {};
                try { dataDapi = JSON.parse(rawText); } catch (_) { dataDapi = {}; }
                const candidatos = [
                  dataDapi?.avatar, dataDapi?.avatarUrl, dataDapi?.avatar_url, dataDapi?.url, dataDapi?.picture,
                  dataDapi?.data?.avatar, dataDapi?.data?.avatarUrl, dataDapi?.data?.avatar_url, dataDapi?.data?.url, dataDapi?.data?.picture,
                ];
                fotoUrl = candidatos.find(v => typeof v === 'string' && v.startsWith('http')) || null;
                if (fotoUrl) console.log(`✅ Foto encontrada via D-API para ${tel}`);
              }
            } catch (e) {
              // Tentar Evolution a seguir
            }
          }

          // Fallback: Evolution API
          if (!fotoUrl && evolutionUrl && evolutionKey && instanceName) {
            const endpoints = [
              `${evolutionUrl}/chats/getProfile/${instanceName}/${tel}`,
              `${evolutionUrl}/chats/${instanceName}/profile/${tel}`,
              `${evolutionUrl}/profile/${tel}/${instanceName}`,
            ];

            for (const endpoint of endpoints) {
              if (fotoUrl) break;
              try {
                const resEvolution = await fetch(endpoint, {
                  headers: {
                    apikey: evolutionKey,
                    'Content-Type': 'application/json'
                  }
                });

                if (resEvolution.ok) {
                  const data = await resEvolution.json();
                  fotoUrl = data?.profilePictureUrl || data?.picture || data?.photo || data?.profilePicture || null;
                  if (fotoUrl) {
                    console.log(`✅ Foto encontrada via ${endpoint} para ${tel}`);
                    break;
                  }
                }
              } catch (e) {
                // Tentar próximo endpoint silenciosamente
              }
            }
          }

          // Se encontrou foto e é diferente, atualizar na conversa
          if (fotoUrl && fotoUrl !== conversa.foto_url) {
            await base44.entities.ConversaWhatsapp.update(conversa.id, {
              foto_url: fotoUrl
            });
            atualizados++;
            console.log(`✅ ATUALIZADO: ${conversa.cliente_nome || tel} (${tel})`);
          } else if (fotoUrl && fotoUrl === conversa.foto_url) {
            console.log(`ℹ️  JÁ TEM FOTO: ${conversa.cliente_nome || tel} (${tel})`);
          } else if (!fotoUrl && conversa.foto_url) {
            console.log(`⏭️  MANTÉM EXISTENTE: ${conversa.cliente_nome || tel} (${tel})`);
          } else {
            console.log(`❌ SEM FOTO: ${conversa.cliente_nome || tel} (${tel})`);
          }

          return { id: conversa.id, nome: conversa.cliente_nome, sucesso: true };
        } catch (erro) {
          console.error(`❌ Erro processando ${conversa.cliente_nome}:`, erro.message);
          erros.push({ conversa: conversa.cliente_nome, erro: erro.message });
          return null;
        }
      });

      await Promise.all(promises);
    }

    console.log(`✅ Sincronização concluída: ${atualizados} fotos atualizadas`);

    return Response.json({
      success: true,
      totalConversas: conversas.length,
      atualizados,
      erros,
      mensagem: `Sincronização concluída. ${atualizados} fotos atualizadas de ${conversas.length} conversas.`
    });
  } catch (error) {
    console.error('Erro ao sincronizar fotos:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});