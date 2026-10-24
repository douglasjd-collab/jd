import { base44 } from '@/api/base44Client';

// Busca de propostas de empréstimo para importação de comissão.
// Carrega as propostas UMA vez e casa contrato/ADE/CPF em memória — antes eram
// feitas até 5 consultas por linha, o que estourava o limite de requisições da API.

const norm = (valor) => String(valor ?? '').trim();

const indexar = (propostas) => {
  const porContrato = new Map();
  const porAde = new Map();
  const porCpf = new Map();

  const adicionar = (mapa, chave, proposta) => {
    const k = norm(chave);
    if (!k) return;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(proposta);
  };

  propostas.forEach((p) => {
    adicionar(porContrato, p.contrato, p);
    adicionar(porAde, p.emprestimo_numero_ade, p);
    adicionar(porCpf, p.cliente_cpf, p);
  });

  return { porContrato, porAde, porCpf };
};

const buscarNoIndice = (indice, contrato, cpf) => {
  if (contrato) {
    return indice.porContrato.get(contrato) || indice.porAde.get(contrato) || [];
  }
  if (cpf) return indice.porCpf.get(cpf) || [];
  return [];
};

export function criarBuscadorPropostas({ empresaId } = {}) {
  let indiceEmpresa = null;
  let indiceGlobal = null;

  const carregar = async (comEmpresa) => {
    const filtro = { produto: 'emprestimo' };
    if (comEmpresa && empresaId) filtro.empresa_id = empresaId;
    const lista = await base44.entities.Proposta.filter(filtro, null, 5000);
    return indexar(lista);
  };

  // Retorna { proposta, motivo } seguindo a mesma ordem de busca de antes:
  // contrato → ADE na empresa; depois contrato → ADE em qualquer empresa.
  const encontrar = async (item) => {
    const contrato = norm(item.contrato || item.numero_ade);
    const cpf = norm(item.cpf);

    if (!contrato && !cpf) {
      return { proposta: null, motivo: 'Dados insuficientes (sem contrato nem CPF)' };
    }

    if (!indiceEmpresa) indiceEmpresa = await carregar(true);
    let encontradas = buscarNoIndice(indiceEmpresa, contrato, cpf);

    if (!encontradas.length) {
      if (!indiceGlobal) indiceGlobal = await carregar(false);
      encontradas = buscarNoIndice(indiceGlobal, contrato, cpf);
    }

    if (encontradas.length === 1) return { proposta: encontradas[0], motivo: '' };
    if (encontradas.length > 1) {
      return {
        proposta: null,
        motivo: contrato ? 'Múltiplas propostas encontradas' : 'Múltiplas propostas encontradas para este CPF',
      };
    }
    return {
      proposta: null,
      motivo: contrato ? `Proposta não encontrada (contrato/ADE: ${contrato})` : 'Proposta não encontrada pelo CPF',
    };
  };

  // Verifica em lote (uma consulta por 200 hashes) quais recebimentos já existem
  const buscarHashesExistentes = async (hashes) => {
    const unicos = [...new Set(hashes.filter(Boolean))];
    const existentes = new Set();

    for (let i = 0; i < unicos.length; i += 200) {
      const lote = unicos.slice(i, i + 200);
      const resposta = await base44.entities.RecebimentoComissao.filter(
        { hash_duplicidade: { $in: lote } },
        { limit: 500 }
      );
      const lista = Array.isArray(resposta) ? resposta : (resposta?.items || []);
      lista.forEach((r) => existentes.add(r.hash_duplicidade));
    }

    return existentes;
  };

  return { encontrar, buscarHashesExistentes };
}