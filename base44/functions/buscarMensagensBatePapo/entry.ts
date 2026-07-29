import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const MAX_FETCH = 2000;
const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Não autenticado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const {
      conversa_id,
      modo = 'busca_texto',
      q = '',
      categoria = 'todas',
      remetente = 'todas',
      data_inicio,
      data_fim,
      page = 1,
      limit = 30,
      ordem = 'recente',
      mensagem_id,
      contexto_antes = 30,
      contexto_depois = 30,
    } = body;

    if (!conversa_id) {
      return Response.json({ success: false, error: 'conversa_id obrigatório' }, { status: 400 });
    }

    // Respeita RLS ao buscar a conversa com o token do próprio usuário.
    // Se não tiver permissão, retorna 404 — não expõe nada de outras empresas.
    let conversa = null;
    try { conversa = await base44.entities.ConversaWhatsapp.get(conversa_id); } catch (_) {}
    if (!conversa) {
      return Response.json({ success: false, error: 'Conversa não encontrada ou sem permissão' }, { status: 404 });
    }

    // ─── MODO LOCALIZAR ─── carrega mensagem alvo + janela ao redor ───
    if (modo === 'localizar' && mensagem_id) {
      let mensagem = null;
      try { mensagem = await base44.entities.MensagemWhatsapp.get(mensagem_id); } catch (_) {}
      if (!mensagem) return Response.json({ success: false, error: 'Mensagem não encontrada' }, { status: 404 });

      const dataAlvo = new Date(mensagem.data_envio || mensagem.created_date).toISOString();
      let anteriores = [];
      let posteriores = [];
      try {
        anteriores = await base44.entities.MensagemWhatsapp.filter(
          { conversa_id, data_envio: { $lt: dataAlvo } },
          '-data_envio',
          Number(contexto_antes) || 30
        );
      } catch (_) {}
      try {
        posteriores = await base44.entities.MensagemWhatsapp.filter(
          { conversa_id, data_envio: { $gte: dataAlvo } },
          'data_envio',
          (Number(contexto_depois) || 30) + 1
        );
      } catch (_) {}

      const anterioresAsc = [...anteriores].reverse();
      const posterioresSemAlvo = posteriores.filter(m => m.id !== mensagem.id);
      const contexto = [...anterioresAsc, mensagem, ...posterioresSemAlvo];
      contexto.sort((a, b) => {
        return new Date(a.data_envio || a.created_date).getTime() - new Date(b.data_envio || b.created_date).getTime();
      });

      return Response.json({
        success: true,
        modo: 'localizar',
        mensagem_alvo_id: mensagem.id,
        total: contexto.length,
        resultados: contexto,
      });
    }

    // ─── BUSCA / GALERIA ─── filtros server-side e JS-side com paginação
    const filter: any = { conversa_id };
    if (remetente === 'enviada') filter.remetente = 'vendedor';
    if (remetente === 'recebida') filter.remetente = 'cliente';

    const categoriasAtivas = Array.isArray(categoria) ? categoria : [categoria];

    // Em modo galeria, restringe o tipo de conteúdo já no banco para evitar
    // carregar milhares de mensagens de texto desnecessariamente.
    if (modo === 'galeria') {
      const tipos: string[] = [];
      for (const cat of categoriasAtivas) {
        if (cat === 'midias') tipos.push('imagem', 'video');
        else if (cat === 'documentos') tipos.push('pdf', 'documento');
        else if (cat === 'audios') tipos.push('audio');
        else if (cat === 'imagem') tipos.push('imagem');
        else if (cat === 'video') tipos.push('video');
      }
      const unicos = Array.from(new Set(tipos));
      if (unicos.length === 1) filter.tipo_conteudo = unicos[0];
      else if (unicos.length > 1) filter.tipo_conteudo = { $in: unicos };
    }

    let msgs: any[] = [];
    try {
      msgs = await base44.entities.MensagemWhatsapp.filter(filter, '-data_envio', MAX_FETCH);
    } catch (e) {
      return Response.json({ success: false, error: 'Erro ao buscar mensagens: ' + e.message }, { status: 500 });
    }

    // Filtro de data (JS-side)
    let resultados = msgs;
    if (data_inicio) {
      const t = new Date(data_inicio).getTime();
      resultados = resultados.filter(m => new Date(m.data_envio || m.created_date).getTime() >= t);
    }
    if (data_fim) {
      const t = new Date(data_fim).getTime();
      resultados = resultados.filter(m => new Date(m.data_envio || m.created_date).getTime() <= t);
    }

    // Filtro por categoria (midias/documentos/audios/links/texto)
    const incluiTodas = categoriasAtivas.includes('todas');
    if (!incluiTodas || modo === 'galeria') {
      resultados = resultados.filter(m => {
        const tipo = m.tipo_conteudo;
        const url = m.arquivo_url;
        const texto = m.texto || '';
        for (const cat of categoriasAtivas) {
          if (cat === 'midias' && url && ['imagem', 'video'].includes(tipo)) return true;
          if (cat === 'imagem' && url && tipo === 'imagem') return true;
          if (cat === 'video' && url && tipo === 'video') return true;
          if (cat === 'documentos' && url && ['pdf', 'documento'].includes(tipo)) return true;
          if (cat === 'audios' && url && tipo === 'audio') return true;
          if (cat === 'links' && texto && URL_REGEX.test(texto)) return true;
          if (cat === 'texto' && tipo === 'texto') return true;
          if (cat === 'todas') return true;
        }
        return false;
      });
    }

    // Busca por texto (filtragem por q) — busca em texto da mensagem E no nome do arquivo
    const searchQ = String(q || '').trim().toLowerCase();
    if (searchQ) {
      resultados = resultados.filter(m => {
        return (m.texto || '').toLowerCase().includes(searchQ) ||
               (m.arquivo_nome || '').toLowerCase().includes(searchQ);
      });
    }

    // Ordenação
    const sortDir = ordem === 'antigo' ? 1 : -1;
    resultados = resultados.slice().sort((a, b) => {
      const ta = new Date(a.data_envio || a.created_date).getTime();
      const tb = new Date(b.data_envio || b.created_date).getTime();
      return (ta - tb) * sortDir;
    });

    // Paginação
    const total = resultados.length;
    const pagina = Number(page) || 1;
    const lim = Number(limit) || 30;
    const start = (pagina - 1) * lim;
    const pageResults = resultados.slice(start, start + lim);

    return Response.json({
      success: true,
      modo,
      categoria: categoriasAtivas,
      total,
      page: pagina,
      limit: lim,
      resultados: pageResults,
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}