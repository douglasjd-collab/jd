// Hook que orquestra a fila de envio assíncrono do Bate-Papo.
//
// - Adiciona cada envio (texto ou mídia) na lista de mensagens imediatamente
//   com um tempId único e fila_envio_estado = 'preparando'. O atendente pode
//   continuar digitando e enviando outras mensagens na mesma conversa.
// - Processa cada item em background:
//     preparando → carregando (ler arquivo p/ base64, progresso real do FileReader)
//     → na_fila → enviando (invoke 'enviarMensagemWhatsapp') → enviada|falhou
// - Em sucesso, substitui o tempId pelo ID real retornado pelo backend, sem
//   recarregar a lista inteira (atualiza só aquele item no cache).
// - Falhas: estado 'falhou', com motivo, botões de tentar novamente / cancelar.
// - Idempotência: tempId único por item, nunca reusado. Não há isSending global.
//
// Não altera o backend (enviarMensagemWhatsapp já atende texto e mídia).

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import * as fila from './filaEnvioStore';

const QKEY_PREFIX = 'mensagens-whatsapp';

function qkey(conversaId) {
  return [QKEY_PREFIX, conversaId];
}

// Traduz MIME/Tipo para o tipo_conteudo exibido na bolha
function tipoConteudoDe(arquivo) {
  if (!arquivo) return 'texto';
  const tipo = arquivo.tipo || '';
  if (tipo === 'image/webp') return 'sticker';
  if (tipo.startsWith('image')) return 'imagem';
  if (tipo.startsWith('audio')) return 'audio';
  if (tipo.startsWith('video')) return 'video';
  if (tipo.includes('pdf')) return 'pdf';
  return 'documento';
}

// Adiciona/atualiza um item no cache de mensagens da conversa (sem recarregar)
function setMensagemCache(queryClient, conversaId, updater) {
  const key = qkey(conversaId);
  queryClient.setQueryData(key, (old = []) => updater(old));
}

function substituirTempIdPorReal(queryClient, conversaId, tempId, realId, extras) {
  const key = qkey(conversaId);
  queryClient.setQueryData(key, (old = []) => {
    if (!Array.isArray(old)) return old;
    const idx = old.findIndex((m) => m.id === tempId);
    if (idx < 0) return old;
    const patched = { ...old[idx], id: realId, fila_envio_estado: null, ...extras };
    const novo = [...old];
    novo[idx] = patched;
    return novo;
  });
}

function atualizarEnvioCache(queryClient, envio) {
  const key = qkey(envio.conversaId);
  queryClient.setQueryData(key, (old = []) => {
    if (!Array.isArray(old)) return old;
    const idx = old.findIndex((m) => m.id === envio.tempId);
    if (idx < 0) return old;
    const novo = [...old];
    novo[idx] = { ...novo[idx], fila_envio_estado: envio.estado, fila_envio_progresso: envio.progresso, fila_envio_erro: envio.erro };
    return novo;
  });
}

function removerEnvioCache(queryClient, conversaId, tempId) {
  const key = qkey(conversaId);
  queryClient.setQueryData(key, (old = []) => {
    if (!Array.isArray(old)) return old;
    return old.filter((m) => m.id !== tempId);
  });
}

// Leitura de arquivo com progresso real (FileReader.onprogress). Retorna
// { base64 } em sucesso e dispara onProgress(pct 0..1) durante a leitura.
function lerArquivoBase64ComProgresso(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (ev) => {
      if (ev.lengthComputable && ev.loaded && ev.total) {
        try { onProgress(Math.min(1, ev.loaded / ev.total)); } catch (_) {}
      }
    };
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',').pop() : result;
      resolve({ base64 });
    };
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo'));
    reader.onabort = () => reject(new Error('Leitura cancelada'));
    reader.readAsDataURL(file);
  });
}

// Limites de tamanho/formato por tipo (validação client-side antes do upload).
const MAX_TAMANHO_POR_TIPO = {
  imagem: 16 * 1024 * 1024,   // 16 MB
  audio: 30 * 1024 * 1024,    // 30 MB
  video: 100 * 1024 * 1024,   // 100 MB
  pdf: 100 * 1024 * 1024,
  documento: 100 * 1024 * 1024,
  sticker: 1 * 1024 * 1024,
  texto: Infinity,
};

function validarAntesDeEnviar(envio) {
  if (envio.tipo !== 'texto' && envio.arquivo) {
    const limite = MAX_TAMANHO_POR_TIPO[envio.tipo] || MAX_TAMANHO_POR_TIPO.documento;
    if (envio.arquivo.tamanho && envio.arquivo.tamanho > limite) {
      const mbMax = (limite / (1024 * 1024)).toFixed(0);
      throw new Error(`Arquivo excede o limite de ${mbMax} MB para este tipo (${envio.tipo}).`);
    }
  }
  if (!envio.texto?.trim() && !envio.arquivo) {
    throw new Error('Mensagem ou arquivo obrigatório');
  }
}

/**
 * Hook principal. Recebe o usuário e a conversa atual para resolver o destino.
 * Retorna { enqueue, cancelar, reenviar, getStatus }.
 *
 * enqueue() retorna imediatamente — o pipeline roda em background.
 */
export function useFilaEnvio() {
  const queryClient = useQueryClient();
  const pipelineRefs = useRef(new Map()); // tempId -> AbortController
  const inFlight = useRef(new Set());

  // Loop central: observa o store; sempre que um item passa para "preparando"
  // (novo ou reenvio), dispara o pipeline (uma vez por tempId).
  useEffect(() => {
    const unsubscribe = fila.subscribe((snapshot) => {
      for (const envio of snapshot) {
        if (envio.estado === 'preparando' && !inFlight.current.has(envio.tempId)) {
          // Cancelado enquanto esperava? pula.
          const fresco = fila.getEnvio(envio.tempId);
          if (!fresco || fresco.estado !== 'preparando') continue;
          inFlight.current.add(envio.tempId);
          // Dispara sem await — executa em segundo plano
          rodarPipeline(envio.tempId, queryClient, pipelineRefs).catch((err) => {
            console.error('[filaEnvio] erro pipeline', err);
            fila.setErro(envio.tempId, err?.message || 'Erro inesperado');
            atualizarEnvioCache(queryClient, fila.getEnvio(envio.tempId) || envio);
          }).finally(() => {
            inFlight.current.delete(envio.tempId);
          });
        }
        // Se um item foi cancelado, abortar pipeline em andamento
        if (envio.estado === 'cancelado') {
          const ctrl = pipelineRefs.current.get(envio.tempId);
          if (ctrl) {
            try { ctrl.abort(); } catch (_) {}
            pipelineRefs.current.delete(envio.tempId);
          }
          // Remoção visual da bolha cancelada (somente se ainda em "preparando..enviando")
          const fresco = fila.getEnvio(envio.tempId);
          if (fresco && (!fresco.realId)) {
            removerEnvioCache(queryClient, envio.conversaId, envio.tempId);
          }
        }
      }
    });
    return unsubscribe;
  }, [queryClient]);

  // Sincroniza estado do store -> cache (somente estados de progresso/erro)
  useEffect(() => {
    const unsubscribe = fila.subscribe((snapshot) => {
      for (const envio of snapshot) {
        if (['preparando', 'carregando', 'na_fila', 'enviando', 'falhou', 'enviada', 'entregue', 'lida'].includes(envio.estado)) {
          atualizarEnvioCache(queryClient, envio);
        }
      }
    });
    return unsubscribe;
  }, [queryClient]);

  const enqueue = useCallback((input) => {
    // input: { conversaId, texto, arquivo, mensagemParaResponder, usuarioNome, empresaId, numeroCliente, whatsappIdDestino, conversa }
    const tipo = input.arquivo ? tipoConteudoDe(input.arquivo) : 'texto';
    const envioInput = {
      conversaId: input.conversaId,
      tipo,
      texto: input.texto || '',
      arquivo: input.arquivo || null,
      mensagemParaResponder: input.mensagemParaResponder || null,
      usuarioNome: input.usuarioNome || '',
      empresaId: input.empresaId || null,
      numeroCliente: input.numeroCliente || null,
      whatsappIdDestino: input.whatsappIdDestino || null,
      conversa: input.conversa || null,
    };

    // Validação prévia antes de qualquer upload — falha aqui não cria bolha.
    try {
      validarAntesDeEnviar({ ...envioInput, estado: 'preparando' });
    } catch (e) {
      throw e;
    }

    const tempId = fila.enqueue(envioInput);

    // Adiciona imediatamente a bolha otimista no cache, marcada com o tempId.
    setMensagemCache(queryClient, envioInput.conversaId, (old) => {
      const tipoConteudo = envioInput.tipo === 'texto' ? 'texto' : (
        envioInput.tipo === 'sticker' ? 'sticker' :
        envioInput.tipo === 'imagem' ? 'imagem' :
        envioInput.tipo === 'audio' ? 'audio' :
        envioInput.tipo === 'video' ? 'video' :
        envioInput.tipo === 'pdf' ? 'pdf' : 'documento'
      );
      const textoExibicao = envioInput.texto || (envioInput.arquivo ? envioInput.arquivo.nome : '');
      const novoItem = {
        id: tempId,
        conversa_id: envioInput.conversaId,
        empresa_id: envioInput.empresaId,
        remetente: 'vendedor',
        usuario_id: null,
        usuario_nome: envioInput.usuarioNome,
        tipo_conteudo: tipoConteudo,
        texto: textoExibicao,
        arquivo_nome: envioInput.arquivo?.nome || null,
        arquivo_url: envioInput.arquivo?.url || null,
        data_envio: new Date().toISOString(),
        status: 'pendente',
        // campos transitórios (somente client-side) — não são salvos no banco
        fila_envio_estado: 'preparando',
        fila_envio_progresso: 0,
        fila_envio_erro: null,
        resposta_para_texto: envioInput.mensagemParaResponder?.texto || null,
        resposta_para_nome: envioInput.mensagemParaResponder
          ? (envioInput.mensagemParaResponder.remetente === 'vendedor'
              ? (envioInput.mensagemParaResponder.usuario_nome || 'Você')
              : (envioInput.conversa?.cliente_nome || 'Cliente'))
          : null,
      };
      return [...old, novoItem];
    });

    return tempId;
  }, [queryClient]);

  const cancelar = useCallback((tempId) => {
    fila.cancelar(tempId);
  }, []);

  const reenviar = useCallback((tempId) => {
    fila.reenviar(tempId);
    // garantir que a bolha esteja visível novamente com estado preparando
    const envio = fila.getEnvio(tempId);
    if (envio) {
      // se o cache não tem mais a bolha (foi removida por cancelamento),
      // re-cria o item otimista a partir dos metadados do store
      setMensagemCache(queryClient, envio.conversaId, (old) => {
        if (!Array.isArray(old)) return old;
        const existe = old.findIndex((m) => m.id === tempId);
        if (existe >= 0) {
          const copia = [...old];
          copia[existe] = { ...copia[existe], fila_envio_estado: 'preparando', fila_envio_progresso: 0, fila_envio_erro: null };
          return copia;
        }
        // Recria bolha se foi removida
        const tipoConteudo = envio.tipo === 'texto' ? 'texto' : envio.tipo;
        const novoItem = {
          id: tempId,
          conversa_id: envio.conversaId,
          empresa_id: envio.empresaId,
          remetente: 'vendedor',
          usuario_nome: envio.usuarioNome,
          tipo_conteudo: tipoConteudo,
          texto: envio.texto || (envio.arquivo?.nome || ''),
          arquivo_nome: envio.arquivo?.nome || null,
          data_envio: new Date().toISOString(),
          status: 'pendente',
          fila_envio_estado: 'preparando',
          fila_envio_progresso: 0,
          resposta_para_texto: envio.mensagemParaResponder?.texto || null,
        };
        return [...old, novoItem];
      });
    }
  }, [queryClient]);

  const getStatus = useCallback((tempId) => fila.getEnvio(tempId), []);

  return { enqueue, cancelar, reenviar, getStatus };
}

// Pipeline de envio. Executa fora do React (useRef-safe), mas toca no cache
// via queryClient. Roda 1 vez por tempId, controlado pelo hook.
async function rodarPipeline(tempId, queryClient, pipelineRefs) {
  const envio0 = fila.getEnvio(tempId);
  if (!envio0) return;

  // Abort controller — permite cancelar upload mid-flight
  const ctrl = new AbortController();
  pipelineRefs.current.set(tempId, ctrl);

  try {
    // Stage 1: preparando → carregando (se houver arquivo) com progresso real
    if (envio0.arquivo && envio0.arquivo.file && !envio0.arquivo.base64) {
      // arquivo ainda em File — precisa ler como base64
      fila.setProgresso(tempId, 5, 'carregando');
    } else if (envio0.arquivo?.base64) {
      // já base64 (preview de áudio ou template feito pelo form)
      fila.patch(tempId, { arquivo: { ...envio0.arquivo }, estado: 'na_fila', progresso: 75 });
    } else {
      // texto puro
      fila.setProgresso(tempId, 70, 'enviando');
    }

    let arquivoPayload = envio0.arquivo || null;

    // Se arquivo veio como File, ler base64 agora (com progresso real)
    if (envio0.arquivo && envio0.arquivo.file && !envio0.arquivo.base64) {
      const { base64 } = await lerArquivoBase64ComProgresso(envio0.arquivo.file, (pct) => {
        // 0..70% — fase de leitura do arquivo
        const progressoFinal = Math.round(5 + pct * 65); // 5%..70%
        fila.setProgresso(tempId, progressoFinal);
      });
      arquivoPayload = {
        base64,
        nome: envio0.arquivo.nome,
        tipo: envio0.arquivo.tipo,
        tamanho: envio0.arquivo.tamanho || envio0.arquivo.file.size || 0,
      };
      fila.setProgresso(tempId, 75, 'na_fila');
    }

    // Stage 2: na_fila → enviando (chamada ao backend)
    if (ctrl.signal.aborted) throw new Error('Envio cancelado');

    fila.setProgresso(tempId, 85, 'enviando');

    // Resolver destinatário igual ao BatePapo usa (grupos via whatsapp_id)
    const conv = envio0.conversa || null;
    const isGrupo = conv?.whatsapp_id?.includes('@g.us');
    const destinatario = isGrupo ? conv.whatsapp_id : envio0.numeroCliente;

    const payload = {
      conversa_id: envio0.conversaId,
      mensagem_texto: envio0.texto,
      numero_cliente: destinatario,
      empresa_id: envio0.empresaId,
      arquivo: arquivoPayload,
      resposta_para_texto: envio0.mensagemParaResponder?.texto || null,
      resposta_para_nome: envio0.mensagemParaResponder
        ? (envio0.mensagemParaResponder.remetente === 'vendedor'
            ? (envio0.mensagemParaResponder.usuario_nome || 'Você')
            : (conv?.cliente_nome || 'Cliente'))
        : null,
      resposta_para_message_id: envio0.mensagemParaResponder?.whatsapp_message_id || null,
    };

    let resp;
    try {
      resp = await base44.functions.invoke('enviarMensagemWhatsapp', payload);
    } catch (err) {
      // Erro de rede — falhou, mas sem "isSuccess=false"
      fila.setErro(tempId, err?.message || 'Falha de comunicação com o servidor');
      atualizarEnvioCache(queryClient, fila.getEnvio(tempId) || envio0);
      return;
    }

    if (!resp?.data?.success) {
      const msg = resp?.data?.error || 'Ocorreu um erro ao enviar a mensagem';
      fila.setErro(tempId, msg);
      atualizarEnvioCache(queryClient, fila.getEnvio(tempId) || envio0);
      return;
    }

    const realId = resp.data.message_id || resp.data.whatsapp_id || null;
    const whatsappId = resp.data.whatsapp_id || null;

    // Stage 3: enviada — substitui o tempId pelo ID real no cache
    fila.setEnviada(tempId, realId, whatsappId, 'enviada');

    // Substitui o tempId pelo realId na cache da conversa
    substituirTempIdPorReal(queryClient, envio0.conversaId, tempId, realId, {
      whatsapp_message_id: whatsappId,
      status: 'enviada',
      provider: resp.data.provider || null,
    });

    // Atualiza a "última mensagem" da conversa no cache (mesmo efeito do
    // enviarMensagemMutation.onSuccess — não recarrega a lista inteira).
    const chatKey = ['conversas-whatsapp', envio0.empresaId];
    queryClient.setQueryData(chatKey, (old = []) => {
      if (!Array.isArray(old)) return old;
      const msgExibicao = envio0.texto || (envio0.arquivo?.nome || '');
      return old.map((c) => c.id === envio0.conversaId
        ? { ...c, ultimo_remetente: 'vendedor', ultima_mensagem: msgExibicao, data_ultima_mensagem: new Date().toISOString() }
        : c);
    });
  } catch (err) {
    if (err?.message === 'Envio cancelado' || ctrl.signal.aborted) {
      fila.cancelar(tempId); // garante estado
      removerEnvioCache(queryClient, envio0.conversaId, tempId);
      return;
    }
    fila.setErro(tempId, err?.message || 'Falha no envio');
    atualizarEnvioCache(queryClient, fila.getEnvio(tempId) || envio0);
  } finally {
    pipelineRefs.current.delete(tempId);
  }
}