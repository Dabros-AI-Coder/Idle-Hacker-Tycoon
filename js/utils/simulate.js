/**
 * simulate.js — T1.1 Headless Balance-Simulation
 * Nutzt echte Game-Systeme (Economy/Automation/Upgrade) ohne DOM.
 * Run: node js/utils/simulate.js          -> 30min Standard
 *       node js/utils/simulate.js 1800 5  -> 1800s, 5 Klicks/s
 */
import { GameConfig } from '../config/GameConfig.js';
import { Game } from '../core/Game.js';
import { Formatter } from './Formatter.js';

// ---- Headless Mocks ----
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

/**
 * Baue frisches Game ohne Save/Loop.
 */
function freshGame() {
    const g = new Game();
    // Deaktiviere Persistenz + Loop-Sideeffects
    g.save.load = () => null;
    g.save.save = () => true;
    // Loop nicht starten — wir ticken manuell
    g.loop.stop();
    g.loop.start = () => {};
    g.init();
    g.loop.stop();
    return g;
}

/**
 * Kaufe gierig: immer den günstigsten erschwinglichen Generator, dann Upgrades.
 * Upgrades werden gekauft sobald erschwinglich + unlocked.
 */
function tryBuyBest(g) {
    let bought = false;
    // Upgrades zuerst (oft besseres ROI)
    for (const s of g.upgrades.getAllStates()) {
        if (g.upgrades.canBuy(s.def.id)) {
            g.upgrades.buy(s.def.id);
            bought = true;
        }
    }
    // Generatoren: günstigster zuerst, wiederholen bis nichts mehr geht
    let loop = true;
    while (loop) {
        loop = false;
        const states = g.automation.getAllStates().slice().sort((a,b) => a.cost - b.cost);
        for (const s of states) {
            if (g.automation.canBuy(s.def.id)) {
                g.automation.buy(s.def.id);
                loop = true;
                bought = true;
                break;
            }
        }
    }
    return bought;
}

/**
 * Simuliere durationSec mit clicksPerSec.
 * @returns {{log: Array, milestones: Object}}
 */
export function simulate(durationSec = 1800, clicksPerSec = 5) {
    const g = freshGame();
    const dt = 1 / GameConfig.tickRate; // ^= Game tick
    const ticks = Math.ceil(durationSec / dt);
    const clicksPerTick = clicksPerSec * dt;

    const log = [];
    const milestones = {};
    let clickCarry = 0;

    // Meilensteine: erster Kauf jedes Generators + totalEarned-Schwellen
    const thresholds = [1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000];
    const thresholdHitAt = {};

    function snapshot(t) {
        return {
            t: Math.round(t),
            bits: g.economy.bits,
            totalEarned: g.economy.totalEarned,
            perSec: g.automation.getTotalPerSec(),
            owned: Object.fromEntries([...g.automation.owned.entries()]),
            upgrades: [...g.upgrades.purchased],
        };
    }

    for (let i = 0; i < ticks; i++) {
        const t = i * dt;

        // Klicks (fraktional sammeln)
        clickCarry += clicksPerTick;
        while (clickCarry >= 1) {
            g.click.hack();
            clickCarry -= 1;
        }

        // Käufe versuchen
        tryBuyBest(g);

        // Tick (passives Einkommen)
        g.tick(dt);

        // Meilensteine prüfen
        for (const [id, count] of g.automation.owned) {
            if (count === 1 && !(id in milestones)) milestones[id] = { at: t, bits: g.economy.bits };
        }
        for (const th of thresholds) {
            if (!(th in thresholdHitAt) && g.economy.totalEarned >= th) thresholdHitAt[th] = t;
        }

        // Log alle 10s
        if (i % (10 / dt) === 0) {
            log.push(snapshot(t));
        }
    }
    // End-Snapshot
    log.push(snapshot(durationSec));

    return { log, milestones, thresholdHitAt, final: snapshot(durationSec), game: g };
}

function formatLog(log) {
    const ids = GameConfig.generators.map(g => g.id);
    const header = `t(s) | bits      | total     | perSec | owned (${ids.join('/')}) | upgrades`;
    const lines = [header, '-'.repeat(header.length)];
    for (const e of log) {
        const ownedStr = ids.map(id => e.owned[id] || 0).join('/');
        const up = e.upgrades.length ? e.upgrades.join(',') : '-';
        lines.push(
            `${String(e.t).padStart(4)} | ${Formatter.formatBits(e.bits).padStart(9)} | ${Formatter.formatBits(e.totalEarned).padStart(9)} | ${Formatter.formatPerSec(e.perSec).padStart(6)} | ${ownedStr.padStart(30)} | ${up}`
        );
    }
    return lines.join('\n');
}

// CLI
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('simulate.js')) {
    const duration = Number.isFinite(Number(process.argv[2])) ? Number(process.argv[2]) : 1800;
    const cps = Number.isFinite(Number(process.argv[3])) ? Number(process.argv[3]) : 5;
    console.log(`\n=== Idle Hacker Tycoon — Balance Sim ===`);
    console.log(`Dauer: ${duration}s (${(duration/60).toFixed(0)}min) | Klicks/s: ${cps} | TickRate: ${GameConfig.tickRate}/s\n`);

    const { log, milestones, thresholdHitAt, final } = simulate(duration, cps);

    console.log(formatLog(log));
    console.log('\n--- Meilensteine (erster Kauf) ---');
    for (const gen of GameConfig.generators) {
        const m = milestones[gen.id];
        console.log(`${m ? `✓ ${gen.name.padEnd(14)} @ ${String(Math.round(m.at)).padStart(4)}s` : `✗ ${gen.name.padEnd(14)} — nicht erreicht`}`);
    }
    console.log('\n--- TotalEarned Schwellen ---');
    for (const th of [1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000]) {
        const at = thresholdHitAt[th];
        console.log(`${Formatter.formatBits(th).padStart(6)} total @ ${at !== undefined ? Math.round(at)+'s ('+(at/60).toFixed(1)+'min)' : '— nicht erreicht'}`);
    }
    console.log('\n--- Final ---');
    console.log(`Bits: ${Formatter.formatFull(final.bits)} | Total: ${Formatter.formatFull(final.totalEarned)} | perSec: ${final.perSec.toFixed(1)} | Playtime: ${Formatter.formatTime(final.t)}`);
    console.log(`Owned:`, final.owned);
    console.log(`Upgrades:`, final.upgrades.length ? final.upgrades.join(', ') : 'keine');

    // Quick Prestige-Prognose (1M Threshold)
    const prestigeAt = thresholdHitAt[1_000_000];
    if (prestigeAt !== undefined) {
        console.log(`\nPrestige (1M) erreichbar in ~${(prestigeAt/60).toFixed(1)}min bei ${cps} Klicks/s — ${prestigeAt <= 1200 ? '✓ im Ziel (≤20min)' : '⚠ zu langsam (>20min)'}`);
    } else {
        console.log(`\nPrestige (1M) nicht in ${duration/60}min erreicht — Balancing zu schwer bei ${cps} Klicks/s`);
    }
}
