/**
 * HackMinigame — Timing-Bar für Bonus-Hack
 * Erscheint alle ~10 Hacks, 1.2s Fenster, Sweet Spot 35-65% => 3x, sonst 1x
 */
import { haptic } from '../utils/haptics.js';
import { audio } from '../utils/audio.js';

export class HackMinigame {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.counter = 0;
    this.active = false;
    this._raf = 0;
    this._pos = 0;
    this._dir = 1;
    this._resolve = null;
    this.el = null;
    this._createEl();
  }

  _createEl() {
    const wrap = document.getElementById('hack-section');
    if (!wrap) return;
    this.el = document.createElement('div');
    this.el.id = 'hack-minigame';
    this.el.className = 'hack-minigame hidden';
    this.el.innerHTML = `
      <div class="minigame-bar"><div class="minigame-sweet"></div><div class="minigame-cursor"></div></div>
      <p class="minigame-hint">TRIFF GRÜN → 3× BONUS!</p>
    `;
    wrap.appendChild(this.el);
    this.el.addEventListener('click', () => this._hit());
  }

  // Aufruf bei jedem Hack — entscheidet ob Minigame startet
  onHack() {
    if (this.active) return null; // während aktiv normaler Hack blockiert, wartet auf Hit
    this.counter++;
    if (this.counter % 10 !== 0) return null; // alle 10 Hacks
    if (this.game.automation.getTotalPerSec() < 1) return null; // erst mit etwas Progress
    return this.start();
  }

  start() {
    if (!this.el) return Promise.resolve(1);
    this.active = true;
    this.el.classList.remove('hidden');
    this._pos = 0; this._dir = 1;
    return new Promise(resolve => {
      this._resolve = resolve;
      const tick = () => {
        if (!this.active) return;
        this._pos += this._dir * 0.018; // ~1.1s pro Durchlauf
        if (this._pos > 1) { this._pos = 1; this._dir = -1; }
        if (this._pos < 0) { this._pos = 0; this._dir = 1; }
        const cursor = this.el.querySelector('.minigame-cursor');
        if (cursor) cursor.style.left = (this._pos * 100) + '%';
        this._raf = requestAnimationFrame(tick);
      };
      tick();
      // Auto-miss nach 3s
      setTimeout(() => { if (this.active) this._hit(true); }, 3000);
    });
  }

  _hit(autoMiss = false) {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this._raf);
    this.el.classList.add('hidden');
    let mult = 1;
    let hit = false;
    if (!autoMiss) {
      hit = this._pos >= 0.35 && this._pos <= 0.65;
      mult = hit ? 3 : 1;
    }
    if (hit) { audio.hackMinigameHit(); haptic([10, 20]); }
    else { audio.hackMinigameMiss(); haptic(20); }
    if (this._resolve) { this._resolve(mult); this._resolve = null; }
    this.ui._showMinigameResult?.(hit, mult);
  }
}
