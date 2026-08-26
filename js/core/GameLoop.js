/**
 * GameLoop — fixer Tick + rAF Rendering.
 * tickRate bestimmt Logik-Updates/Sekunde, Rendering läuft per rAF.
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
        this.accum = 0;
        this.lastTime = 0;
        this.rafId = 0;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this.accum = 0;
        this.rafId = requestAnimationFrame(this._frame.bind(this));
    }

    stop() {
        this.running = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);
    }

    _frame(now) {
        if (!this.running) return;
        this.rafId = requestAnimationFrame(this._frame.bind(this));

        let delta = now - this.lastTime;
        // Tab im Hintergrund: clamp damit kein riesiger Bounce
        if (delta > 1000) delta = this.tickInterval;
        this.lastTime = now;
        this.accum += delta;

        while (this.accum >= this.tickInterval) {
            this.onTick(this.tickInterval / 1000);
            this.accum -= this.tickInterval;
        }

        if (this.onRender) this.onRender();
    }
}
