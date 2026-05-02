import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * SOLUÇÃO AGRESSIVA: Força busca de fotos via Evolution API
 * Tenta puxar foto de TODOS os contatos mesmo que já tenha
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { empresa_id } = await req.json();

    if (!empresa_id) {
      return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });
    }

    // Buscar empresa para pegar Evolution URL e API key
    const empresas = await base44.entities.Empresa.filter({ id: empresa_id }, '-created_date', 1);
    if (!empresas?.length) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const empresa = empresas[0];
    const evolutionUrl = empresa.evolution_url || Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = empresa.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = empresa.evolution_instance_name || Deno.env.get('EVOLUTION_INSTANCE_NAME');

    if (!evolutionUrl || !evolutionApiKey || !instanceName) {
      return Response.json({ error: 'Evolution não configurado para esta empresa' }, { status: 400 });
    }

    // Buscar TODOS os contatos
    const contatos = await base44.entities.ContatoWhatsapp.filter(
      { empresa_id },
      '-updated_date',
      5000
    );

    console.log(`🔄 Sincronizando ${contatos.length} contatos...`);

    let atualizados = 0;
    let erros = [];

    // Processar em lotes para não sobrecarregar
    const loteSize = 10;
    for (let i = 0; i < contatos.length; i += loteSize) {
      const lote = contatos.slice(i, i + loteSize);

      const promises = lote.map(async (contato) => {
        try {
          // Normalizar telefone para formato Evolution (55 + DD + NNNNNNNNN@c.us)
          const tel = contato.telefone.replace(/\D/g, '');
          if (!tel.startsWith('55')) return null;

          const chatId = `${tel}@c.us`;

          // Tentar buscar foto via Evolution
          const fotoUrl = `${evolutionUrl}/chats/${instanceName}/whatsappProfile/${chatId}`;

          const res = await fetch(fotoUrl, {
            method: 'GET',
            headers: {
              'apikey': evolutionApiKey,
              'accept': 'application/json'
            }
          });

          if (res.ok) {
            const data = await res.json();
            
            // Tentar extrair foto da resposta
            let foto = null;
            if (data.profilePicture) foto = data.profilePicture;
            else if (data.picture) foto = data.picture;
            else if (data.pictureUrl) foto = data.pictureUrl;
            else if (data.foto_url) foto = data.foto_url;

            if (foto && foto !== contato.foto_url) {
              // Atualizar contato com foto
              await base44.entities.ContatoWhatsapp.update(contato.id, { foto_url: foto });
              console.log(`✅ ${tel} - Foto atualizada`);
              return { status: 'atualizado', telefone: tel };
            }
          }
          return null;
        } catch (err) {
          erros.push({ telefone: contato.telefone, erro: err.message });
          return null;
        }
      });

      const resultados = await Promise.all(promises);
      atualizados += resultados.filter(r => r?.status === 'atualizado').length;

      // Aguardar um pouco entre lotes
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`✅ Sincronização concluída: ${atualizados}/${contatos.length} fotos atualizadas`);

    return Response.json({
      ok: true,
      total_contatos: contatos.length,
      fotos_atualizadas: atualizados,
      erros: erros.length > 0 ? erros : null,
      mensagem: `${atualizados} fotos atualizadas de ${contatos.length} contatos`
    });
  } catch (error) {
    console.error('Erro ao sincronizar fotos:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});