let context: AudioContext | undefined;

export async function playChime(volume = 60) {
  context ??= new AudioContext();
  if (context.state !== "running") {
    await Promise.race([context.resume(), new Promise<void>((resolve) => window.setTimeout(resolve, 500))]);
  }
  if (context.state !== "running") throw new Error("소리를 허용하려면 벨소리 재생을 눌러 주세요.");
  const start = context.currentTime;
  for (const [offset, frequency] of [[0, 880], [0.35, 660]]) {
    const tone = context.createOscillator(), gain = context.createGain();
    tone.type = "sine";
    tone.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start + offset);
    gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(100, volume)) / 100 * 0.25, start + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.7);
    tone.connect(gain).connect(context.destination);
    tone.start(start + offset);
    tone.stop(start + offset + 0.75);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
  }
}
