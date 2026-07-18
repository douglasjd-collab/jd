import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

/**
 * Coach IA — Indexa TODOS os documentos (imagens/PDFs) de uma conversa, identifica
 * cada um por TIPO + pessoa, agrupa por CPF (principal) quando disponível, e
 * persiste registros em DocumentoIndexado (upsert por conversa_id + arquivo_url).
 *
 * Esta etapa é a base para o cadastro SELETIVO: o parceiro pode pedir
 * "Cadastre João da Silva" e a IA consultará a indexação para localizar
 * somente os documentos de João, ignorando documentos de outras pessoas.
 *
 * Não realiza cadastro no CRM — apenas prepara a indexação.
 */
const limparCpf = (s) => (s || '').toString().replace(/\D/g, '');

const validarCpf = (cpfStr) => {
  const cpf = limparCpf(cpfStr);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i], 10) * (10 - i);
  let d1 = 11 - (soma % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(cpf[9], 10)) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i], 10) * (11 - i);
  let d2 = 11 - (soma % 11);
  if (d2 >= 10) d2 = 0;
  if (d2 !== parseInt(cpf[10], 10)) return false;
  return true;
};

const paraHashSimples = (str) => {
  // Hash determinístico curto (não criptográfico) — usado só para grupo_pessoa_id
  const s = (str || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'p_' + Math.abs(h).toString(36);
};

const montarGrupoIdPessoa = (nome, cpf, nascimento) => {
  const cpfLimpo = limparCpf(cpf);
  if (cpfLimpo && validarCpf(cpfLimpo)) return 'c_' + cpfLimpo;
  const base = [nome, nascimento].filter(Boolean).join('|').trim();
  if (base) return paraHashSimples(base);
  return 'p_desconhecido';
};

const normalizarNome = (s) => (s || '')
  .toString()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const paraDataISO = (val) => {
  if (!val) return null;
  const m = String(val).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  return null;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { conversa_id, empresa_id, forcar_reindexacao } = body;

    if (!conversa_id || !empresa_id) {
      return Response.json({ error: 'conversa_id e empresa_id são obrigatórios.' }, { status: 400 });
    }

    // ── 1. Listar TODOS os documentos (imagem + pdf + documento) da conversa ──
    let mensagensComDoc = [];
    try {
      const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
        { conversa_id, tipo_conteudo: { $in: ['imagem', 'pdf', 'documento'] } },
        'data_envio', 500
      );
      mensagensComDoc = (msgs || []).filter((m) => m.arquivo_url);
    } catch (e) {
      console.log('[indexarDocumentosConversa] listar mensagens falhou:', e.message);
    }

    if (!mensagensComDoc.length) {
      return Response.json({
        success: true,
        conversa_id,
        grupos: [],
        documentos_indexados: 0,
        mensagem: 'Nenhum documento localizado nesta conversa.'
      });
    }

    // ── 2. Reusar indexação existente, exceto se forçar ──
    const existentes = await base44.asServiceRole.entities.DocumentoIndexado.filter(
      { conversa_id }, '-indexado_em', 1000
    );
    if (existentes.length >= mensagensComDoc.length && !forcar_reindexacao) {
      const grupos = agrupar(existentes);
      return Response.json({
        success: true,
        conversa_id,
        reutilizado: true,
        documentos_indexados: existentes.length,
        grupos
      });
    }

    // ── 3. LLM — identifica cada arquivo isoladamente ──
    const arquivos = mensagensComDoc.map((m) => m.arquivo_url);
    const prompt = `Você é especialista em OCR de documentos brasileiros.
Analise CADA arquivo isoladamente (não agrupe nada). Para cada arquivo, identifique:

- TIPO do documento (apenas UM por arquivo): rg_frente, rg_verso, cin, cnh, cpf, comprovante_residencia, certidao, complementar, nao_identificado.
- LADO: frente, verso, completo, nao_identificado.
- LEGIVEL: true se nítido; false se desfocado/escuro/cortado.
- NOME IDENTIFICADO: o nome do TITULAR do documento — não o titular do comprovante (que pode ser mãe/cônjuge). Se for comprovante de residência em nome de terceiro, registrar o nome do terceiro no campo nome_identificado NÃO substitui o cliente — só como observação.
- CPF IDENTIFICADO: somente dígitos, se visível.
- RG IDENTIFICADO: número, se aplicável.
- DATA_NASCIMENTO: formato DD/MM/AAAA, se visível.
- NOME_MAE e NOME_PAI: se visíveis.
- ENDERECO_RESUMO: rua/av + número + bairro + cidade/UF, quando visível.
- NIVEL_CONFIANCA: alta (CPF legível OU nome+nascimento+n filiação claros), media (nome+RG ou nome+endereço), baixa (apenas primeiro nome, documento incompleto, ilegível), nao_identificado.

CRÍTICO: NUNCA inventar dados. Não agrupar documentos de pessoas diferentes. Cada arquivo é analisado sozinho.`;

    const schema = {
      type: 'object',
      properties: {
        documentos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              arquivo_url: { type: 'string' },
              tipo: { type: 'string', enum: ['rg_frente', 'rg_verso', 'cin', 'cnh', 'cpf', 'comprovante_residencia', 'certidao', 'complementar', 'nao_identificado'] },
              lado: { type: 'string', enum: ['frente', 'verso', 'completo', 'nao_identificado'] },
              legivel: { type: 'boolean' },
              nome_identificado: { type: 'string' },
              cpf_identificado: { type: 'string' },
              rg_identificado: { type: 'string' },
              data_nascimento: { type: 'string' },
              nome_mae: { type: 'string' },
              nome_pai: { type: 'string' },
              endereco_resumo: { type: 'string' },
              nivel_confianca: { type: 'string', enum: ['alta', 'media', 'baixa', 'nao_identificado'] },
              observacao: { type: 'string' }
            }
          }
        }
      }
    };

    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      file_urls: arquivos,
      response_json_schema: schema,
      model: 'claude_sonnet_4_6'
    });

    let docs = (llmRes && llmRes.documentos) || [];
    // Alguns modelos embrulham em "response"
    if ((!docs || !docs.length) && llmRes?.response?.documentos) {
      docs = llmRes.response.documentos;
    }

    // Mantém order por arquivo_url para casar com mensagens
    const porUrl = {};
    docs.forEach((d) => { if (d?.arquivo_url) porUrl[d.arquivo_url] = d; });

    // ── 4. Montar registros DocumentoIndexado (upsert por conversa_id+arquivo_url) ──
    const agora = new Date().toISOString();
    const registros = [];
    for (const msg of mensagensComDoc) {
      const url = msg.arquivo_url;
      const d = porUrl[url] || {};
      const nome = (d.nome_identificado || '').toString().trim();
      const cpf = limparCpf(d.cpf_identificado || '');
      const nascimento = paraDataISO(d.data_nascimento) || null;
      const grupoId = montarGrupoIdPessoa(nome, cpf, nascimento);

      const registro = {
        empresa_id,
        conversa_id,
        parceiro_id: msg.created_by_id || msg.usuario_id || null,
        mensagem_id: msg.id || null,
        arquivo_url: url,
        arquivo_nome: msg.arquivo_nome || '',
        arquivo_hash: 'idx_' + paraHashSimples(conversa_id + '|' + url),
        data_envio: msg.data_envio || msg.created_date || agora,
        tipo_documento: d.tipo || 'nao_identificado',
        lado: d.lado || 'nao_identificado',
        legivel: d.legivel !== false,
        nome_identificado: nome,
        cpf_identificado: cpf && cpf.length === 11 ? cpf : '',
        rg_identificado: (d.rg_identificado || '').toString().trim(),
        data_nascimento_identificada: nascimento,
        nome_mae_identificado: (d.nome_mae || '').toString().trim(),
        nome_pai_identificado: (d.nome_pai || '').toString().trim(),
        endereco_resumo: (d.endereco_resumo || '').toString().trim(),
        grupo_pessoa_id: grupoId,
        nivel_confianca: d.nivel_confianca || 'nao_identificado',
        status_vinculacao: 'pendente',
        observacao: (d.observacao || '').toString().trim(),
        indexado_em: agora
      };

      // Atualiza registro existente (mesmo conversa_id + arquivo_url) ou cria
      const existente = existentes.find((x) => x.arquivo_url === url);
      if (existente) {
        try {
          await base44.asServiceRole.entities.DocumentoIndexado.update(existente.id, registro);
          registros.push({ ...registro, id: existente.id });
        } catch (e) {
          console.log('[indexarDocumentosConversa] update falhou, criando:', e.message);
          const novo = await base44.asServiceRole.entities.DocumentoIndexado.create(registro);
          registros.push({ ...registro, id: novo.id });
        }
      } else {
        const novo = await base44.asServiceRole.entities.DocumentoIndexado.create(registro);
        registros.push({ ...registro, id: novo.id });
      }
    }

    return Response.json({
      success: true,
      conversa_id,
      documentos_indexados: registros.length,
      grupos: agrupar(registros)
    });
  } catch (error) {
    console.error('[indexarDocumentosConversa] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Agrupa registros por grupo_pessoa_id e resume para o cliente.
function agrupar(registros) {
  const map = {};
  for (const r of registros) {
    const g = r.grupo_pessoa_id || 'p_desconhecido';
    if (!map[g]) {
      map[g] = {
        grupo_id: g,
        nome: r.nome_identificado || '',
        cpf: r.cpf_identificado || '',
        rg: r.rg_identificado || '',
        data_nascimento: r.data_nascimento_identificada || '',
        nome_mae: r.nome_mae_identificado || '',
        nome_pai: r.nome_pai_identificado || '',
        municipio_endereco: r.endereco_resumo || '',
        nivel_confianca: r.nivel_confianca || 'nao_identificado',
        documentos: []
      };
    }
    const gNome = normalizarNome(r.nome_identificado);
    if (r.nome_identificado && (!map[g].nome || r.nome_identificado.length > map[g].nome.length)) {
      map[g].nome = r.nome_identificado;
    }
    if (r.cpf_identificado && r.cpf_identificado.length === 11) map[g].cpf = r.cpf_identificado;
    if (r.rg_identificado && !map[g].rg) map[g].rg = r.rg_identificado;
    if (r.data_nascimento_identificada && !map[g].data_nascimento) map[g].data_nascimento = r.data_nascimento_identificada;
    if (r.nome_mae_identificado && !map[g].nome_mae) map[g].nome_mae = r.nome_mae_identificado;
    if (r.nome_pai_identificado && !map[g].nome_pai) map[g].nome_pai = r.nome_pai_identificado;
    if (r.endereco_resumo && !map[g].municipio_endereco) map[g].municipio_endereco = r.endereco_resumo;

    // Sobe a confiança se algum documento tiver mais alta
    const ordem = { alta: 4, media: 3, baixa: 2, nao_identificado: 1 };
    if (ordem[r.nivel_confianca] > ordem[map[g].nivel_confianca]) {
      map[g].nivel_confianca = r.nivel_confianca;
    }

    map[g].documentos.push({
      id: r.id,
      arquivo_url: r.arquivo_url,
      arquivo_nome: r.arquivo_nome,
      tipo: r.tipo_documento,
      lado: r.lado,
      legivel: r.legivel,
      data_envio: r.data_envio,
      nivel_confianca: r.nivel_confianca
    });
  }

  return Object.values(map);
}