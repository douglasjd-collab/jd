import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Busca e sincroniza FOTOS de perfil dos contatos do WhatsApp
 * - Atualiza contatos existentes (ContatoWhatsapp)
 * - Cria ContatoWhatsapp para conversas que ainda não têm registro
 * Endpoint correto: POST /chat/fetchProfile/{instance} → campo "picture"
 * Faz upload permanente para o Base44 Storage
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

async function buscarFotoEvolution(evolutionUrl, evolutionKey, instanceName, telefone) {
  try {
    const res = await fetch(`${evolutionUrl}/chat/fetchProfile/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: telefone })
    });
    if (!res.ok) return { fotoUrl: null, nome: null };
    const data = await res.json();
    const fotoUrl = data?.picture || data?.profilePictureUrl || data?.photo || data?.pictureUrl || null;
    const nome = data?.name || data?.pushName || null;
    return { fotoUrl, nome };
  } catch (e) {
    return { fotoUrl: null, nome: null };
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

    console.log(`🖼️ Sincronizando fotos | ${evolutionUrl} | ${instanceName}`);

    // Buscar todos os contatos CRM e todas as conversas
    const [contatosCrm, conversas] = await Promise.all([
      base44.asServiceRole.entities.ContatoWhatsapp.filter({ empresa_id: empresaId }, '-created_date', 5000),
      base44.asServiceRole.entities.ConversaWhatsapp.filter({ empresa_id: empresaId }, '-data_ultima_mensagem', 5000),
    ]);

    console.log(`👥 ${contatosCrm.length} contatos CRM | 💬 ${conversas.length} conversas`);

    // Mapa telefone normalizado → contato
    const normTel = (tel) => {
      if (!tel) return '';
      const t = tel.replace(/\D/g, '');
      if (t.startsWith('55') && t.length === 13) return t.slice(0, 4) + t.slice(5); // remove 9 extra
      return t;
    };

    const contatoMap = {};
    for (const c of contatosCrm) {
      if (c.telefone) contatoMap[normTel(c.telefone)] = c;
    }

    // Descobrir telefones de conversas SEM contato
    const telefonesParaCriar = [];
    const vistos = new Set();
    for (const conv of conversas) {
      if (!conv.cliente_telefone) continue;
      const tel = conv.cliente_telefone.replace(/\D/g, '');
      // Excluir grupos/broadcasts
      if (conv.cliente_telefone.includes('@g.us') || conv.cliente_telefone.includes('@broadcast')) continue;
      if (tel.length < 8 || tel.length > 15) continue;
      const telNorm = normTel(tel);
      if (vistos.has(telNorm)) continue;
      vistos.add(telNorm);
      if (!contatoMap[telNorm]) {
        telefonesParaCriar.push({ tel, telNorm, nome: conv.cliente_nome || null });
      }
    }

    console.log(`🆕 ${telefonesParaCriar.length} conversas sem contato CRM — criando...`);

    let fotosAtualizadas = 0;
    let contatosCriados = 0;
    let erros = 0;

    // PASSO 1: Criar contatos para conversas que não têm registro
    for (const { tel, telNorm, nome } of telefonesParaCriar) {
      try {
        const { fotoUrl: fotoUrlOriginal, nome: nomeEvolution } = await buscarFotoEvolution(evolutionUrl, evolutionKey, instanceName, tel);

        let fotoUrlFinal = null;
        if (fotoUrlOriginal) {
          fotoUrlFinal = await baixarEFazerUploadFoto(fotoUrlOriginal, base44);
        }

        const novoContato = await base44.asServiceRole.entities.ContatoWhatsapp.create({
          empresa_id: empresaId,
          telefone: tel,
          nome: nome || nomeEvolution || `Cliente ${tel}`,
          foto_url: fotoUrlFinal || null,
          ultima_atualizacao: new Date().toISOString(),
        });

        contatoMap[telNorm] = novoContato;
        contatosCriados++;
        if (fotoUrlFinal) fotosAtualizadas++;
        console.log(`✅ Contato criado: ${tel} | foto: ${fotoUrlFinal ? 'sim' : 'não'}`);
      } catch (e) {
        console.error(`❌ Erro ao criar contato ${tel}: ${e.message}`);
        erros++;
      }
      await new Promise(r => setTimeout(r, 300));
    }

    // PASSO 2: Atualizar fotos de contatos existentes sem foto ou com foto expirada (WhatsApp URL)
    for (const contato of contatosCrm) {
      if (!contato.telefone) continue;

      // Já tem foto permanente no Base44 → pular
      if (contato.foto_url && contato.foto_url.includes('media.base44.com')) {
        fotosAtualizadas++;
        continue;
      }

      try {
        const tel = contato.telefone.replace(/\D/g, '');
        const { fotoUrl: fotoUrlOriginal } = await buscarFotoEvolution(evolutionUrl, evolutionKey, instanceName, tel);

        if (fotoUrlOriginal) {
          const fotoUrlFinal = await baixarEFazerUploadFoto(fotoUrlOriginal, base44);
          if (fotoUrlFinal) {
            await base44.asServiceRole.entities.ContatoWhatsapp.update(contato.id, {
              foto_url: fotoUrlFinal,
              ultima_atualizacao: new Date().toISOString()
            });
            fotosAtualizadas++;
            console.log(`✅ Foto atualizada: ${contato.nome || tel}`);
          }
        } else {
          console.log(`⚠️ Sem foto: ${contato.nome || tel}`);
        }
      } catch (e) {
        console.error(`❌ Erro: ${contato.telefone}: ${e.message}`);
        erros++;
      }

      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`✅ Concluído: ${fotosAtualizadas} fotos | ${contatosCriados} contatos criados | ${erros} erros`);
    return Response.json({
      ok: true,
      totalContatosCrm: contatosCrm.length,
      contatosCriados,
      fotosAtualizadas,
      erros
    });

  } catch (error) {
    console.error('❌ Erro geral:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});