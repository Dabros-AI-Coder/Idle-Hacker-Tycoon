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
        const base = 1 + this.points * this.getMultiplierPerPoint();
        return Math.min(base, 1.5); // 50% Bonus cap (1.5 = 100% + 50% bonus)
    }

    /** Alle bereits aktivierten Meilensteine */
    getActiveMilestones() {
        return GameConfig.prestige.milestones.filter(m => this.totalPrestiges >= m.prestiges);
    }

    /** Nächster noch nicht erreichter Meilenstein (oder null) */
    getNextMilestone() {
        return GameConfig.prestige.milestones.find(m => this.totalPrestiges < m.prestiges) ?? null;
    }

    /** Start-Bits für den nächsten Reset (Summe aller aktiven start_bits-Effekte) */
    getStartBonus() {
        let bits = 0;
        for (const m of this.getActiveMilestones()) {
            if (m.effect.type === 'start_bits') bits += m.effect.value;
        }
        return bits;
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
        this.bus.emit('prestige:changed', { points: this.points, multiplier, pendingGain: 0, totalPrestiges: this.totalPrestiges });
        return { gain, points: this.points, multiplier };
    }

    snapshot() {
        return {
            points: this.points,
            totalPrestiges: this.totalPrestiges,
            multiplier: this.getMultiplier(),
            pendingGain: this.getPendingGain(),
            canPrestige: this.canPrestige(),
            activeMilestones: this.getActiveMilestones(),
            nextMilestone: this.getNextMilestone(),
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
        this.bus.emit('prestige:changed', { points: this.points, multiplier: this.getMultiplier(), pendingGain: this.getPendingGain(), totalPrestiges: this.totalPrestiges });
    }

    resetHard() {
        // Nur für kompletten Save-Wipe (Stats -> Fortschritt löschen)
        this.points = 0;
        this.totalPrestiges = 0;
        this.bus.emit('prestige:changed', { points: 0, multiplier: 1, pendingGain: 0, totalPrestiges: 0 });
    }
}
