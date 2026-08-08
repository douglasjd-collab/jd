import * as lamejsModule from '@breezystack/lamejs';

// Interop: dependendo do bundler, o construtor pode vir no default export
// ou diretamente no namespace importado.
const Mp3Encoder = lamejsModule.Mp3Encoder || lamejsModule.default?.Mp3Encoder;

// Codifica amostras PCM (Float32, mono) capturadas diretamente do microfone em MP3.
// Evita decodeAudioData sobre o blob gravado pelo MediaRecorder — que falha em vários
// navegadores para webm/opus — trabalhando direto com as amostras já capturadas.
export async function encodeFloat32ToMp3(samples, sampleRate) {
  if (typeof Mp3Encoder !== 'function') {
    throw new Error('lamejs.Mp3Encoder não disponível');
  }

  if (!samples?.length) throw new Error('A gravação não contém áudio');
  if (!Number.isFinite(sampleRate) || sampleRate < 8000) {
    throw new Error('Taxa de amostragem inválida');
  }

  // Remove o pequeno deslocamento DC de alguns microfones e reduz somente os
  // picos que ultrapassariam o limite do MP3. Isso evita estalos e saturação sem
  // aumentar artificialmente o ruído de fundo.
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i];
  const dcOffset = sum / samples.length;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    peak = Math.max(peak, Math.abs(samples[i] - dcOffset));
  }
  const safeGain = peak > 0.98 ? 0.95 / peak : 1;

  const int16Samples = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, (samples[i] - dcOffset) * safeGain));
    int16Samples[i] = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
  }

  // 128 kbps preserva melhor a voz após o WhatsApp fazer sua própria compressão.
  const encoder = new Mp3Encoder(1, Math.round(sampleRate), 128);
  const chunks = [];
  const blockSize = 1152;
  for (let i = 0; i < int16Samples.length; i += blockSize) {
    const chunk = int16Samples.subarray(i, i + blockSize);
    const encoded = encoder.encodeBuffer(chunk);
    if (encoded.length > 0) chunks.push(encoded);
  }
  const finalChunk = encoder.flush();
  if (finalChunk.length > 0) chunks.push(finalChunk);

  const mp3Blob = new Blob(chunks, { type: 'audio/mpeg' });
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(mp3Blob);
  });

  return { blob: mp3Blob, base64 };
}