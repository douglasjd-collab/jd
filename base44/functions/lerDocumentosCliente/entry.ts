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

const SCHEMA = {
  type: 'object',
  properties: {
    tipo_documento: { type: 'string', enum: ['cnh', 'rg', 'comprovante_residencia', 'outro'] },
    lado: { type: 'string', enum: ['frente', 'verso', 'completo', 'nao_identificado'] },
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
1. Identifique o TIPO do documento: "cnh" (Carteira Nacional de Habilitação), "rg" (Carteira de Identidade), "comprovante_residencia" (conta de água/luz/telefone/gás, cartão, contrato, etc.), ou "outro".
2. IDENTIDADE da pessoa (CNH e RG): extrair nome_completo, cpf, rg, rg_orgao_emissor, rg_uf, rg_data_emissao, data_nascimento, naturalidade, nacionalidade, sexo, nome_mae, nome_pai.
3. NÃO CONFUNDA o ÓRGÃO EMISSOR DO RG (que aparece inclusive dentro da CNH como dado do motorista, ex: SSP, SPTC, etc.) com o ÓRGÃO RESPONSÁVEL PELA EMISSÃO DA CNH (que é o DETRAN). O campo rg_orgao_emissor deve conter sempre o órgão do RG, nunca "DETRAN".
4. rg_data_emissao é a data de EXPEDIÇÃO do RG (não a validade da CNH). Formato ISO: YYYY-MM-DD.
5. data_nascimento no formato ISO YYYY-MM-DD.
6. sexo: "Masculino", "Feminino" ou "Outro" (somente se claramente identificável).
7. naturalidade = cidade/município de nascimento. nacionalidade = país (ex: Brasileira).
8. COMPROVANTE DE RESIDÊNCIA: extrair cep, uf, cidade, bairro, logradouro, numero, complemento. Use apenas o endereço que aparece como destino/local de instalação no documento (geralmente o "instalado em" / "endereço de consumo"). NÃO use endereço da concessionária.
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
        try {
          const u = new URL(url);
          arquivo_nome = decodeURIComponent(u.pathname.split('/').pop() || '') || '';
        } catch {
          arquivo_nome = url.split('/').pop() || '';
        }

        try {
          const res: any = await base44.integrations.Core.InvokeLLM({
            prompt: PROMPT,
            file_urls: [url],
            model: 'claude_sonnet_4_6',
            response_json_schema: SCHEMA
          });

          // InvokeLLM com response_json_schema retorna um dict (objeto)
          const dados = res && typeof res === 'object' ? res : {};

          // Sanitiza CPF e CEP (garante somente dígitos)
          if (typeof dados.cpf === 'string') dados.cpf = dados.cpf.replace(/\D/g, '') || null;
          if (typeof dados.cep === 'string') dados.cep = dados.cep.replace(/\D/g, '') || null;
          if (typeof dados.rg === 'string' && dados.rg.trim() === '') dados.rg = null;

          return {
            arquivo_url: url,
            arquivo_nome,
            tipo_documento: dados.tipo_documento || 'outro',
            lado: dados.lado || 'nao_identificado',
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