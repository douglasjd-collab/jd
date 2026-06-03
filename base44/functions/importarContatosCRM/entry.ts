import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function normalizarTelefone(raw) {
  // Remove tudo que não é dígito
  let tel = String(raw || '').replace(/\D/g, '');
  if (!tel) return null;

  // Já tem DDI 55
  if (tel.startsWith('55')) {
    // 55 + DDD(2) + 9(digito extra) + numero(8) = 13 dígitos  ✓
    // 55 + DDD(2) + numero(8) = 12 dígitos  ✓
    if (tel.length === 12 || tel.length === 13) return tel;
    // Tenta sem DDI
    tel = tel.slice(2);
  }

  // Sem DDI: DDD(2) + 9 + numero = 11 dígitos ou DDD(2) + numero = 10 dígitos
  if (tel.length === 11 || tel.length === 10) {
    // Celulares com 9 dígitos: garante o 9 na frente
    if (tel.length === 10) {
      const ddd = tel.slice(0, 2);
      const numero = tel.slice(2);
      // Adiciona 9 se necessário
      tel = ddd + '9' + numero;
    }
    return '55' + tel;
  }

  return null;
}

function parseLinha(linha) {
  // Remove caracteres invisíveis e espaços extras
  const raw = linha.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!raw) return null;

  // Tab-separated (planilha colada: "Nome\tTelefone" ou "Telefone\tNome")
  if (raw.includes('\t')) {
    const partes = raw.split('\t');
    const tel1 = normalizarTelefone(partes[0]?.trim());
    const tel2 = normalizarTelefone(partes[1]?.trim());
    if (tel2) return { nome: partes[0]?.trim() || null, telefone: tel2 };
    if (tel1) return { nome: partes[1]?.trim() || null, telefone: tel1 };
    return null;
  }

  // Extrair dígitos da linha inteira (ignora letras no final tipo "d", "a")
  const apenasDigitos = raw.replace(/\D/g, '');
  if (!apenasDigitos) return null;

  const tel = normalizarTelefone(apenasDigitos);
  if (!tel) return null;

  // Nome é a parte antes dos dígitos/parênteses
  const matchNome = raw.match(/^([A-Za-zÀ-ÿ\s]+?)[\s]*[\(\d]/);
  const nome = matchNome ? matchNome[1].trim() : null;

  return { nome: nome || null, telefone: tel };
}

// Busca todos os contatos com paginação automática
async function buscarTodosContatos(base44, empresa_id) {
  const todos = [];
  const PAGE = 1000;
  let skip = 0;
  while (true) {
    const lote = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
      { empresa_id },
      null,
      PAGE,
      skip
    ).catch(() => []);
    todos.push(...lote);
    if (lote.length < PAGE) break;
    skip += PAGE;
  }
  return todos;
}

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

    // 1. Parsear todas as linhas
    const parsed = [];
    let rejeitados = 0;
    for (const item of contatos) {
      const linhaRaw = typeof item === 'string' ? item : String(item.telefone || item.numero || item || '');
      const p = parseLinha(linhaRaw);
      if (!p) { rejeitados++; console.log(`⏭️ Ignorado (não reconhecido): ${linhaRaw}`); continue; }
      parsed.push(p);
    }

    // 2. Buscar TODOS os contatos existentes com paginação
    const existentesAll = await buscarTodosContatos(base44, empresa_id);
    console.log(`📋 Total existentes na base: ${existentesAll.length}`);

    const telefonesExistentes = new Set(existentesAll.map(c => c.telefone));
    const existentesMap = {};
    for (const c of existentesAll) existentesMap[c.telefone] = c;

    // 3. Separar novos de duplicados
    const novos = [];
    const paraAtualizar = [];
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
        telefonesExistentes.add(p.telefone); // Evitar duplicata dentro do lote
      }
    }

    console.log(`🆕 Novos: ${novos.length} | ⏭️ Duplicados: ${duplicados} | ❌ Rejeitados: ${rejeitados}`);

    // 4. Criar novos em lotes de 20
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
        }).then(r => { console.log(`✅ Criado: ${p.telefone} | ${p.nome || ''}`); return r; })
          .catch(e => { console.error(`❌ Erro criar ${p.telefone}: ${e.message}`); return null; })
      );
      const resultados = await Promise.all(promises);
      criados += resultados.filter(Boolean).length;
      if (i + BATCH < novos.length) await sleep(300);
    }

    // 5. Atualizar tags dos duplicados
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