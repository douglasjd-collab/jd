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

    // 1. Buscar TODOS os contatos do WhatsApp
    const contatos = await base44.entities.ContatoWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      5000 // Limite máximo
    );

    console.log(`📋 Total de contatos encontrados: ${contatos.length}`);

    if (contatos.length === 0) {
      return Response.json({ success: true, mensagem: 'Nenhum contato encontrado', atualizados: 0 });
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
    for (let i = 0; i < contatos.length; i += batchSize) {
      const batch = contatos.slice(i, i + batchSize);
      
      const promises = batch.map(async (contato) => {
        try {
          // Formatar telefone para formato Evolution (sem símbolos)
          const tel = contato.telefone.replace(/\D/g, '');
          if (!tel || tel.length < 10) return null;

          // Tentar múltiplas vezes
          let fotoUrl = null;
          for (let tentativa = 0; tentativa < 2; tentativa++) {
            try {
              // Buscar contato na API Evolution
              const resEvolution = await fetch(
                `${evolutionUrl}/chats/getProfile/${instanceName}/${tel}`,
                {
                  headers: {
                    apikey: evolutionKey,
                    'Content-Type': 'application/json'
                  }
                }
              );

              if (resEvolution.ok) {
                const data = await resEvolution.json();
                fotoUrl = data?.profilePictureUrl || data?.picture || null;
                if (fotoUrl) break;
              }
            } catch (e) {
              console.warn(`Tentativa ${tentativa + 1} falhou para ${tel}`);
            }
          }

          // Se encontrou foto e é diferente, atualizar
          if (fotoUrl && fotoUrl !== contato.foto_url) {
            await base44.entities.ContatoWhatsapp.update(contato.id, {
              foto_url: fotoUrl
            });
            atualizados++;
            console.log(`✅ ${contato.nome || tel}: foto atualizada`);
          } else if (!fotoUrl && contato.foto_url) {
            // Manter a foto existente
            console.log(`⏭️  ${contato.nome || tel}: mantendo foto existente`);
          }

          return { id: contato.id, nome: contato.nome, sucesso: true };
        } catch (erro) {
          console.error(`❌ Erro processando ${contato.nome}:`, erro.message);
          erros.push({ contato: contato.nome, erro: erro.message });
          return null;
        }
      });

      await Promise.all(promises);
    }

    console.log(`✅ Sincronização concluída: ${atualizados} fotos atualizadas`);

    return Response.json({
      success: true,
      totalContatos: contatos.length,
      atualizados,
      erros,
      mensagem: `Sincronização concluída. ${atualizados} fotos atualizadas de ${contatos.length} contatos.`
    });
  } catch (error) {
    console.error('Erro ao sincronizar fotos:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});