/**
 * Audio — WebAudio Mini-Synth (keine Assets nötig). Respektiert Options.sound
 */
import { Options } from '../core/Options.js';

let ctx = null;
function getCtx() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { return null; }
  return ctx;
}

function tone(freq, dur = 0.12, type = 'sine', vol = 0.18, slideTo) {
  if (!Options.get('sound')) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  g.connect(c.destination);
  const now = c.currentTime;
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, now + dur * 0.9);
  o.start(now);
  o.stop(now + dur);
}

export const audio = {
  click() { tone(880, 0.08, 'square', 0.12); },
  buy() { tone(660, 0.12, 'sine', 0.14); setTimeout(() => tone(880, 0.12, 'sine', 0.12), 70); },
  buyFail() { tone(180, 0.15, 'sawtooth', 0.08); },
  prestige() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sine', 0.16), i * 110));
  },
  levelUp() { tone(440, 0.15, 'triangle', 0.14, 880); },
  hackMinigameHit() { tone(1200, 0.08, 'square', 0.13); },
  hackMinigameMiss() { tone(140, 0.2, 'sawtooth', 0.12); },
};
