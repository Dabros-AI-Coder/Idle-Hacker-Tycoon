/**
 * PrestigeSystem — Root-Zugriff (Prestige)
 * Ermöglicht Reset gegen permanente Root-Keys (+10% global pro Punkt).
 */
import { GameConfig } from '../config/GameConfig.js';

export class PrestigeSystem {
    /**
     * @param {import('../core/EventBus.js').EventBus} bus
     * @param {import('./EconomySystem.js').EconomySystem} economy
     */
    constructor(bus, economy) {
        this.bus = bus;
        this.economy = economy;
        this.points = 0;          // permanente Root-Keys
        this.totalPrestiges = 0;
    }

    getThreshold() { return GameConfig.prestige.threshold; }
    getGainDivisor() { return GameConfig.prestige.gainDivisor; }
    getMultiplierPerPoint() { return GameConfig.prestige.multiplierPerPoint; }

    getMultiplier() {
        return 1 + this.points * this.getMultiplierPerPoint();
    }

    /** Punkte die man JETZT bei Prestige erhalten würde */
    getPendingGain() {
        if (!this.canPrestige()) return 0;
        return Math.floor(this.economy.totalEarned / this.getGainDivisor());
    }

    canPrestige() {
        return this.economy.totalEarned >= this.getThreshold();
    }

    /**
     * Führt Prestige durch. Gibt {gain, points, multiplier} zurück oder null wenn nicht möglich.
     * Der eigentliche Reset wird vom Game orchestriert (Economy/Automation/Upgrades).
     */
    commit() {
        if (!this.canPrestige()) return null;
        const gain = this.getPendingGain();
        if (gain <= 0) return null;
        this.points += gain;
        this.totalPrestiges += 1;
        const multiplier = this.getMultiplier();
        this.bus.emit('prestige:committed', { gain, points: this.points, multiplier, totalPrestiges: this.totalPrestiges });
        this.bus.emit('prestige:changed', { points: this.points, multiplier, pendingGain: 0 });
        return { gain, points: this.points, multiplier };
    }

    snapshot() {
        return {
            points: this.points,
            totalPrestiges: this.totalPrestiges,
            multiplier: this.getMultiplier(),
            pendingGain: this.getPendingGain(),
            canPrestige: this.canPrestige(),
        };
    }

    serialize() {
        return { points: this.points, totalPrestiges: this.totalPrestiges };
    }

    load(data) {
        if (!data) return;
        this.points = Number(data.points) || 0;
        this.totalPrestiges = Number(data.totalPrestiges) || 0;
        // Nach Load Multiplier broadcasten damit Click/Automation ihn übernehmen
        this.bus.emit('prestige:changed', { points: this.points, multiplier: this.getMultiplier(), pendingGain: this.getPendingGain() });
    }

    resetHard() {
        // Nur für kompletten Save-Wipe (Stats -> Fortschritt löschen)
        this.points = 0;
        this.totalPrestiges = 0;
        this.bus.emit('prestige:changed', { points: 0, multiplier: 1, pendingGain: 0 });
    }
}
