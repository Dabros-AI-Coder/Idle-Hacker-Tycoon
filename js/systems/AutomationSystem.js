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
        /** Multiplikator aus aktiven Prestige-Meilensteinen (permanent) */
        this.milestoneMultiplier = 1;

        this.costReduction = 1;
        /** Additive Boni aus Prestige-Shop — überleben Prestige-Reset (siehe reset()). */
        this.shopGlobalBonus = 0;
        this.shopCostReductionBonus = 0;

        bus.on('upgrade:applied', ({ effect }) => {
            if (effect.type === 'generator_mult') {
                const cur = this.genMultipliers.get(effect.target) || 1;
                this.genMultipliers.set(effect.target, cur * effect.value);
            }
            if (effect.type === 'global_mult') {
                this.globalMultiplier *= effect.value;
            }
            if (effect.type === 'cost_reduction') {
                this.costReduction *= effect.value;
            }
        });
        bus.on('prestigeshop:applied', ({ effect, delta }) => {
            if (effect.type === 'global_mult_add') this.shopGlobalBonus += delta;
            if (effect.type === 'cost_reduction_add') this.shopCostReductionBonus += delta;
        });
        bus.on('prestige:changed', ({ multiplier, totalPrestiges }) => {
            this.prestigeMultiplier = multiplier || 1;
            if (totalPrestiges !== undefined) {
                this.milestoneMultiplier = this.calcMilestoneMultiplier(totalPrestiges);
            }
        });
        bus.on('prestige:committed', ({ multiplier, totalPrestiges }) => {
            this.prestigeMultiplier = multiplier || 1;
            this.milestoneMultiplier = this.calcMilestoneMultiplier(totalPrestiges || 0);
        });
    }

    /** Produkt aller global_mult-Effekte aktivierter Meilensteine */
    calcMilestoneMultiplier(totalPrestiges) {
        let mult = 1;
        for (const m of GameConfig.prestige.milestones) {
            if (totalPrestiges >= m.prestiges && m.effect.type === 'global_mult') {
                mult *= m.effect.value;
            }
        }
        return mult;
    }

    /** Effektiver Kostenmultiplikator inkl. Upgrade- und Prestige-Shop-Kostenreduktion. */
    _effectiveCostMultiplier(def) {
        const shopFactor = 1 - Math.min(0.5, this.shopCostReductionBonus);
        return def.costMultiplier * this.costReduction * shopFactor;
    }

    getCost(id) {
        const def = GameConfig.getGenerator(id);
        if (!def) return Infinity;
        const owned = this.owned.get(id) || 0;
        return Math.floor(def.baseCost * Math.pow(this._effectiveCostMultiplier(def), owned));
    }

    getBulkCost(id, amount) {
        const def = GameConfig.getGenerator(id);
        if (!def || amount <= 0) return 0;
        const owned = this.owned.get(id) || 0;
        const mult = this._effectiveCostMultiplier(def);
        let total = 0;
        for (let i = 0; i < amount; i++) {
            total += Math.floor(def.baseCost * Math.pow(mult, owned + i));
            if (!Number.isFinite(total) || total > 1e18) break;
        }
        return total;
    }

    getMaxAffordable(id) {
        const def = GameConfig.getGenerator(id);
        if (!def) return 0;
        const bits = this.economy.bits;
        const mult = this._effectiveCostMultiplier(def);
        let owned = this.owned.get(id) || 0;
        let total = 0;
        let count = 0;
        // cap at 100 to avoid infinite loop
        while (count < 100) {
            const cost = Math.floor(def.baseCost * Math.pow(mult, owned + count));
            if (total + cost > bits) break;
            total += cost;
            count++;
        }
        return count;
    }

    canBuy(id) {
        return this.economy.canAfford(this.getCost(id));
    }

    canBuyBulk(id, amount) {
        if (amount <= 0) return false;
        return this.economy.canAfford(this.getBulkCost(id, amount));
    }

    buy(id) {
        const cost = this.getCost(id);
        if (!this.economy.spendBits(cost)) return false;
        this.owned.set(id, (this.owned.get(id) || 0) + 1);
        this.bus.emit('automation:bought', { id, owned: this.owned.get(id), cost });
        this.bus.emit('economy:changed', this.economy.snapshot());
        return true;
    }

    buyBulk(id, amount) {
        if (amount === 'max' || amount === Infinity) amount = this.getMaxAffordable(id);
        amount = Math.floor(Number(amount) || 0);
        if (amount <= 0) return 0;
        const cost = this.getBulkCost(id, amount);
        if (!this.economy.canAfford(cost)) return 0;
        if (!this.economy.spendBits(cost)) return 0;
        this.owned.set(id, (this.owned.get(id) || 0) + amount);
        this.bus.emit('automation:bought', { id, owned: this.owned.get(id), cost, amount });
        this.bus.emit('economy:changed', this.economy.snapshot());
        return amount;
    }

    getTotalPerSec() {
        let total = 0;
        const shopMult = 1 + this.shopGlobalBonus;
        for (const def of GameConfig.generators) {
            const count = this.owned.get(def.id) || 0;
            if (count === 0) continue;
            const genMult = this.genMultipliers.get(def.id) || 1;
            total += count * def.basePerSec * genMult * this.globalMultiplier * this.prestigeMultiplier * this.milestoneMultiplier * shopMult;
        }
        return total;
    }

    getPerSecFor(id) {
        const def = GameConfig.getGenerator(id);
        if (!def) return 0;
        const count = this.owned.get(id) || 0;
        const genMult = this.genMultipliers.get(id) || 1;
        return count * def.basePerSec * genMult * this.globalMultiplier * this.prestigeMultiplier * this.milestoneMultiplier * (1 + this.shopGlobalBonus);
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
        return { owned: o, genMultipliers: m, globalMultiplier: this.globalMultiplier, costReduction: this.costReduction };
    }

    load(data) {
        if (!data) return;
        if (data.owned) for (const [k, v] of Object.entries(data.owned)) this.owned.set(k, Number(v) || 0);
        if (data.genMultipliers) for (const [k, v] of Object.entries(data.genMultipliers)) this.genMultipliers.set(k, Number(v) || 1);
        if (data.globalMultiplier) this.globalMultiplier = Number(data.globalMultiplier) || 1;
        if (data.costReduction) this.costReduction = Number(data.costReduction) || 1;
    }

    reset() {
        for (const k of this.owned.keys()) this.owned.set(k, 0);
        this.genMultipliers.clear();
        this.globalMultiplier = 1;
        this.costReduction = 1;
    }
}
