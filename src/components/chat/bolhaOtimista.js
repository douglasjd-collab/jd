// Bolha otimista do Bate-Papo.
//
// Uma mensagem recém-enviada existe apenas no cache local (queryKey
// 'mensagens-whatsapp') até o banco devolver o registro real. Como a lista é
// recarregada a cada poucos segundos (polling + subscription de novas
// mensagens), a bolha precisa ser reconstruída a partir do store da fila em
// cada recarga — do contrário ela desaparece da tela no momento do envio e só
// reaparece (como enviada) quando o registro real chega.

import { getEnviosPorConversa, descartarConfirmados } from './filaEnvioStore';

const TIPOS_CONTEUDO = ['texto', 'sticker', 'imagem', 'audio', 'video', 'pdf', 'documento'];

/** Monta a bolha exibida no chat a partir de um item da fila de envio. */
export function construirBolhaOtimista(envio) {
  if (!envio || !envio.tempId) return null;
  const arquivo = envio.arquivo || null;
  const resposta = envio.mensagemParaResponder || null;
  return {
    id: envio.tempId,
    conversa_id: envio.conversaId,
    empresa_id: envio.empresaId,
    remetente: 'vendedor',
    usuario_id: null,
    usuario_nome: envio.usuarioNome,
    tipo_conteudo: TIPOS_CONTEUDO.includes(envio.tipo) ? envio.tipo : 'documento',
    texto: envio.texto || (arquivo ? arquivo.nome : ''),
    arquivo_nome: arquivo?.nome || null,
    arquivo_url: arquivo?.url || null,
    data_envio: new Date(envio.criadoEm || Date.now()).toISOString(),
    status: 'pendente',
    // Campos transitórios (somente client-side) — não existem no banco.
    fila_envio_estado: envio.estado || 'preparando',
    fila_envio_progresso: envio.progresso || 0,
    fila_envio_erro: envio.erro || null,
    resposta_para_texto: resposta?.texto || null,
    resposta_para_nome: resposta
      ? (resposta.remetente === 'vendedor'
          ? (resposta.usuario_nome || 'Você')
          : (envio.conversa?.cliente_nome || 'Cliente'))
      : null,
  };
}

/**
 * Bolhas que ainda não estão no banco e precisam seguir visíveis após uma
 * recarga da lista: envios em andamento, envios falhados (para permitir
 * reenviar/cancelar) e enviados cujo registro real ainda não voltou na consulta.
 */
export function bolhasPendentesNaLista(conversaId, mensagensServidor = []) {
  if (!conversaId) return [];
  const idsNoBanco = new Set(mensagensServidor.map((m) => m.id));
  const wamidsNoBanco = new Set(
    mensagensServidor.map((m) => m.whatsapp_message_id).filter(Boolean)
  );
  // Envio que já existe no banco (pelo id real ou pelo id do WhatsApp) está confirmado:
  // sai da fila e não é mais recriado como bolha. Sem isso, a mesma mensagem podia
  // aparecer duas vezes — a cópia local ao lado da já gravada.
  descartarConfirmados(conversaId, idsNoBanco, wamidsNoBanco);
  const bolhas = [];
  for (const envio of getEnviosPorConversa(conversaId)) {
    if (envio.estado === 'cancelado') continue;
    const bolha = construirBolhaOtimista(envio);
    if (bolha) bolhas.push(bolha);
  }
  return bolhas;
}