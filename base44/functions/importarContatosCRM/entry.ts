import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function normalizarTelefone(raw) {
  let tel = String(raw || '').replace(/\D/g, '');
  if (!tel) return null;
  if (tel.startsWith('55') && tel.length >= 12 && tel.length <= 13) return tel;
  if (!tel.startsWith('55')) tel = '55' + tel;
  if (tel.length < 12 || tel.length > 13) return null;
  return tel;
}

function parseLinha(linha) {
  const raw = linha.trim();
  if (!raw) return null;

  // Tab-separated (planilha colada)
  if (raw.includes('\t')) {
    const partes = raw.split('\t');
    const nome = partes[0].trim();
    const tel = normalizarTelefone(partes[1]?.trim() || '');
    if (tel) return { nome: nome || null, telefone: tel };
    // Tentar inverso
    const tel2 = normalizarTelefone(partes[0]?.trim() || '');
    if (tel2) return { nome: partes[1]?.trim() || null, telefone: tel2 };
    return null;
  }

  // Com parênteses: "(87)9820-41146" em qualquer posição
  const matchParens = raw.match(/\((\d{2})\)\s*(\d[\d\s\-]{6,})/);
  if (matchParens) {
    const nome = raw.slice(0, matchParens.index).trim();
    const tel = normalizarTelefone(matchParens[0]);
    if (tel) return { nome: nome || null, telefone: tel };
  }

  // Múltiplos espaços como separador
  const matchEspacos = raw.match(/\s{2,}([\d\(\)\-\s]{10,})$/);
  if (matchEspacos) {
    const nome = raw.slice(0, matchEspacos.index).trim();
    const tel = normalizarTelefone(matchEspacos[1]);
    if (tel) return { nome: nome || null, telefone: tel };
  }

  // Só dígitos
  const apenasDigitos = raw.replace(/\D/g, '');
  if (apenasDigitos.length >= 10 && apenasDigitos.length <= 13) {
    const tel = normalizarTelefone(apenasDigitos);
    if (tel) return { nome: null, telefone: tel };
  }

  // Número no final sem separador claro
  const matchFinal = raw.match(/(\d[\d\-]{8,})$/);
  if (matchFinal) {
    const nome = raw.slice(0, matchFinal.index).trim();
    const tel = normalizarTelefone(matchFinal[1]);
    if (tel) return { nome: nome || null, telefone: tel };
  }

  return null;
}

// Aguarda N ms
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { contatos, empresa_id, tag_id } = body;

    if (!contatos || !Array.isArray(contatos) || contatos.length === 0) {
      return Response.json({ error: 'contatos array required' }, { status: 400 });
    }
    if (!empresa_id) {
      return Response.json({ error: 'empresa_id required' }, { status: 400 });
    }

    // 1. Parsear todas as linhas primeiro
    const parsed = [];
    let rejeitados = 0;
    for (const item of contatos) {
      const linhaRaw = typeof item === 'string' ? item : String(item.telefone || item.numero || item || '');
      const p = parseLinha(linhaRaw);
      if (!p) { rejeitados++; continue; }
      parsed.push(p);
    }

    // 2. Buscar TODOS os contatos existentes da empresa de uma vez (evita N queries)
    const existentesAll = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
      { empresa_id },
      null,
      5000
    ).catch(() => []);

    const telefonesExistentes = new Set(existentesAll.map(c => c.telefone));
    const existentesMap = {};
    for (const c of existentesAll) existentesMap[c.telefone] = c;

    // 3. Separar novos de duplicados
    const novos = [];
    const paraAtualizar = []; // duplicados que precisam de tag
    let duplicados = 0;

    for (const p of parsed) {
      if (telefonesExistentes.has(p.telefone)) {
        duplicados++;
        if (tag_id) {
          const existente = existentesMap[p.telefone];
          const tagsAtuais = existente.tags_ids || [];
          if (!tagsAtuais.includes(tag_id)) {
            paraAtualizar.push({ id: existente.id, tags_ids: [...tagsAtuais, tag_id] });
          }
        }
      } else {
        novos.push(p);
        // Marcar como existente para evitar duplicata dentro do próprio lote
        telefonesExistentes.add(p.telefone);
      }
    }

    // 4. Criar novos em lotes de 20 com pequeno delay
    let criados = 0;
    const BATCH = 20;
    for (let i = 0; i < novos.length; i += BATCH) {
      const lote = novos.slice(i, i + BATCH);
      const promises = lote.map(p =>
        base44.asServiceRole.entities.ContatoWhatsapp.create({
          empresa_id,
          telefone: p.telefone,
          nome: p.nome || `Contato ${p.telefone}`,
          ultima_atualizacao: new Date().toISOString(),
          ...(tag_id ? { tags_ids: [tag_id] } : {}),
        }).catch(e => { console.error(`Erro criar ${p.telefone}:`, e.message); return null; })
      );
      const resultados = await Promise.all(promises);
      criados += resultados.filter(Boolean).length;
      if (i + BATCH < novos.length) await sleep(300);
    }

    // 5. Atualizar tags dos duplicados em lotes
    for (let i = 0; i < paraAtualizar.length; i += BATCH) {
      const lote = paraAtualizar.slice(i, i + BATCH);
      await Promise.all(lote.map(c =>
        base44.asServiceRole.entities.ContatoWhatsapp.update(c.id, { tags_ids: c.tags_ids })
          .catch(() => null)
      ));
      if (i + BATCH < paraAtualizar.length) await sleep(200);
    }

    console.log(`✅ ${criados} criados | ⏭️ ${duplicados} duplicados | ❌ ${rejeitados} ignorados`);

    return Response.json({
      ok: true,
      criados,
      duplicados,
      rejeitados,
      total: contatos.length,
      mensagem: `✅ ${criados} salvos | ⏭️ ${duplicados} duplicados | ❌ ${rejeitados} ignorados`,
    });
  } catch (error) {
    console.error('Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});