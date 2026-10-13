// Tom local de chamada: toca somente na saída de áudio, nunca no microfone.
export function startCallRingback(context) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = 425;
  gain.gain.value = 0;
  oscillator.connect(gain);
  gain.connect(context.destination);
  let stopped = false;
  const pulse = () => {
    if (stopped || context.state === 'closed') return;
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.01);
    gain.gain.setValueAtTime(0.12, now + 0.99);
    gain.gain.linearRampToValueAtTime(0, now + 1);
  };
  oscillator.start();
  pulse();
  const timer = setInterval(pulse, 5000);
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    try {
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setValueAtTime(0, context.currentTime);
      oscillator.stop();
      oscillator.disconnect();
      gain.disconnect();
    } catch (_) {}
  };
}
