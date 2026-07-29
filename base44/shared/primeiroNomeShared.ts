// Helpers compartilhados entre funções backend que enviam templates da Meta
// para resolver a variável {{1}} com o primeiro nome real de cada destinatário.
//
// Regras:
//  - Buscar nome completo no cadastro do cliente;
//  - Remover espaços extras e pegar a primeira palavra;
//  - Ajustar capitalização ("JOÃO PEDRO" → "João");
//  - Se não houver nome, usar o texto alternativo "por aí" (a Meta
//    recusa variáveis vazias — nunca enviamos null/undefined/telefone).

export const AUTO_PRIMEIRO_NOME = '__AUTO_PRIMEIRO_NOME__';
export const TEXTO_ALTERNATIVO_SEM_NOME = 'por aí';

export function capitalizarPrimeiroNome(nome: string): string {
  const s = (nome || '').toString().trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function extrairPrimeiroNome(nomeCompleto: string): string {
  const nome = (nomeCompleto || '').toString().trim();
  if (!nome) return '';
  const partes = nome.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  return capitalizarPrimeiroNome(partes[0]);
}

export function primeiroNomeDoCliente(cliente: any): string {
  if (!cliente) return '';
  if (cliente.primeiro_nome && String(cliente.primeiro_nome).trim()) {
    return capitalizarPrimeiroNome(String(cliente.primeiro_nome).trim());
  }
  if (cliente.nome_completo) {
    const extraido = extrairPrimeiroNome(String(cliente.nome_completo));
    if (extraido) return extraido;
  }
  if (cliente.pj_razao_social) {
    const extraido = extrairPrimeiroNome(String(cliente.pj_razao_social));
    if (extraido) return extraido;
  }
  // Fallback: nome denormalizado em conversa ("cliente_nome" pode conter telefone)
  if (cliente.cliente_nome && !/^\d+$/.test(String(cliente.cliente_nome).trim())) {
    const extraido = extrairPrimeiroNome(String(cliente.cliente_nome));
    if (extraido) return extraido;
  }
  return '';
}

export function primeiroNomeOuAlternativa(cliente: any): string {
  const nome = primeiroNomeDoCliente(cliente);
  return nome || TEXTO_ALTERNATIVO_SEM_NOME;
}

export function ehAutoPrimeiroNome(valor: any): boolean {
  return valor === AUTO_PRIMEIRO_NOME;
}

// Resolve o primeiro nome real do destinatário buscando primeiro pelo
// cliente_id informado (mais confiável); se ausente, tenta localizar um
// Cliente pelo telefone na empresa; por último, usa o nome denormalizado
// recebido. Retorna o nome resolvido e se utilizou o fallback "por aí".
export async function resolverPrimeiroNomeDestinatario(
  base44: any,
  empresaId: string | undefined,
  clienteId: string | undefined,
  telefone: string,
  clienteNomeDenormalizado?: string
): Promise<{ nome: string; usouFallback: boolean }> {
  // 1) Via cliente_id
  if (clienteId) {
    try {
      const cli = await base44.asServiceRole.entities.Cliente.get(clienteId);
      const nome = primeiroNomeDoCliente(cli);
      if (nome) return { nome, usouFallback: false };
    } catch (_) {}
  }

  // 2) Busca cliente pela conversa (telefone + empresa)
  if (telefone && empresaId) {
    try {
      const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
        { empresa_id: empresaId, cliente_telefone: telefone },
        '-data_ultima_mensagem',
        1,
      );
      const conv = conversas?.[0];
      if (conv?.cliente_id) {
        try {
          const cli = await base44.asServiceRole.entities.Cliente.get(conv.cliente_id);
          const nome = primeiroNomeDoCliente(cli);
          if (nome) return { nome, usouFallback: false };
        } catch (_) {}
      }
      if (conv?.cliente_nome && !/^\d+$/.test(String(conv.cliente_nome).trim())) {
        const extraido = extrairPrimeiroNome(String(conv.cliente_nome));
        if (extraido) return { nome: extraido, usouFallback: false };
      }
    } catch (_) {}
  }

  // 3) Nome denormalizado recebido (cliente_nome do destinatário já carregado)
  if (clienteNomeDenormalizado && !/^\d+$/.test(String(clienteNomeDenormalizado).trim())) {
    const extraido = extrairPrimeiroNome(String(clienteNomeDenormalizado));
    if (extraido) return { nome: extraido, usouFallback: false };
  }

  // 4) Sem nome → fallback
  return { nome: TEXTO_ALTERNATIVO_SEM_NOME, usouFallback: true };
}