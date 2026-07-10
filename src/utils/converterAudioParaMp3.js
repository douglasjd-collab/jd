import lamejs from 'lamejs';

// Converte um Blob de áudio gravado (webm/ogg) em um MP3 real,
// já que a Meta/WhatsApp exige formatos de áudio válidos (aac, mp3, ogg-opus real, etc).
// Gravações via MediaRecorder no Chrome são WebM (Matroska) mesmo quando rotuladas como "ogg",
// o que faz a Meta rejeitar a entrega ao destinatário. Convertendo para MP3 real, evitamos isso.
export async function converterAudioParaMp3(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContextClass();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const sampleRate = audioBuffer.sampleRate;
  const channels = Math.min(audioBuffer.numberOfChannels, 2);
  const left = audioBuffer.getChannelData(0);
  const right = channels > 1 ? audioBuffer.getChannelData(1) : null;

  const floatToInt16 = (floatArr) => {
    const int16 = new Int16Array(floatArr.length);
    for (let i = 0; i < floatArr.length; i++) {
      const s = Math.max(-1, Math.min(1, floatArr[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  };

  const leftInt16 = floatToInt16(left);
  const rightInt16 = right ? floatToInt16(right) : null;

  const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 64);
  const blockSize = 1152;
  const mp3Chunks = [];

  for (let i = 0; i < leftInt16.length; i += blockSize) {
    const leftChunk = leftInt16.subarray(i, i + blockSize);
    const rightChunk = rightInt16 ? rightInt16.subarray(i, i + blockSize) : null;
    const mp3buf = rightChunk ? mp3encoder.encodeBuffer(leftChunk, rightChunk) : mp3encoder.encodeBuffer(leftChunk);
    if (mp3buf.length > 0) mp3Chunks.push(mp3buf);
  }
  const finalBuf = mp3encoder.flush();
  if (finalBuf.length > 0) mp3Chunks.push(finalBuf);

  await audioCtx.close();

  const mp3Blob = new Blob(mp3Chunks, { type: 'audio/mpeg' });
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(mp3Blob);
  });

  return { blob: mp3Blob, base64 };
}