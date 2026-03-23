let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export async function playChime(volume: number): Promise<void> {
  try {
    const ctx = getAudioContext();
    await ctx.resume();
    const now = ctx.currentTime;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime((volume / 100) * 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    gain.connect(ctx.destination);

    // Two-tone crystalline chime
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.1);
    osc1.connect(gain);
    osc1.start(now);
    osc1.stop(now + 0.8);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime((volume / 100) * 0.2, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    gain2.connect(ctx.destination);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.5, now + 0.1); // E6
    osc2.connect(gain2);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.9);
  } catch {
    // Audio not available — fail silently
  }
}

export function sendNotification(title: string, body: string): void {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  } catch {
    // Notifications not available
  }
}
