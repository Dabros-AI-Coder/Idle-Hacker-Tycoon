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

export class Game {
    constructor() {
        this.bus = new EventBus();
        this.save = new SaveManager(GameConfig.saveKey);
        this.economy = new EconomySystem(this.bus);
        this.click = new ClickSystem(this.bus, this.economy);
        this.automation = new AutomationSystem(this.bus, this.economy);
        this.upgrades = new UpgradeSystem(this.bus, this.economy, this.automation);

        this.playtimeSec = 0;
        this.startTime = performance.now();
        this._saveTimer = 0;
        this._offlineEarning = 0;

        this.loop = new GameLoop(GameConfig.tickRate, (dt) => this.tick(dt));

        // Auto-save on visibility hide
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.persist();
        });
        window.addEventListener('beforeunload', () => this.persist());
    }

    init() {
        const data = this.save.load();
        if (data) {
            this.economy.load(data.economy);
            this.automation.load(data.automation);
            this.upgrades.load(data.upgrades);
            this.playtimeSec = data.playtimeSec || 0;
            // Offline progress
            if (data.savedAt) {
                const elapsedSec = (Date.now() - data.savedAt) / 1000;
                const capped = Math.min(elapsedSec, GameConfig.offlineCapHours * 3600);
                if (capped > 2) {
                    const perSec = this.automation.getTotalPerSec();
                    this._offlineEarning = perSec * capped;
                    if (this._offlineEarning > 0) {
                        this.economy.addBits(this._offlineEarning);
                    }
                }
            }
        }
        this.loop.start();
        this.bus.emit('game:initialized', { offlineEarning: this._offlineEarning });
        this.bus.emit('economy:changed', this.economy.snapshot());
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
            playtimeSec: this.playtimeSec,
        });
    }

    reset() {
        this.save.clear();
        this.economy.reset();
        this.automation.reset();
        this.upgrades.reset();
        this.playtimeSec = 0;
        this._offlineEarning = 0;
        this.bus.emit('game:reset', null);
        this.bus.emit('economy:changed', this.economy.snapshot());
    }

    getState() {
        return {
            economy: this.economy.snapshot(),
            perSec: this.automation.getTotalPerSec(),
            playtimeSec: this.playtimeSec,
            offlineEarning: this._offlineEarning,
        };
    }
}
