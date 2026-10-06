import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const normalizar = (v = '') => String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const digitos = (v = '') => String(v).replace(/\D/g, '');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { empresa_id, q = '', limit = 100 } = await req.json();
    const termo = normalizar(q).trim();
    const numero = digitos(q);
    if (!empresa_id || termo.length < 2) return Response.json({ conversas: [] });

    // Busca global executada apenas quando o usuário pesquisa, nunca no polling normal.
    const [conversas, contatos] = await Promise.all([
      base44.asServiceRole.entities.ConversaWhatsapp.filter({ empresa_id }, '-data_ultima_mensagem', 10000),
      base44.asServiceRole.entities.ContatoWhatsapp.filter({ empresa_id }, '-updated_date', 10000),
    ]);

    const contatosPorTelefone = new Map();
    const telefonesEncontrados = new Set();
    for (const contato of contatos || []) {
      const tel = digitos(contato.telefone);
      if (tel) contatosPorTelefone.set(tel, contato);
      const nome = normalizar(contato.nome || '');
      if ((termo && nome.includes(termo)) || (numero && tel.includes(numero))) telefonesEncontrados.add(tel);
    }

    const resultados = [];
    for (const conversa of conversas || []) {
      const tel = digitos(conversa.cliente_telefone);
      const contato = contatosPorTelefone.get(tel) || null;
      const corresponde =
        normalizar(conversa.cliente_nome || '').includes(termo) ||
        normalizar(conversa.whatsapp_id || '').includes(termo) ||
        (numero && tel.includes(numero)) ||
        telefonesEncontrados.has(tel);
      if (!corresponde) continue;
      resultados.push({
        ...conversa,
        contato: contato ? {
          id: contato.id,
          nome: contato.nome,
          telefone: contato.telefone,
          foto_url: contato.foto_url,
          tags_ids: contato.tags_ids || [],
        } : null,
      });
      if (resultados.length >= Math.min(Number(limit) || 100, 300)) break;
    }

    return Response.json({ conversas: resultados });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});