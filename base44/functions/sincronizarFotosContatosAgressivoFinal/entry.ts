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

    // 2. Chamar a API Evolution para cada contato para buscar foto
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    if (!evolutionUrl || !evolutionKey || !instanceName) {
      return Response.json({ error: 'Evolution não configurado' }, { status: 400 });
    }

    let atualizados = 0;
    const erros = [];

    // Processar em paralelo com controle de concorrência
    const batchSize = 10;
    for (let i = 0; i < conversas.length; i += batchSize) {
      const batch = conversas.slice(i, i + batchSize);
      
      const promises = batch.map(async (conversa) => {
        try {
          // Formatar telefone para formato Evolution (sem símbolos)
          const tel = conversa.cliente_telefone?.replace(/\D/g, '');
          if (!tel || tel.length < 10) return null;

          // Tentar múltiplos endpoints da Evolution API
          let fotoUrl = null;
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