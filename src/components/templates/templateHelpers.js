// Helpers e constantes para o gerenciador de templates da API Oficial da Meta.

// Normaliza o nome do template (minúsculo, underline, sem acentos/espaços/caracteres especiais).
export function normalizeTemplateName(raw) {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export const VALID_NAME_RE = /^[a-z0-9_]+$/;

export const CATEGORIAS = [
  {
    value: 'UTILITY',
    label: 'Utilidade',
    desc: 'Mensagens relacionadas a uma solicitação, serviço, contrato, pagamento, boleto, vencimento, atendimento ou atualização já esperada pelo cliente.',
  },
  {
    value: 'MARKETING',
    label: 'Marketing',
    desc: 'Ofertas, promoções, campanhas, divulgação de produtos, recuperação de clientes e prospecção.',
  },
  {
    value: 'AUTHENTICATION',
    label: 'Autenticação',
    desc: 'Envio de códigos de confirmação ou autenticação. (Disponível em breve.)',
  },
];

export const IDIOMAS = [
  { value: 'pt_BR', label: 'Português – Brasil' },
  { value: 'pt_PT', label: 'Português – Portugal' },
  { value: 'en_US', label: 'Inglês (EUA)' },
  { value: 'es', label: 'Espanhol' },
];

export const TIPOS = [
  {
    value: 'TEXT',
    label: 'Somente texto',
    desc: 'Cabeçalho (opcional texto), corpo, rodapé e botões.',
    icon: 'Type',
    enabled: true,
  },
  {
    value: 'IMAGE',
    label: 'Texto + imagem',
    desc: 'Imagem no cabeçalho, corpo, rodapé e botões.',
    icon: 'Image',
    enabled: true,
  },
  {
    value: 'VIDEO',
    label: 'Texto + vídeo',
    desc: 'Vídeo no cabeçalho, corpo, rodapé e botões.',
    icon: 'Video',
    enabled: true,
  },
];

export const STATUS_META = {
  rascunho: { label: 'Rascunho', color: 'slate', desc: 'Template salvo, mas ainda não enviado.', class: 'bg-slate-100 text-slate-700 border-slate-200' },
  enviando: { label: 'Enviando...', color: 'amber', desc: 'Enviando para análise da Meta.', class: 'bg-amber-100 text-amber-700 border-amber-200' },
  em_analise: { label: 'Em análise', color: 'yellow', desc: 'Enviado, aguardando análise da Meta.', class: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  aprovado: { label: 'Aprovado', color: 'green', desc: 'Aprovado pela Meta e disponível para uso.', class: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejeitado: { label: 'Rejeitado', color: 'red', desc: 'Rejeitado pela Meta.', class: 'bg-red-100 text-red-700 border-red-200' },
  pausado: { label: 'Pausado', color: 'orange', desc: 'Uso temporariamente pausado.', class: 'bg-orange-100 text-orange-700 border-orange-200' },
  desativado: { label: 'Desativado', color: 'slate', desc: 'Template desativado.', class: 'bg-slate-200 text-slate-600 border-slate-300' },
  erro_envio: { label: 'Erro no envio', color: 'red', desc: 'Não foi possível enviar para análise.', class: 'bg-red-100 text-red-700 border-red-200' },
};

// Variáveis do CRM — agrupadas e com nomes amigáveis.
export const VARIAVEIS_CRM = [
  {
    group: 'CLIENTE',
    items: [
      { field: 'cliente.primeiro_nome', label: 'Primeiro nome' },
      { field: 'cliente.nome_completo', label: 'Nome completo' },
      { field: 'cliente.cpf', label: 'CPF' },
      { field: 'cliente.telefone', label: 'Telefone' },
    ],
  },
  {
    group: 'CONSÓRCIO',
    items: [
      { field: 'consorcio.administradora', label: 'Administradora' },
      { field: 'consorcio.grupo', label: 'Grupo' },
      { field: 'consorcio.cota', label: 'Cota' },
      { field: 'consorcio.contrato', label: 'Número do contrato' },
      { field: 'consorcio.valor_credito', label: 'Valor do crédito' },
      { field: 'consorcio.valor_parcela', label: 'Valor da parcela' },
      { field: 'consorcio.data_vencimento', label: 'Data de vencimento' },
      { field: 'consorcio.data_assembleia', label: 'Data da assembleia' },
    ],
  },
  {
    group: 'VENDEDOR',
    items: [
      { field: 'vendedor.nome', label: 'Nome do vendedor' },
      { field: 'vendedor.telefone', label: 'Telefone do vendedor' },
      { field: 'vendedor.empresa', label: 'Nome da empresa' },
    ],
  },
  {
    group: 'FINANCEIRO',
    items: [
      { field: 'financeiro.valor', label: 'Valor' },
      { field: 'financeiro.data', label: 'Data' },
      { field: 'financeiro.forma_pagamento', label: 'Forma de pagamento' },
      { field: 'financeiro.status', label: 'Status' },
    ],
  },
];

// Exemplos genéricos (não usar dados reais sensíveis).
export const EXAMPLE_DEFAULTS = {
  'cliente.primeiro_nome': 'João',
  'cliente.nome_completo': 'João da Silva',
  'cliente.cpf': '000.000.000-00',
  'cliente.telefone': '+55 87 99999-9999',
  'consorcio.administradora': 'Canopus',
  'consorcio.grupo': '15200',
  'consorcio.cota': '015',
  'consorcio.contrato': '000123456',
  'consorcio.valor_credito': 'R$ 100.000,00',
  'consorcio.valor_parcela': 'R$ 1.753,64',
  'consorcio.data_vencimento': '10/08/2026',
  'consorcio.data_assembleia': '15/09/2026',
  'vendedor.nome': 'Diego',
  'vendedor.telefone': '+55 87 98119-4149',
  'vendedor.empresa': 'JD Promotora',
  'financeiro.valor': 'R$ 1.753,64',
  'financeiro.data': '10/08/2026',
  'financeiro.forma_pagamento': 'PIX',
  'financeiro.status': 'Em aberto',
};

// Substitue {{1}}, {{2}}... pelos valores de exemplo no corpo da mensagem.
export function applyPreview(texto, examples) {
  if (!texto) return '';
  let result = texto;
  (examples || []).forEach((ex) => {
    const n = ex.position;
    if (n) {
      result = result.split(`{{${n}}}`).join(ex.example_value || '____');
    }
  });
  return result;
}

// Detecta o próximo número de variável disponível (sequencial {{1}}, {{2}}...).
export function nextVariablePosition(bodyText) {
  const matches = (bodyText || '').match(/\{\{(\d+)\}\}/g) || [];
  if (matches.length === 0) return 1;
  return Math.max(...matches.map((m) => parseInt(m.replace(/[{}]/g, ''), 10))) + 1;
}

// Localiza todas as variáveis presentes no body e retorna array de números.
export function extractVariablePositions(bodyText) {
  const matches = (bodyText || '').match(/\{\{(\d+)\}\}/g) || [];
  const nums = matches.map((m) => parseInt(m.replace(/[{}]/g, ''), 10));
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}