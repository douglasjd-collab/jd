import lamejs from 'lamejs';

// Converte um Blob de áudio gravado no navegador (geralmente webm/opus) para um MP3
// real. Necessário porque apenas rotular o blob original como "audio/ogg" não funciona:
// o conteúdo continua sendo webm e a D-API/WhatsApp rejeita a entrega silenciosamente.
export async function converterAudioParaMp3(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContextClass();

  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.getChannelData(0);

  const int16Samples = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const encoder = new lamejs.Mp3Encoder(1, sampleRate, 96);
  const chunks = [];
  const blockSize = 1152;
  for (let i = 0; i < int16Samples.length; i += blockSize) {
    const chunk = int16Samples.subarray(i, i + blockSize);
    const encoded = encoder.encodeBuffer(chunk);
    if (encoded.length > 0) chunks.push(encoded);
  }
  const finalChunk = encoder.flush();
  if (finalChunk.length > 0) chunks.push(finalChunk);

  await audioCtx.close();

  const mp3Blob = new Blob(chunks, { type: 'audio/mpeg' });
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(mp3Blob);
  });

  return { blob: mp3Blob, base64 };
}