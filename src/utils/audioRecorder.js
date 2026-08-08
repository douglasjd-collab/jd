// Gravador de áudio via AudioWorklet (thread de áudio dedicada).
//
// Substitui o ScriptProcessorNode (deprecated) usado antes na captura do
// microfone. O ScriptProcessor roda na thread principal: quando o React
// re-renderiza ou a UI trava, os callbacks de áudio atrasam, frames são
// perdidos e o áudio sai com cliques, ruído e distorção. O AudioWorklet
// processa as amostras numa thread própria de áudio, imune a travamentos
// da UI — gravação limpa mesmo com o chat pesado aberto.
//
// Exporta iniciarGravador() -> { parar(), cancelar() }.
//   parar()    -> Promise<{ samples: Float32Array, sampleRate: number }>
//   cancelar() -> void (libera tudo sem devolver amostras)

let workletUrlCache = null;
function getWorkletUrl() {
  if (workletUrlCache) return workletUrlCache;
  const code = `
class GravadorProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    const ch0 = input && input[0];
    if (ch0 && ch0.length) {
      // Copia o buffer (ele é reutilizado internamente) e transfere a
      // propriedade para a thread principal sem cópia extra.
      const copy = new Float32Array(ch0.length);
      copy.set(ch0);
      this.port.postMessage({ type: 'chunk', samples: copy }, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor('gravador-audio', GravadorProcessor);
`;
  workletUrlCache = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
  return workletUrlCache;
}

export async function iniciarGravador() {
  // Voz mono, eco/ruído suprimidos pelo navegador, sem ganho automático
  // (AGC elevava o sinal até saturar em alguns microfones).
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: { ideal: 1 },
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: false },
    },
  });

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContextClass({ latencyHint: 'interactive' });
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  await audioCtx.audioWorklet.addModule(getWorkletUrl());

  const source = audioCtx.createMediaStreamSource(stream);
  // Filtro passa-alta 70Hz: remove ronco/baixo sem afetar a voz.
  const voiceFilter = audioCtx.createBiquadFilter();
  voiceFilter.type = 'highpass';
  voiceFilter.frequency.value = 70;
  voiceFilter.Q.value = 0.7;

  const node = new AudioWorkletNode(audioCtx, 'gravador-audio', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
  });

  const chunks = [];
  node.port.onmessage = (e) => {
    if (e.data?.type === 'chunk' && e.data.samples) {
      chunks.push(e.data.samples);
    }
  };

  source.connect(voiceFilter);
  voiceFilter.connect(node);

  // O AudioWorkletNode com 0 outputs processa enquanto há input ativo, mas
  // alguns navegadores só mantêm o grafo "rodando" se algo chega ao destino.
  // Conectamos um ganho mudo para garantir sem reproduzir som.
  const silentGain = audioCtx.createGain();
  silentGain.gain.value = 0;
  voiceFilter.connect(silentGain);
  silentGain.connect(audioCtx.destination);

  let parado = false;
  const liberar = () => {
    if (parado) return;
    parado = true;
    try { node.port.onmessage = null; } catch (_) {}
    try { node.disconnect(); } catch (_) {}
    try { voiceFilter.disconnect(); } catch (_) {}
    try { source.disconnect(); } catch (_) {}
    try { silentGain.disconnect(); } catch (_) {}
    stream.getTracks().forEach((t) => t.stop());
  };

  return {
    chunks,
    async parar() {
      liberar();
      const sampleRate = audioCtx.sampleRate;
      try { await audioCtx.close(); } catch (_) {}
      const total = chunks.reduce((a, c) => a + c.length, 0);
      const samples = new Float32Array(total);
      let offset = 0;
      for (const c of chunks) { samples.set(c, offset); offset += c.length; }
      return { samples, sampleRate };
    },
    cancelar() {
      liberar();
      try { audioCtx.close(); } catch (_) {}
    },
  };
}