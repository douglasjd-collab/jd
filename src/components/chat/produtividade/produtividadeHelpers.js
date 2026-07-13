import { startOfDay, endOfDay, subDays } from 'date-fns';

// Calcula o intervalo de datas (início/fim) a partir da opção de período selecionada.
export function getPeriodoRange(periodo, dataInicioCustom, dataFimCustom) {
  const hoje = new Date();
  if (periodo === 'ontem') {
    const ontem = subDays(hoje, 1);
    return { inicio: startOfDay(ontem), fim: endOfDay(ontem) };
  }
  if (periodo === '7dias') return { inicio: startOfDay(subDays(hoje, 6)), fim: endOfDay(hoje) };
  if (periodo === '30dias') return { inicio: startOfDay(subDays(hoje, 29)), fim: endOfDay(hoje) };
  if (periodo === 'personalizado' && dataInicioCustom && dataFimCustom) {
    return { inicio: startOfDay(new Date(dataInicioCustom)), fim: endOfDay(new Date(dataFimCustom)) };
  }
  return { inicio: startOfDay(hoje), fim: endOfDay(hoje) };
}

export const CANAL_LABELS = { todos: 'Todos', dapi: 'D-API', meta_oficial: 'Meta Oficial', instagram: 'Instagram', outros: 'Outros' };

export function getCanalConversa(c) {
  if (c.tipo_conexao === 'instagram' || c.provider === 'instagram') return 'instagram';
  if (c.provider === 'whatsapp_meta' || c.tipo_conexao === 'meta_oficial') return 'meta_oficial';
  if (c.provider === 'dapi' || c.tipo_conexao === 'dapi' || c.tipo_conexao === 'usuario' || c.tipo_conexao === 'empresa') return 'dapi';
  return 'outros';
}

// Regras de contagem: separa iniciadas por vendedor/cliente, quem respondeu, quem não respondeu,
// tempo médio de primeira resposta, e o estado atual (aguardando vendedor, sem responsável, etc).
export function calcularMetricas({ conversas, mensagens, inicio, fim, canalFiltro, vendedorFiltro }) {
  const conversasMap = {};
  conversas.forEach(c => { conversasMap[c.id] = c; });

  const passaFiltro = (c) => {
    if (!c) return false;
    if (canalFiltro !== 'todos' && getCanalConversa(c) !== canalFiltro) return false;
    if (vendedorFiltro !== 'all' && c.responsavel_id !== vendedorFiltro) return false;
    return true;
  };

  const conversasFiltradas = conversas.filter(passaFiltro);

  const msgsPeriodo = mensagens.filter(m => {
    if (!m.data_envio) return false;
    const d = new Date(m.data_envio);
    if (d < inicio || d > fim) return false;
    return passaFiltro(conversasMap[m.conversa_id]);
  }).sort((a, b) => new Date(a.data_envio) - new Date(b.data_envio));

  const porConversa = {};
  msgsPeriodo.forEach(m => {
    if (!m.conversa_id) return;
    if (!porConversa[m.conversa_id]) porConversa[m.conversa_id] = [];
    porConversa[m.conversa_id].push(m);
  });

  const iniciadasVendedor = new Set();
  const iniciadasCliente = new Set();
  const responderamSet = new Set();
  const semRespostaSet = new Set();
  const temposPrimeiraResposta = [];

  Object.entries(porConversa).forEach(([convId, msgs]) => {
    const primeira = msgs[0];
    if (primeira.remetente === 'vendedor') iniciadasVendedor.add(convId);
    else if (primeira.remetente === 'cliente') iniciadasCliente.add(convId);

    let ultimoVendedorMsg = null;
    for (const m of msgs) {
      if (m.remetente === 'vendedor') {
        ultimoVendedorMsg = m;
      } else if (m.remetente === 'cliente' && ultimoVendedorMsg) {
        responderamSet.add(convId);
        const diffMin = (new Date(m.data_envio) - new Date(ultimoVendedorMsg.data_envio)) / 60000;
        if (diffMin >= 0) temposPrimeiraResposta.push(diffMin);
        ultimoVendedorMsg = null;
      }
    }
    // Não contar como "sem resposta" se a conversa já foi finalizada — regra de não misturar
    // cliente sem resposta com conversa finalizada.
    if (ultimoVendedorMsg && conversasMap[convId]?.status !== 'encerrada') semRespostaSet.add(convId);
  });

  const iniciadas = new Set([...iniciadasVendedor, ...iniciadasCliente]);

  const taxaResposta = iniciadasVendedor.size > 0
    ? Math.round((responderamSet.size / iniciadasVendedor.size) * 100)
    : 0;

  const tempoMedioResposta = temposPrimeiraResposta.length > 0
    ? Math.round(temposPrimeiraResposta.reduce((a, b) => a + b, 0) / temposPrimeiraResposta.length)
    : null;

  // Estado atual (independe do período selecionado)
  const agora = new Date();
  const aguardandoVendedor = conversasFiltradas
    .filter(c => c.status === 'ativa' && c.ultimo_remetente === 'cliente')
    .map(c => ({ ...c, tempoEsperaMin: c.data_ultima_mensagem ? Math.round((agora - new Date(c.data_ultima_mensagem)) / 60000) : null }));

  const naoFinalizadas = conversasFiltradas.filter(c => c.status !== 'encerrada');
  const semResponsavel = conversasFiltradas.filter(c => c.status === 'ativa' && !c.responsavel_id);
  const emAtendimento = conversasFiltradas.filter(c => c.status === 'ativa' && !!c.responsavel_id);
  const finalizadas = conversasFiltradas.filter(c =>
    c.status === 'encerrada' && c.data_ultima_mensagem &&
    new Date(c.data_ultima_mensagem) >= inicio && new Date(c.data_ultima_mensagem) <= fim
  );
  const deramVacuo = aguardandoVendedor.filter(c => (c.tempoEsperaMin || 0) > 120);
  const maiorTempoEspera = aguardandoVendedor.reduce((max, c) => Math.max(max, c.tempoEsperaMin || 0), 0);

  return {
    conversasMap, conversasFiltradas,
    iniciadas, iniciadasVendedor, iniciadasCliente,
    responderamSet, semRespostaSet,
    taxaResposta, tempoMedioResposta,
    aguardandoVendedor, naoFinalizadas, semResponsavel, emAtendimento, finalizadas, deramVacuo,
    maiorTempoEspera,
  };
}

export function conversaParaItem(c) {
  return {
    id: c.id,
    cliente: c.cliente_nome || c.cliente_telefone,
    telefone: c.cliente_telefone,
    canal: CANAL_LABELS[getCanalConversa(c)] || 'Outros',
    vendedor: c.responsavel_nome || '—',
    ultimaMensagem: c.ultima_mensagem || '',
    dataHora: c.data_ultima_mensagem,
    tempoSemResposta: c.tempoEsperaMin != null ? `${c.tempoEsperaMin} min` : '—',
    status: c.status,
  };
}