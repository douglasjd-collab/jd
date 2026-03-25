import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Busca e sincroniza FOTOS de perfil dos contatos do WhatsApp
 * Atualiza a URL da foto em ContatoWhatsapp
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || '699696c2c9f5bffc2e67402b';

    // Buscar config da Evolution
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId });
    if (!empresas?.[0]?.evolution_url || !empresas?.[0]?.evolution_api_key) {
      return Response.json({ erro: 'Evolution não configurada' }, { status: 400 });
    }

    const emp = empresas[0];
    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    console.log(`🖼️ Iniciando sincronização de fotos de contatos...`);

    // 1. Buscar todos os contatos CRM da empresa
    const contatosCrm = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      5000
    );

    console.log(`👥 ${contatosCrm.length} contatos encontrados no CRM`);

    let atualizadas = 0;
    let erros = 0;

    // 2. Para cada contato, buscar foto no WhatsApp
    for (let i = 0; i < contatosCrm.length; i++) {
      const contato = contatosCrm[i];
      if (!contato.telefone) continue;

      try {
        const telefoneLimpo = contato.telefone.replace(/\D/g, '');

        // Buscar perfil no WhatsApp usando dois endpoints
        let fotoUrl = null;

        // Tentar endpoint 1: fetchProfile
        try {
          const resProfile = await fetch(`${evolutionUrl}/contact/fetchProfile/${instanceName}`, {
            method: 'POST',
            headers: { 
              'apikey': evolutionKey, 
              'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ number: telefoneLimpo })
          });

          if (resProfile.ok) {
            const profileData = await resProfile.json();
            fotoUrl = profileData?.profilePictureUrl 
              || profileData?.picture 
              || profileData?.photo 
              || profileData?.pictureUrl;
          }
        } catch (e) {
          console.log(`⚠️ Erro no fetchProfile para ${telefoneLimpo}: ${e.message}`);
        }

        // Tentar endpoint 2: getProfilePictureUrl como fallback
        if (!fotoUrl) {
          try {
            const resPic = await fetch(`${evolutionUrl}/chat/getProfilePictureUrl?instance=${instanceName}&phone=${telefoneLimpo}`, {
              headers: { 'apikey': evolutionKey }
            });

            if (resPic.ok) {
              const picData = await resPic.json();
              fotoUrl = picData?.profilePictureUrl || picData?.url;
            }
          } catch (e) {
            console.log(`⚠️ Erro no getProfilePictureUrl para ${telefoneLimpo}: ${e.message}`);
          }
        }

        // Se encontrou foto, atualizar contato
        if (fotoUrl && fotoUrl.trim().length > 0) {
          await base44.asServiceRole.entities.ContatoWhatsapp.update(contato.id, {
            foto_url: fotoUrl,
            ultima_atualizacao: new Date().toISOString()
          });
          atualizadas++;
          console.log(`✅ Foto atualizada: ${contato.nome || telefoneLimpo}`);
        } else {
          console.log(`⚠️ Sem foto para: ${contato.nome || telefoneLimpo}`);
        }
      } catch (e) {
        console.error(`❌ Erro ao processar ${contato.telefone}: ${e.message}`);
        erros++;
      }

      // Delay progressivo para não sobrecarregar a API
      if ((i + 1) % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`✅ Sincronização concluída: ${atualizadas} fotos atualizadas, ${erros} erros`);

    return Response.json({
      ok: true,
      totalContatos: contatosCrm.length,
      fotosAtualizadas: atualizadas,
      erros
    });

  } catch (error) {
    console.error('❌ Erro geral:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});