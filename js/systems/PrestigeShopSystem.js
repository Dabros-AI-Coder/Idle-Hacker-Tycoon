/**
 * PrestigeShopSystem — permanenter Shop für CPU-Chips (Prestige-Zweitwährung).
 * Käufe überleben normale Prestige-Resets (nur resetHard() beim Save-Wipe
 * löscht sie) — im Gegensatz zu UpgradeSystem, das bei jedem Prestige
 * zurückgesetzt wird. Effekte werden generisch per Event kommuniziert,
 * genau wie bei UpgradeSystem — dieses System kennt die Bedeutung der
 * effect.type-Werte nicht, das übernehmen die jeweiligen Ziel-Systeme.
 */
import { GameConfig } from '../config/GameConfig.js';

// Effekte, die On-Demand aus den Leveln berechnet werden (siehe getStartBitsBonus/
// getOfflineCapBonus) statt per Event verteilt zu werden — kein Ziel-System
// muss dafür einen laufenden Zähler pflegen.
const ON_DEMAND_EFFECTS = new Set(['start_bits_add', 'offline_cap_add']);

export class PrestigeShopSystem {
    /**
     * @param {import('../core/EventBus.js').EventBus} bus
     * @param {import('./PrestigeSystem.js').PrestigeSystem} prestige
     */
    constructor(bus, prestige) {
        this.bus = bus;
        this.prestige = prestige;
        /** @type {Map<string, number>} id -> aktuelles Level */
        this.levels = new Map();
    }

    getLevel(id) { return this.levels.get(id) || 0; }

    getCost(id) {
        const def = GameConfig.getPrestigeShopItem(id);
        if (!def) return Infinity;
        const level = this.getLevel(id);
        if (level >= def.maxLevel) return Infinity;
        return Math.ceil(def.baseCost * Math.pow(def.costMultiplier, level));
    }

    canBuy(id) {
        const cost = this.getCost(id);
        return Number.isFinite(cost) && this.prestige.chips >= cost;
    }

    buy(id) {
        const def = GameConfig.getPrestigeShopItem(id);
        if (!def) return false;
        if (!this.canBuy(id)) return false;
        const cost = this.getCost(id);
        this.prestige.chips -= cost;
        const level = this.getLevel(id) + 1;
        this.levels.set(id, level);
        this._applyEffect(def, def.effect.perLevel);
        this.bus.emit('prestigeshop:bought', { id, level, cost });
        return true;
    }

    /** Summe aller aktiven 'start_bits_add'-Stufen (Bits nach Reset). */
    getStartBitsBonus() {
        let bonus = 0;
        for (const def of GameConfig.prestigeShop) {
            if (def.effect.type === 'start_bits_add') bonus += this.getLevel(def.id) * def.effect.perLevel;
        }
        return bonus;
    }

    /** Summe aller aktiven 'offline_cap_add'-Stufen (Bruchteil, z.B. 0.5 = +50%). */
    getOfflineCapBonus() {
        let bonus = 0;
        for (const def of GameConfig.prestigeShop) {
            if (def.effect.type === 'offline_cap_add') bonus += this.getLevel(def.id) * def.effect.perLevel;
        }
        return bonus;
    }

    _applyEffect(def, delta) {
        if (ON_DEMAND_EFFECTS.has(def.effect.type)) return;
        this.bus.emit('prestigeshop:applied', { id: def.id, effect: def.effect, delta });
    }

    getAllStates() {
        return GameConfig.prestigeShop.map(def => {
            const level = this.getLevel(def.id);
            const maxed = level >= def.maxLevel;
            return {
                def,
                level,
                maxed,
                cost: this.getCost(def.id),
                canAfford: !maxed && this.canBuy(def.id),
            };
        });
    }

    serialize() {
        const o = {};
        for (const [k, v] of this.levels) o[k] = v;
        return { levels: o };
    }

    load(data) {
        if (!data || !data.levels) return;
        for (const [id, rawLevel] of Object.entries(data.levels)) {
            const level = Number(rawLevel) || 0;
            if (level <= 0) continue;
            this.levels.set(id, level);
            const def = GameConfig.getPrestigeShopItem(id);
            if (def) this._applyEffect(def, def.effect.perLevel * level);
        }
    }

    // Bewusst KEIN reset() — ein normaler Prestige-Reset (Game.doPrestige)
    // darf den Shop-Fortschritt nicht anfassen, das ist der ganze Sinn.

    /** Nur für kompletten Save-Wipe (Game.reset() / importSave()). */
    resetHard() {
        this.levels.clear();
    }
}
