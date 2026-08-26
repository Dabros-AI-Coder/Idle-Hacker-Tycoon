/**
 * GameLoop — fixer Tick via setInterval + rAF Rendering.
 * tickRate bestimmt Logik-Updates/Sekunde, Rendering läuft per rAF.
 * Der Logik-Tick nutzt setInterval (statt rAF), damit das Spiel auch
 * minimiert/im Hintergrund weiterläuft — Browser drosseln Timer dort
 * auf ~1 Hz, pausieren sie aber nicht komplett wie requestAnimationFrame.
 * Längere Pausen (Tab-Suspend, System-Sleep) fängt Game per Catch-Up ab.
 */
export class GameLoop {
    /**
     * @param {number} tickRate
     * @param {(dt:number)=>void} onTick - dt in Sekunden
     * @param {()=>void} onRender - optional render callback
     */
    constructor(tickRate, onTick, onRender = null) {
        this.tickRate = tickRate;
        this.onTick = onTick;
        this.onRender = onRender;
        this.tickInterval = 1000 / tickRate;
        this.running = false;
        this.lastTime = 0;
        this._timerId = 0;
        this._rafId = 0;
        this._rafFrame = null;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this._timerId = setInterval(() => this._tick(), this.tickInterval);
        if (this.onRender) {
            this._rafFrame = () => {
                if (!this.running) return;
                this.onRender();
                this._rafId = requestAnimationFrame(this._rafFrame);
            };
            this._rafId = requestAnimationFrame(this._rafFrame);
        }
    }

    stop() {
        this.running = false;
        if (this._timerId) { clearInterval(this._timerId); this._timerId = 0; }
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
    }

    /**
     * Zeitbasis nach Pause/Rückkehr neu setzen, damit kein riesiger
     * Delta-Bounce beim nächsten Tick entsteht (Catch-Up macht Game).
     */
    syncTime() {
        if (this.running) this.lastTime = performance.now();
    }

    _tick() {
        const now = performance.now();
        let delta = now - this.lastTime;
        this.lastTime = now;

        // Real verstrichene Zeit weitergeben. Extrem große Deltas (Sleep,
        // Tab-Suspend auf Mobile) skippen — dafür zuständig ist das
        // Offline-/Catch-Up-System in Game (visibilitychange/focus).
        if (!(delta > 0) || delta > 60_000) delta = 0;

        this.onTick(delta / 1000);
    }
}
