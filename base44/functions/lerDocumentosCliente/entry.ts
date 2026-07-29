import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * lerDocumentosCliente
 * Recebe um array de file_urls (arquivos já enviados ao storage pelo frontend)
 * e, para cada arquivo, chama InvokeLLM (claude_sonnet_4_6 com visão) para:
 *   - Identificar o tipo do documento (cnh, rg, comprovante_residencia, outro)
 *   - Extrair os campos disponíveis com confiança por campo
 *   - Normalizar datas para ISO (YYYY-MM-DD) e CPF para somente dígitos
 * Retorna { documentos: [{ arquivo_url, arquivo_nome, tipo_documento, lado, campos: {...}, confianca_geral, campos_baixa_confianca, observacoes, erro }] }
 */

// Normaliza a string de tipo retornada pelo modelo (aceita variações case-insensitive,
// acentos, sinônimos). Retorna 'cnh' | 'rg' | 'comprovante_residencia' | 'outro'.
function normalizarTipoDocumento(raw: any): string {
  if (raw == null) return 'outro';
  const s = String(raw).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9_ ]/g, ' ')
    .trim();
  if (!s || s === 'outro' || s === 'none' || s === 'null' || s === 'nao_identificado') return 'outro';
  if (s === 'cnh' || s.includes('habilitacao') || s.includes('motorista') || s.includes('permissao para dirigir') || s.includes('carteira de motorista')) return 'cnh';
  if (s === 'rg' || s.includes('identidade') || s.includes('registro geral') || s.includes('cin') || s.includes('cipp') || s.includes('carteira de ident')) return 'rg';
  if (s === 'comprovante_residencia' || s.includes('comprovante') || s.includes('residencia') || s.includes('moradia') || s.includes('endereco') || s.includes('conta de') || s.includes('fatura') || s.includes('extracto') || s.includes('extrato')) return 'comprovante_residencia';
  return 'outro';
}

function normalizarLado(raw: any): string {
  if (raw == null) return 'nao_identificado';
  const s = String(raw).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_ ]/g, ' ')
    .trim();
  if (!s) return 'nao_identificado';
  if (s.includes('frente') || s.includes('anverso') || s === 'front') return 'frente';
  if (s.includes('verso') || s.includes('verso') || s === 'back' || s === 'reverse') return 'verso';
  if (s.includes('completo') || s.includes('ambos') || s.includes('frente e verso')) return 'completo';
  return 'nao_identificado';
}

// Converte datas em qualquer formato comum (pt-BR, ISO, dd/mm/aaaa, etc.)
// para ISO YYYY-MM-DD aceito por inputs type="date". Retorna null se inválida.
function normalizarDataISO(raw: any): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'none') return null;
  // 1) Tenta ISO direto (YYYY-MM-DD ou YYYY/MM/DD)
  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return `${m[1].padStart(4, '0')}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // 2) Tenta pt-BR (dd/mm/aaaa ou d/m/aa) — pode ter hora após espaço
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    let y = m[3];
    if (y.length === 2) y = (Number(y) > 30 ? '19' : '20') + y;
    return `${y}-${mo}-${d}`;
  }
  return null;
}

const SCHEMA = {
  type: 'object',
  properties: {
    // Aceitamos string livre (não enum) porque diferentes modelos retornam
    // variações (CNH, Carteira Nacional de Habilitação, etc). Normalizamos no código.
    tipo_documento: { type: 'string', description: 'cnh | rg | comprovante_residencia | outro (case-insensitive, aceita variações como CNH, carteira de motorista, etc)' },
    lado: { type: 'string', description: 'frente | verso | completo | nao_identificado (case-insensitive, aceita variações)' },
    // Identidade (CNH e RG)
    nome_completo: { type: 'string' },
    cpf: { type: 'string' },
    rg: { type: 'string' },
    rg_orgao_emissor: { type: 'string' },
    rg_uf: { type: 'string' },
    rg_data_emissao: { type: 'string' },
    data_nascimento: { type: 'string' },
    naturalidade: { type: 'string' },
    nacionalidade: { type: 'string' },
    sexo: { type: 'string' },
    nome_mae: { type: 'string' },
    nome_pai: { type: 'string' },
    // Comprovante de residência
    cep: { type: 'string' },
    uf: { type: 'string' },
    cidade: { type: 'string' },
    bairro: { type: 'string' },
    logradouro: { type: 'string' },
    numero: { type: 'string' },
    complemento: { type: 'string' },
    // Confiança
    confianca_geral: { type: 'string', enum: ['alta', 'media', 'baixa', 'nao_identificado'] },
    campos_baixa_confianca: {
      type: 'array',
      items: { type: 'string' },
      description: 'Lista dos nomes dos campos cuja leitura teve baixa confiança e exigem conferência manual'
    },
    observacoes: { type: 'string' }
  },
  required: ['tipo_documento', 'confianca_geral', 'campos_baixa_confianca']
};

const PROMPT = `Você é um especialista em extração estruturada de dados de documentos brasileiros (OCR + IA). Analise o documento fornecido (imagem ou PDF) e extraia as informações visíveis com precisão.

REGRAS CRÍTICAS:
1. Identifique o TIPO do documento em minúsculas e sem acentos: "cnh" (Carteira Nacional de Habilitação, permissão para dirigir, documento de motorista), "rg" (Carteira de Identidade, Registro Geral, identidade, CIN, CIPP), "comprovante_residencia" (conta de água/luz/telefone/gás/internet, fatura, cartão de crédito, extracto bancário, contrato de aluguel, comprovante de moradia), ou "outro" (qualquer coisa que não se encaixe acima).
1a. Documentos impressos (PDF CNH-e — Carteira Nacional de Habilitação Digital) ou imagens de celular da CNH física devem ser classificados como "cnh".
1b. Mesmo se a imagem estiver parcialmente cortada/ilegível, mas você identificar que trata-se de um desses tipos, use o tipo correspondente (não "outro"). Use "outro" APENAS quando o documento não for nenhum dos três.
2. IDENTIDADE da pessoa (CNH e RG): extrair nome_completo, cpf, rg, rg_orgao_emissor, rg_uf, rg_data_emissao, data_nascimento, naturalidade, nacionalidade, sexo, nome_mae, nome_pai.
3. NÃO CONFUNDA o ÓRGÃO EMISSOR DO RG (que aparece inclusive dentro da CNH como dado do motorista, ex: SSP, SPTC, etc.) com o ÓRGÃO RESPONSÁVEL PELA EMISSÃO DA CNH (que é o DETRAN). O campo rg_orgao_emissor deve conter sempre o órgão do RG, nunca "DETRAN".
4. rg_data_emissao é a data de EXPEDIÇÃO do RG (não a validade da CNH). Formato ISO: YYYY-MM-DD.
5. data_nascimento no formato ISO YYYY-MM-DD.
6. sexo: "Masculino", "Feminino" ou "Outro" (somente se claramente identificável).
7. naturalidade = cidade/município de nascimento. nacionalidade = país (ex: Brasileira).
8. COMPROVANTE DE RESIDÊNCIA: extrair cep, uf, cidade, bairro, logradouro, numero, complemento. Aceita como comprovante qualquer conta de serviço (água, luz, gás, telefonia fixa/móvel, internet/TV), fatura de cartão de crédito, extrato bancário, contrato de aluguel, IPTU, conta condominial, ou correspondência/boleto com CEP e endereço visíveis. Use apenas o endereço DESTINATÁRIO/CONSUMIDOR (geralmente "instalado em" / "endereço de cobrança" / "endereço de entrega"). NÃO use o endereço da empresa emissora/concessionária. Importante: retornar sempre pelo menos o CEP e o logradouro, mesmo que UF/cidade estiverem ilegíveis.
9. Para cada campo, só retorne valor se estiver claramente visível. Se não estiver legível, retorne null (ausente).
10. Atribua confianca_geral: "alta" se todos os campos foram lidos com clareza; "media" se alguns campos difíceis; "baixa" se a imagem estiver ruim, ilegível, cortada, ou houver risco de erro.
11. Em campos_baixa_confianca, liste os nomes dos campos específicos cuja leitura você considerar incerta.
12. NÃO invente, deduza ou complete dados que não estejam claramente visíveis no documento.
13. Normalize o CPF para somente dígitos (sem pontos/traço), CEP para somente dígitos (sem hífen).
14. Retorne em "observacoes" qualquer nota relevante (ex: "documento cortado na borda direita", "texto ilegível na data de emissão").

Retorne APENAS o JSON estruturado conforme o schema.`;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const fileUrls: string[] = Array.isArray(body?.file_urls) ? body.file_urls : [];
    if (fileUrls.length === 0) {
      return Response.json({ error: 'file_urls é obrigatório' }, { status: 400 });
    }
    if (fileUrls.length > 10) {
      return Response.json({ error: 'Máximo de 10 arquivos por requisição' }, { status: 400 });
    }

    const documentos = await Promise.all(
      fileUrls.map(async (url: string) => {
        // Tenta extrair o nome do arquivo da URL para referência
        let arquivo_nome = '';
        let extensao = '';
        try {
          const u = new URL(url);
          const caminho = decodeURIComponent(u.pathname.split('/').pop() || '') || '';
          arquivo_nome = caminho;
          extensao = (caminho.split('.').pop() || '').toLowerCase();
        } catch {
          arquivo_nome = url.split('/').pop() || '';
          extensao = (arquivo_nome.split('.').pop() || '').toLowerCase();
        }
        const ehPdf = extensao === 'pdf' || /\.pdf(\?|$)/i.test(url) || /pdf/i.test(arquivo_nome);

        try {
          // PDFs não são suportados por InvokeLLM com file_urls (somente imagens).
          // Para PDFs extraímos via ExtractDataFromUploadedFile, que tem suporte nativo.
          let dados: any;
          if (ehPdf) {
            console.log('[lerDocumentosCliente] PDF detectado, usando ExtractDataFromUploadedFile:', arquivo_nome);
            const ext: any = await base44.integrations.Core.ExtractDataFromUploadedFile({
              file_url: url,
              json_schema: SCHEMA
            });
            if (!ext || ext.status !== 'success' || !ext.output) {
              const detalhes = ext?.details || 'extração sem saída';
              console.warn('[lerDocumentosCliente] ExtractDataFromUploadedFile falhou para', arquivo_nome, '→', detalhes);
              throw new Error(`Não foi possível extrair dados do PDF: ${detalhes}`);
            }
            // output é dict quando schema root é object
            dados = ext.output && typeof ext.output === 'object' && !Array.isArray(ext.output)
              ? ext.output
              : (Array.isArray(ext.output) && ext.output[0] ? ext.output[0] : {});

            // ExtractDataFromUploadedFile às vezes retorna o literal "null" como
            // string. Convertemos para null real para não confundir o frontend.
            for (const k of Object.keys(dados || {})) {
              const v = dados[k];
              if (typeof v === 'string' && v.trim().toLowerCase() === 'null') {
                dados[k] = null;
              }
            }
          } else {
            const res: any = await base44.integrations.Core.InvokeLLM({
              prompt: PROMPT,
              file_urls: [url],
              model: 'claude_sonnet_4_6',
              response_json_schema: SCHEMA
            });

            // InvokeLLM com response_json_schema deve retornar um dict. Se vier string
            // ou null, houve falha silenciosa — registramos como erro para o usuário
            // ver, em vez de tratar como "não reconhecido".
            if (!res || typeof res !== 'object' || Array.isArray(res)) {
              const texto = typeof res === 'string' ? res.slice(0, 200) : 'resposta vazia';
              console.warn('[lerDocumentosCliente] InvokeLLM não retornou JSON estruturado para', arquivo_nome || url, '→', texto);
              throw new Error('Leitura indisponível: a IA não conseguiu processar o arquivo. Tente novamente com uma imagem (JPG/PNG) nítida.');
            }
            dados = res;
          }

          // Sanitiza strings: converte "" ou "null" para null real para não confundir
          // o frontend que verifica campos preenchidos.
          for (const k of Object.keys(dados || {})) {
            const v = dados[k];
            if (typeof v === 'string') {
              const trim = v.trim();
              if (trim === '' || trim.toLowerCase() === 'null' || trim.toLowerCase() === 'none') {
                dados[k] = null;
              }
            }
          }

          // Normaliza tipo_documento (aceita variações do modelo)
          const tipoNormalizado = normalizarTipoDocumento(dados.tipo_documento);
          const ladoNormalizado = normalizarLado(dados.lado);

          // Sanitiza CPF e CEP (garante somente dígitos)
          if (typeof dados.cpf === 'string') dados.cpf = dados.cpf.replace(/\D/g, '') || null;
          if (typeof dados.cep === 'string') dados.cep = dados.cep.replace(/\D/g, '') || null;

          // Normaliza datas para ISO YYYY-MM-DD (inputs type="date" só aceitam esse formato)
          dados.data_nascimento = normalizarDataISO(dados.data_nascimento);
          dados.rg_data_emissao = normalizarDataISO(dados.rg_data_emissao);

          // Loga resposta bruta para diagnóstico (visível nos logs da função)
          try {
            console.log('[lerDocumentosCliente]', arquivo_nome || url, '→ tipo_bruto:', dados.tipo_documento, 'confianca:', dados.confianca_geral, 'campos:', Object.fromEntries(Object.entries(dados).filter(([k]) => !['tipo_documento', 'lado', 'confianca_geral', 'campos_baixa_confianca', 'observacoes'].includes(k))));
          } catch {}

          return {
            arquivo_url: url,
            arquivo_nome,
            tipo_documento: tipoNormalizado,
            lado: ladoNormalizado,
            campos: {
              nome_completo: dados.nome_completo ?? null,
              cpf: dados.cpf ?? null,
              rg: dados.rg ?? null,
              rg_orgao_emissor: dados.rg_orgao_emissor ?? null,
              rg_uf: dados.rg_uf ?? null,
              rg_data_emissao: dados.rg_data_emissao ?? null,
              data_nascimento: dados.data_nascimento ?? null,
              naturalidade: dados.naturalidade ?? null,
              nacionalidade: dados.nacionalidade ?? null,
              sexo: dados.sexo ?? null,
              nome_mae: dados.nome_mae ?? null,
              nome_pai: dados.nome_pai ?? null,
              cep: dados.cep ?? null,
              uf: dados.uf ?? null,
              cidade: dados.cidade ?? null,
              bairro: dados.bairro ?? null,
              logradouro: dados.logradouro ?? null,
              numero: dados.numero ?? null,
              complemento: dados.complemento ?? null
            },
            confianca_geral: dados.confianca_geral || 'nao_identificado',
            campos_baixa_confianca: Array.isArray(dados.campos_baixa_confianca) ? dados.campos_baixa_confianca : [],
            observacoes: dados.observacoes || null,
            erro: null
          };
        } catch (e: any) {
          return {
            arquivo_url: url,
            arquivo_nome,
            tipo_documento: 'outro',
            lado: 'nao_identificado',
            campos: {},
            confianca_geral: 'nao_identificado',
            campos_baixa_confianca: [],
            observacoes: null,
            erro: e?.message || 'Erro na leitura'
          };
        }
      })
    );

    return Response.json({ documentos });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}