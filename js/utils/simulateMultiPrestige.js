/**
 * simulateMultiPrestige.js — Headless Mehrfach-Prestige-Simulation.
 * Prüft, ob die wachsende Prestige-Schwelle (thresholdGrowth) + die
 * erweiterten Meilensteine (bis Prestige 50) über viele Durchläufe
 * eine sinnvolle Kadenz ergeben (nicht trivial spammbar, nicht unspielbar
 * langsam). Prestiget automatisch sobald möglich (Worst-Case: schnellster
 * Spam-Loop), CPU-Chips werden NICHT im Shop ausgegeben (reiner Test der
 * Meilenstein-/Schwellen-Balance ohne Shop-Einfluss).
 *
 * Run: node js/utils/simulateMultiPrestige.js          -> 50 Prestiges, 5 Klicks/s
 *      node js/utils/simulateMultiPrestige.js 20 10    -> 20 Prestiges, 10 Klicks/s
 */
import { GameConfig } from '../config/GameConfig.js';
import { Game } from '../core/Game.js';
import { Formatter } from './Formatter.js';

// ---- Headless Mocks (identisch zu simulate.js) ----
globalThis.localStorage = {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = v; },
    removeItem(k) { delete this._d[k]; },
};
globalThis.document = {
    visibilityState: 'visible',
    addEventListener() {},
    getElementById() { return { textContent: '', innerHTML: '', style: {}, title: '', classList: { toggle() {} }, appendChild() {}, querySelectorAll() { return []; }, addEventListener() {} }; },
    querySelectorAll() { return []; },
    createElement() { return { classList: { add() {} }, style: {}, textContent: '', appendChild() {}, addEventListener() {}, remove() {} }; },
};
globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), navigator: {} };
try { globalThis.navigator = { vibrate() {} }; } catch { globalThis._navMock = { vibrate() {} }; }
globalThis.performance = { now: () => Date.now() };
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

function freshGame() {
    const g = new Game();
    g.save.load = () => null;
    g.save.save = () => true;
    g.loop.stop();
    g.loop.start = () => {};
    g.init();
    g.loop.stop();
    return g;
}

function tryBuyBest(g) {
    let bought = false;
    for (const s of g.upgrades.getAllStates()) {
        if (g.upgrades.canBuy(s.def.id)) { g.upgrades.buy(s.def.id); bought = true; }
    }
    let loop = true;
    while (loop) {
        loop = false;
        const states = g.automation.getAllStates().slice().sort((a, b) => a.cost - b.cost);
        for (const s of states) {
            if (g.automation.canBuy(s.def.id)) { g.automation.buy(s.def.id); loop = true; bought = true; break; }
        }
    }
    return bought;
}

/**
 * Simuliert bis zu `maxPrestiges` Root-Zugriffe, prestiget automatisch
 * sobald möglich. Bricht ab bei `maxSeconds` (Schutz gegen Endlosschleife
 * falls die Schwelle unerreichbar wird).
 */
export function simulateMultiPrestige(maxPrestiges = 50, clicksPerSec = 5, maxSeconds = 3 * 3600) {
    const g = freshGame();
    const dt = 1 / GameConfig.tickRate;
    const log = [];
    let t = 0;
    let clickCarry = 0;
    let lastPrestigeAt = 0;

    while (g.prestige.totalPrestiges < maxPrestiges && t < maxSeconds) {
        clickCarry += clicksPerSec * dt;
        while (clickCarry >= 1) { g.click.hack(); clickCarry -= 1; }
        tryBuyBest(g);
        g.tick(dt);
        t += dt;

        if (g.prestige.canPrestige()) {
            const before = g.prestige.totalPrestiges;
            const durationSec = t - lastPrestigeAt;
            const thresholdBefore = g.prestige.getThreshold();
            g.doPrestige();
            lastPrestigeAt = t;
            log.push({
                prestige: before + 1,
                atSec: Math.round(t),
                durationSec: Math.round(durationSec),
                threshold: thresholdBefore,
                points: g.prestige.points,
                chips: g.prestige.chips,
                milestoneMultiplier: g.prestige.getMilestoneMultiplier(),
                pointsMultiplier: g.prestige.getMultiplier(),
            });
        }
    }
    return { log, reachedPrestiges: g.prestige.totalPrestiges, timedOut: t >= maxSeconds };
}

if (process.argv[1]?.endsWith('simulateMultiPrestige.js')) {
    const maxPrestiges = Number.isFinite(Number(process.argv[2])) ? Number(process.argv[2]) : 50;
    const cps = Number.isFinite(Number(process.argv[3])) ? Number(process.argv[3]) : 5;

    console.log(`\n=== Idle Hacker Tycoon — Mehrfach-Prestige-Sim ===`);
    console.log(`Ziel: ${maxPrestiges} Prestiges | Klicks/s: ${cps} | thresholdGrowth: ${GameConfig.prestige.thresholdGrowth}\n`);

    const { log, reachedPrestiges, timedOut } = simulateMultiPrestige(maxPrestiges, cps);

    const header = 'P# | bei (s) | Dauer (s) | Dauer (min) | Schwelle       | Keys | Chips | Meilenstein× | Punkte×';
    console.log(header);
    console.log('-'.repeat(header.length));
    for (const e of log) {
        console.log(
            `${String(e.prestige).padStart(2)} | ${String(e.atSec).padStart(6)} | ${String(e.durationSec).padStart(9)} | ${(e.durationSec / 60).toFixed(1).padStart(11)} | ${Formatter.formatFull(e.threshold).padStart(14)} | ${String(e.points).padStart(4)} | ${String(e.chips).padStart(5)} | ${e.milestoneMultiplier.toFixed(2).padStart(12)} | ${e.pointsMultiplier.toFixed(2)}`
        );
    }
    console.log(`\nErreichte Prestiges: ${reachedPrestiges}/${maxPrestiges}${timedOut ? ' (Zeitlimit erreicht — Schwelle evtl. zu aggressiv)' : ''}`);
}
