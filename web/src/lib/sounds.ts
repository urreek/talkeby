/**
 * Minimal sound effects using Web Audio API.
 * No external files needed — generates tones programmatically.
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = "sine", volume = 0.15) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio not available
  }
}

/** Ascending two-note chime — job completed */
export function playCompleted() {
  playTone(523, 0.15, "sine", 0.12); // C5
  setTimeout(() => playTone(659, 0.25, "sine", 0.12), 120); // E5
}

/** Soft knock — needs approval */
export function playNeedsApproval() {
  playTone(440, 0.1, "triangle", 0.1); // A4
  setTimeout(() => playTone(440, 0.1, "triangle", 0.1), 150);
}

/** Low buzz — job failed */
export function playFailed() {
  playTone(220, 0.3, "sawtooth", 0.08); // A3
}

/** Quick tick — message sent */
export function playSent() {
  playTone(880, 0.06, "sine", 0.08); // A5
}

/** Check if sounds are enabled */
const SOUNDS_KEY = "talkeby-sounds-enabled";

export function isSoundsEnabled(): boolean {
  try {
    return localStorage.getItem(SOUNDS_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setSoundsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(SOUNDS_KEY, String(enabled));
  } catch {
    // storage not available
  }
}
