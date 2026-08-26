/**
 * AutomationSystem — Generatoren (Idle-Einkommen).
 */
import { GameConfig } from '../config/GameConfig.js';

export class AutomationSystem {
    /** @param {import('../core/EventBus.js').EventBus} bus
     *  @param {import('./EconomySystem.js').EconomySystem} economy
     */
    constructor(bus, economy) {
        this.bus = bus;
        this.economy = economy;
        /** @type {Map<string, number>} */
        this.owned = new Map();
        for (const g of GameConfig.generators) this.owned.set(g.id, 0);
        /** @type {Map<string, number>} Generator-spezifische Multiplikatoren */
        this.genMultipliers = new Map();
        this.globalMultiplier = 1;
        this.prestigeMultiplier = 1;

        bus.on('upgrade:applied', ({ effect }) => {
            if (effect.type === 'generator_mult') {
                const cur = this.genMultipliers.get(effect.target) || 1;
                this.genMultipliers.set(effect.target, cur * effect.value);
            }
            if (effect.type === 'global_mult') {
                this.globalMultiplier *= effect.value;
            }
        });
        bus.on('prestige:changed', ({ multiplier }) => {
            this.prestigeMultiplier = multiplier || 1;
        });
        bus.on('prestige:committed', ({ multiplier }) => {
            this.prestigeMultiplier = multiplier || 1;
        });
    }

    getCost(id) {
        const def = GameConfig.getGenerator(id);
        if (!def) return Infinity;
        const owned = this.owned.get(id) || 0;
        return Math.floor(def.baseCost * Math.pow(def.costMultiplier, owned));
    }

    canBuy(id) {
        return this.economy.canAfford(this.getCost(id));
    }

    buy(id) {
        const cost = this.getCost(id);
        if (!this.economy.spendBits(cost)) return false;
        this.owned.set(id, (this.owned.get(id) || 0) + 1);
        this.bus.emit('automation:bought', { id, owned: this.owned.get(id), cost });
        this.bus.emit('economy:changed', this.economy.snapshot());
        return true;
    }

    getTotalPerSec() {
        let total = 0;
        for (const def of GameConfig.generators) {
            const count = this.owned.get(def.id) || 0;
            if (count === 0) continue;
            const genMult = this.genMultipliers.get(def.id) || 1;
            total += count * def.basePerSec * genMult * this.globalMultiplier * this.prestigeMultiplier;
        }
        return total;
    }

    getPerSecFor(id) {
        const def = GameConfig.getGenerator(id);
        if (!def) return 0;
        const count = this.owned.get(id) || 0;
        const genMult = this.genMultipliers.get(id) || 1;
        return count * def.basePerSec * genMult * this.globalMultiplier * this.prestigeMultiplier;
    }

    getOwned(id) { return this.owned.get(id) || 0; }

    getAllStates() {
        return GameConfig.generators.map(def => ({
            def,
            owned: this.owned.get(def.id) || 0,
            cost: this.getCost(def.id),
            perSec: this.getPerSecFor(def.id),
            canAfford: this.canBuy(def.id),
        }));
    }

    serialize() {
        const o = {};
        for (const [k, v] of this.owned) o[k] = v;
        const m = {};
        for (const [k, v] of this.genMultipliers) m[k] = v;
        return { owned: o, genMultipliers: m, globalMultiplier: this.globalMultiplier };
    }

    load(data) {
        if (!data) return;
        if (data.owned) for (const [k, v] of Object.entries(data.owned)) this.owned.set(k, Number(v) || 0);
        if (data.genMultipliers) for (const [k, v] of Object.entries(data.genMultipliers)) this.genMultipliers.set(k, Number(v) || 1);
        if (data.globalMultiplier) this.globalMultiplier = Number(data.globalMultiplier) || 1;
    }

    reset() {
        for (const k of this.owned.keys()) this.owned.set(k, 0);
        this.genMultipliers.clear();
        this.globalMultiplier = 1;
    }
}
