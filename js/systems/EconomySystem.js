/**
 * EconomySystem — verwaltet Bits (Währung).
 */
import { GameConfig } from '../config/GameConfig.js';

export class EconomySystem {
    /** @param {import('../core/EventBus.js').EventBus} bus */
    constructor(bus) {
        this.bus = bus;
        this.bits = GameConfig.startingBits;
        this.totalEarned = 0;
        this.totalClicks = 0;
    }

    addBits(amount) {
        if (amount <= 0) return;
        this.bits += amount;
        this.totalEarned += amount;
        this.bus.emit('economy:changed', this.snapshot());
    }

    /** @returns {boolean} true wenn Kauf erfolgreich */
    spendBits(amount) {
        if (amount <= 0) return true;
        if (this.bits < amount) return false;
        this.bits -= amount;
        this.bus.emit('economy:changed', this.snapshot());
        return true;
    }

    canAfford(amount) {
        return this.bits >= amount;
    }

    snapshot() {
        return { bits: this.bits, totalEarned: this.totalEarned, totalClicks: this.totalClicks };
    }

    serialize() {
        return { bits: this.bits, totalEarned: this.totalEarned, totalClicks: this.totalClicks };
    }

    load(data) {
        if (!data) return;
        this.bits = Number(data.bits) || 0;
        this.totalEarned = Number(data.totalEarned) || 0;
        this.totalClicks = Number(data.totalClicks) || 0;
    }

    /**
     * @param {number} [startBits] - Startkapital (z. B. Prestige-Meilenstein-Bonus)
     */
    reset(startBits = GameConfig.startingBits) {
        this.bits = startBits;
        this.totalEarned = 0;
        this.totalClicks = 0;
    }

    registerClick(value) {
        this.totalClicks += 1;
        this.addBits(value);
    }
}
