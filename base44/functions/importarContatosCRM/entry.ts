import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Normaliza um telefone brasileiro para o formato 55 + DDD + número (12 ou 13 dígitos).
 * Aceita formatos: (87)9820-41146, (82)9812-32133, (47)99132-1997, etc.
 * Retorna null se inválido.
 */
function normalizarTelefone(raw) {
  // Só dígitos
  let tel = String(raw || '').replace(/\D/g, '');

  if (!tel) return null;

  // Se já começa com 55 e tem tamanho correto (12-13), usar
  if (tel.startsWith('55') && tel.length >= 12 && tel.length <= 13) {
    return tel;
  }

  // Se não começa com 55, adicionar o prefixo 55
  if (!tel.startsWith('55')) {
    tel = '55' + tel;
  }

  // Validar: 55 + DDD (2 dígitos) + número (8 ou 9 dígitos) = 12 ou 13 total
  if (tel.length < 12 || tel.length > 13) {
    return null;
  }

  return tel;
}

/**
 * Tenta extrair nome e telefone de uma linha.
 * Suporta:
 *   - "Nome\tTelefone" (formato planilha)
 *   - "Nome  Telefone" (espaços)
 *   - Só número
 *   - Número com nome embutido
 */
function parseLinha(linha) {
  const raw = linha.trim();
  if (!raw) return null;

  // Tab-separated (planilha colada)
  if (raw.includes('\t')) {
    const partes = raw.split('\t');
    const nome = partes[0].trim();
    const telefoneRaw = partes[1]?.trim() || '';
    const tel = normalizarTelefone(telefoneRaw);
    if (tel) return { nome: nome || null, telefone: tel };
    // Se primeira parte não deu, tentar inverso
    const tel2 = normalizarTelefone(partes[0]?.trim() || '');
    if (tel2) return { nome: partes[1]?.trim() || null, telefone: tel2 };
    return null;
  }

  // Tentar extrair telefone com parênteses (ex: "(87)9820-41146" ou "(87) 9820-41146")
  // Pode estar em qualquer posição da linha
  const matchTelParens = raw.match(/\((\d{2})\)\s*(\d[\d\s\-]{6,})/);
  if (matchTelParens) {
    const nome = raw.slice(0, matchTelParens.index).trim();
    const tel = normalizarTelefone(matchTelParens[0]);
    if (tel) return { nome: nome || null, telefone: tel };
  }

  // Linha com múltiplos espaços: "NOME SOBRENOME   55XXXXXXXXXX" ou "NOME   XXXXXXXXXX"
  // Tentar separar pelo último bloco de dígitos contíguos com 10+ chars
  const matchNumeroFinal = raw.match(/\s{2,}([\d\(\)\-\s]{10,})$/);
  if (matchNumeroFinal) {
    const nome = raw.slice(0, matchNumeroFinal.index).trim();
    const tel = normalizarTelefone(matchNumeroFinal[1]);
    if (tel) return { nome: nome || null, telefone: tel };
  }

  // Linha é apenas dígitos/formatação de número
  const apenasDigitos = raw.replace(/\D/g, '');
  if (apenasDigitos.length >= 10 && apenasDigitos.length <= 13) {
    const tel = normalizarTelefone(apenasDigitos);
    if (tel) return { nome: null, telefone: tel };
  }

  // Última tentativa: a linha toda pode ser nome + número sem separador claro
  // Pegar sequência final de dígitos (sem espaço)
  const matchFinalDigits = raw.match(/(\d[\d\-]{8,})$/);
  if (matchFinalDigits) {
    const nome = raw.slice(0, matchFinalDigits.index).trim();
    const tel = normalizarTelefone(matchFinalDigits[1]);
    if (tel) return { nome: nome || null, telefone: tel };
  }

  return null;
}

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

    let criados = 0;
    let duplicados = 0;
    let rejeitados = 0;
    const erros = [];

    for (const item of contatos) {
      try {
        const linhaRaw = typeof item === 'string' ? item : String(item.telefone || item.numero || item || '');

        const parsed = parseLinha(linhaRaw);
        if (!parsed) {
          rejeitados++;
          console.log(`⏭️ Ignorado (não reconhecido): ${linhaRaw.slice(0, 60)}`);
          continue;
        }

        const { nome, telefone } = parsed;

        // Verificar duplicata
        const existentes = await base44.asServiceRole.entities.ContatoWhatsapp.filter({
          empresa_id,
          telefone,
        }).catch(() => []);

        if (existentes.length > 0) {
          // Se tem tag para adicionar, atualiza o existente
          if (tag_id) {
            const existente = existentes[0];
            const tagsAtuais = existente.tags_ids || [];
            if (!tagsAtuais.includes(tag_id)) {
              await base44.asServiceRole.entities.ContatoWhatsapp.update(existente.id, {
                tags_ids: [...tagsAtuais, tag_id],
              });
            }
          }
          duplicados++;
          console.log(`⏭️ Já existe (tag atualizada): ${telefone}`);
          continue;
        }

        // Criar contato
        const dados = {
          empresa_id,
          telefone,
          nome: nome || `Contato ${telefone}`,
          ultima_atualizacao: new Date().toISOString(),
          ...(tag_id ? { tags_ids: [tag_id] } : {}),
        };

        await base44.asServiceRole.entities.ContatoWhatsapp.create(dados);
        criados++;
        console.log(`✅ Criado: ${telefone} | ${nome || '(sem nome)'}`);
      } catch (e) {
        erros.push(`Erro: ${e.message}`);
        console.error(`❌ ${item}: ${e.message}`);
      }
    }

    return Response.json({
      ok: true,
      criados,
      duplicados,
      rejeitados,
      erros: erros.length > 0 ? erros : null,
      total: contatos.length,
      mensagem: `✅ ${criados} salvos | ⏭️ ${duplicados} duplicados | ❌ ${rejeitados} ignorados`,
    });
  } catch (error) {
    console.error('Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});