import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Busca e sincroniza FOTOS de perfil dos contatos do WhatsApp
 * Endpoint correto da Evolution: POST /chat/fetchProfile/{instance} → campo "picture"
 * Faz upload das fotos para o Base44 Storage (URLs permanentes, sem CORS/expiração)
 */

async function baixarEFazerUploadFoto(fotoUrl, base44) {
  try {
    const res = await fetch(fotoUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const blob = new Blob([buffer], { type: contentType });
    const file = new File([blob], `foto_whatsapp.${ext}`, { type: contentType });
    const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file });
    return file_url;
  } catch (e) {
    console.log(`⚠️ Erro ao fazer upload da foto: ${e.message}`);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || '699696c2c9f5bffc2e67402b';

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId });
    if (!empresas?.[0]?.evolution_url || !empresas?.[0]?.evolution_api_key) {
      return Response.json({ erro: 'Evolution não configurada' }, { status: 400 });
    }

    const emp = empresas[0];
    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    console.log(`🖼️ Sincronizando fotos | URL: ${evolutionUrl} | Instância: ${instanceName}`);

    const contatosCrm = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      5000
    );

    console.log(`👥 ${contatosCrm.length} contatos encontrados`);

    let atualizadas = 0;
    let erros = 0;

    for (let i = 0; i < contatosCrm.length; i++) {
      const contato = contatosCrm[i];
      if (!contato.telefone) continue;

      // Pular contatos que já têm foto permanente no Base44 Storage
      if (contato.foto_url && contato.foto_url.includes('media.base44.com')) {
        console.log(`⏭️ Foto já permanente: ${contato.nome || contato.telefone}`);
        atualizadas++;
        continue;
      }

      try {
        const telefoneLimpo = contato.telefone.replace(/\D/g, '');
        let fotoUrlOriginal = null;

        // Endpoint correto: POST /chat/fetchProfile/{instance}
        try {
          const res = await fetch(`${evolutionUrl}/chat/fetchProfile/${instanceName}`, {
            method: 'POST',
            headers: {
              'apikey': evolutionKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ number: telefoneLimpo })
          });

          if (res.ok) {
            const data = await res.json();
            fotoUrlOriginal = data?.picture || data?.profilePictureUrl || data?.photo || data?.pictureUrl;
            console.log(`📱 ${telefoneLimpo}: ${fotoUrlOriginal ? '✅ foto encontrada' : '⚠️ sem foto'}`);
          } else {
            console.log(`⚠️ ${telefoneLimpo}: status ${res.status}`);
          }
        } catch (e) {
          console.log(`⚠️ Erro fetchProfile ${telefoneLimpo}: ${e.message}`);
        }

        if (fotoUrlOriginal) {
          // Baixar e fazer upload permanente
          const fotoUrlFinal = await baixarEFazerUploadFoto(fotoUrlOriginal, base44);
          if (fotoUrlFinal) {
            await base44.asServiceRole.entities.ContatoWhatsapp.update(contato.id, {
              foto_url: fotoUrlFinal,
              ultima_atualizacao: new Date().toISOString()
            });
            atualizadas++;
            console.log(`✅ Foto salva permanentemente: ${contato.nome || telefoneLimpo}`);
          }
        }
      } catch (e) {
        console.error(`❌ Erro ao processar ${contato.telefone}: ${e.message}`);
        erros++;
      }

      // Delay para não sobrecarregar a API
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`✅ Concluído: ${atualizadas} fotos, ${erros} erros`);
    return Response.json({ ok: true, totalContatos: contatosCrm.length, fotosAtualizadas: atualizadas, erros });

  } catch (error) {
    console.error('❌ Erro geral:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});