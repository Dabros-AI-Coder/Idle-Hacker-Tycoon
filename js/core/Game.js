/**
 * Game — zentrale Orchestrierung (OOP Facade).
 * Besitzt Systeme, verbindet Loop, Persistenz und Events.
 */
import { GameConfig } from '../config/GameConfig.js';
import { EventBus } from './EventBus.js';
import { GameLoop } from './GameLoop.js';
import { SaveManager } from './SaveManager.js';
import { EconomySystem } from '../systems/EconomySystem.js';
import { ClickSystem } from '../systems/ClickSystem.js';
import { AutomationSystem } from '../systems/AutomationSystem.js';
import { UpgradeSystem } from '../systems/UpgradeSystem.js';
import { PrestigeSystem } from '../systems/PrestigeSystem.js';

export class Game {
    /**
     * Schema-Migrationen: key = Ziel-Version, value = (data) => data.
     * Bei schemaVersion-Erhöhung in GameConfig hier die Funktion ergänzen.
     */
    static MIGRATIONS = {
        // 1: (data) => { ...; return data; }, // Beispiel: 0 -> 1
    };

    constructor() {
        this.bus = new EventBus();
        this.save = new SaveManager(GameConfig.saveKey, GameConfig.schemaVersion);
        this.economy = new EconomySystem(this.bus);
        this.click = new ClickSystem(this.bus, this.economy);
        this.automation = new AutomationSystem(this.bus, this.economy);
        this.upgrades = new UpgradeSystem(this.bus, this.economy, this.automation);
        this.prestige = new PrestigeSystem(this.bus, this.economy);

        this.playtimeSec = 0;
        this.startTime = performance.now();
        this._saveTimer = 0;
        this._offlineEarning = 0;
        this._hiddenAt = null;

        this.loop = new GameLoop(GameConfig.tickRate, (dt) => this.tick(dt));

        // Auto-save on hide, Catch-Up on return — Spiel läuft im Hintergrund
        // weiter (setInterval), hier werden nur suspendierte Zeiträume gutgeschrieben.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this._hiddenAt = Date.now();
                this.persist();
            } else {
                this._handleReturn();
            }
        });
        window.addEventListener('focus', () => this._handleReturn());
        window.addEventListener('beforeunload', () => this.persist());
    }

    init() {
        // Migration: v01 -> v02 — falls v02 leer aber v01 existiert
        let data = this.save.load();
        if (!data) {
            try {
                const legacy = localStorage.getItem('idle_hacker_tycoon_v01');
                if (legacy) {
                    data = JSON.parse(legacy);
                    // Sofort auf neuen Key migrieren (beim nächsten persist)
                }
            } catch {}
        }
        if (data) {
            data = this._migrate(data);
            if (data) this._applyLoadedData(data);
        }
        this.loop.start();
        this.bus.emit('game:initialized', { offlineEarning: this._offlineEarning });
        this.bus.emit('economy:changed', this.economy.snapshot());
    }

    /**
     * Schema-Migration: fehlende schemaVersion gilt als 0, Save von einer
     * neueren Version wird abgelehnt (null).
     * @returns {object|null} migrierte Daten oder null bei Ablehnung
     */
    _migrate(data) {
        let v = Number.isInteger(data.schemaVersion) ? data.schemaVersion : 0;
        if (v > GameConfig.schemaVersion) return null; // zu neu — nicht ladbar
        while (v < GameConfig.schemaVersion) {
            v += 1;
            const migrate = Game.MIGRATIONS[v];
            if (migrate) data = migrate(data);
        }
        data.schemaVersion = GameConfig.schemaVersion;
        return data;
    }

    /** Geladene Daten auf die Systeme anwenden (+ Offline-Ertrag). */
    _applyLoadedData(data) {
        this.economy.load(data.economy);
        this.automation.load(data.automation);
        this.upgrades.load(data.upgrades);
        this.prestige.load(data.prestige);
        this.playtimeSec = data.playtimeSec || 0;
        if (data.savedAt) {
            const elapsedSec = (Date.now() - data.savedAt) / 1000;
            this._grantOffline(elapsedSec, true);
        }
    }

    /**
     * Rückkehr in den Tab: Loop-Zeit resynchronisieren und suspendierte
     * Zeit als Offline-Ertrag gutschreiben.
     */
    _handleReturn() {
        if (!this.loop.running) return;
        this.loop.syncTime();
        if (!this._hiddenAt) return;
        const gapSec = (Date.now() - this._hiddenAt) / 1000;
        this._hiddenAt = null;
        if (gapSec > GameConfig.offlineCatchUpMinSec) {
            this._grantOffline(gapSec, false);
            this.persist();
        }
    }

    /**
     * Offline-/Catch-Up-Ertrag gutschreiben (auf offlineCapHours gedeckelt).
     * @param {number} elapsedSec
     * @param {boolean} isInit - true beim Spielstart, false bei Tab-Rückkehr
     */
    _grantOffline(elapsedSec, isInit) {
        const capped = Math.min(elapsedSec, GameConfig.offlineCapHours * 3600);
        if (capped < GameConfig.offlineCatchUpMinSec) return;
        const perSec = this.automation.getTotalPerSec();
        if (perSec <= 0) return;
        const amount = perSec * capped;
        this.economy.addBits(amount);
        this._offlineEarning += amount;
        this.bus.emit('game:offline', {
            amount,
            seconds: capped,
            capped: elapsedSec > capped,
            isInit,
            total: this._offlineEarning,
        });
    }

    tick(dt) {
        this.playtimeSec += dt;
        this._saveTimer += dt;

        // Passive Einkommen
        const perSec = this.automation.getTotalPerSec();
        if (perSec > 0) {
            this.economy.addBits(perSec * dt);
        }

        if (this._saveTimer >= GameConfig.saveIntervalMs / 1000) {
            this._saveTimer = 0;
            this.persist();
        }

        this.bus.emit('game:tick', { dt, perSec, playtimeSec: this.playtimeSec });
    }

    persist() {
        this.save.save({
            economy: this.economy.serialize(),
            automation: this.automation.serialize(),
            upgrades: this.upgrades.serialize(),
            prestige: this.prestige.serialize(),
            playtimeSec: this.playtimeSec,
        });
    }

    /**
     * Spielstand als JSON-String exportieren (frisch persistiert).
     * @returns {string}
     */
    exportSave() {
        this.persist();
        const data = this.save.load();
        return data ? JSON.stringify(data) : '{}';
    }

    /**
     * Spielstand aus JSON-String importieren (überschreibt aktuellen Fortschritt).
     * @param {string} jsonString
     * @returns {{ok: boolean, reason?: 'parse'|'invalid'|'newer'}}
     */
    importSave(jsonString) {
        let data;
        try {
            data = JSON.parse(jsonString);
        } catch {
            return { ok: false, reason: 'parse' };
        }
        if (!data || typeof data !== 'object' || !data.economy || !data.automation) {
            return { ok: false, reason: 'invalid' };
        }
        if (Number.isInteger(data.schemaVersion) && data.schemaVersion > GameConfig.schemaVersion) {
            return { ok: false, reason: 'newer' };
        }
        data = this._migrate(data);
        if (!data) return { ok: false, reason: 'newer' };

        // Systeme zurücksetzen damit keine Altlasten vom aktuellen Stand übrig bleiben
        this.economy.reset();
        this.automation.reset();
        this.upgrades.reset();
        this.prestige.resetHard();
        this._offlineEarning = 0;

        // Offline-Ertrag des Imports NICHT gutschreiben (sonst export->import farming)
        const savedAt = data.savedAt;
        data.savedAt = null;
        this._applyLoadedData(data);
        data.savedAt = savedAt;

        this.persist();
        return { ok: true };
    }

    /**
     * Prestige (Root-Zugriff): reset Economy/Automation/Upgrades, behält prestige Punkte.
     * @returns {boolean} true bei Erfolg
     */
    doPrestige() {
        const result = this.prestige.commit();
        if (!result) return false;
        // Reset spielrelevante Systeme, aber nicht prestige selbst.
        // Start-Bits aus aktiven Meilensteinen (basieren auf NEUEM Prestige-Stand).
        this.economy.reset(this.prestige.getStartBonus());
        this.automation.reset();
        this.upgrades.reset();
        // Click/Automation hören prestige:changed bereits und setzen Multiplier
        this.bus.emit('game:prestige', result);
        this.bus.emit('economy:changed', this.economy.snapshot());
        this.persist();
        return true;
    }

    reset() {
        this.save.clear();
        // Legacy Key auch löschen
        try { localStorage.removeItem('idle_hacker_tycoon_v01'); } catch {}
        this.economy.reset();
        this.automation.reset();
        this.upgrades.reset();
        this.prestige.resetHard();
        this.playtimeSec = 0;
        this._offlineEarning = 0;
        this._hiddenAt = null;
        this.bus.emit('game:reset', null);
        this.bus.emit('economy:changed', this.economy.snapshot());
    }

    getState() {
        return {
            economy: this.economy.snapshot(),
            perSec: this.automation.getTotalPerSec(),
            playtimeSec: this.playtimeSec,
            offlineEarning: this._offlineEarning,
            prestige: this.prestige.snapshot(),
            clickValue: this.click.getClickValue(),
        };
    }
}
