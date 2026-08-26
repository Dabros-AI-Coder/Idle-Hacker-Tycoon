/**
 * UpgradeSystem — einmalige Upgrades.
 */
import { GameConfig } from '../config/GameConfig.js';

export class UpgradeSystem {
    /**
     * @param {import('../core/EventBus.js').EventBus} bus
     * @param {import('./EconomySystem.js').EconomySystem} economy
     * @param {import('./AutomationSystem.js').AutomationSystem} automation
     */
    constructor(bus, economy, automation) {
        this.bus = bus;
        this.economy = economy;
        this.automation = automation;
        /** @type {Set<string>} */
        this.purchased = new Set();
    }

    isPurchased(id) { return this.purchased.has(id); }

    isUnlocked(def) {
        if (!def.requires) return true;
        return this.purchased.has(def.requires);
    }

    canBuy(id) {
        const def = GameConfig.getUpgrade(id);
        if (!def) return false;
        if (this.isPurchased(id)) return false;
        if (!this.isUnlocked(def)) return false;
        return this.economy.canAfford(def.cost);
    }

    buy(id) {
        const def = GameConfig.getUpgrade(id);
        if (!def) return false;
        if (!this.canBuy(id)) return false;
        if (!this.economy.spendBits(def.cost)) return false;
        this.purchased.add(id);
        this.bus.emit('upgrade:applied', { id, effect: def.effect });
        this.bus.emit('upgrade:bought', { id });
        this.bus.emit('economy:changed', this.economy.snapshot());
        return true;
    }

    getAllStates() {
        return GameConfig.upgrades.map(def => ({
            def,
            purchased: this.isPurchased(def.id),
            unlocked: this.isUnlocked(def),
            canAfford: this.canBuy(def.id),
        }));
    }

    serialize() {
        return { purchased: [...this.purchased] };
    }

    load(data) {
        if (!data || !Array.isArray(data.purchased)) return;
        this.purchased = new Set(data.purchased);
        // Re-apply effects so multipliers are restored
        for (const id of this.purchased) {
            const def = GameConfig.getUpgrade(id);
            if (def) this.bus.emit('upgrade:applied', { id, effect: def.effect });
        }
    }

    reset() {
        this.purchased.clear();
    }
}
