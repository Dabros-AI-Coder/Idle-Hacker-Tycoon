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
import { AchievementSystem } from '../systems/AchievementSystem.js';
import { DailyRewardSystem } from '../systems/DailyRewardSystem.js';
import { Options } from './Options.js';

export class Game {
    /**
     * Schema-Migrationen: key = Ziel-Version, value = (data) => data.
     * Bei schemaVersion-Erhöhung in GameConfig hier die Funktion ergänzen.
     */
    static MIGRATIONS = {
    };

    constructor() {
        this.bus = new EventBus();
        this.save = new SaveManager(GameConfig.saveKey, GameConfig.schemaVersion);
        this.economy = new EconomySystem(this.bus);
        this.click = new ClickSystem(this.bus, this.economy);
        this.automation = new AutomationSystem(this.bus, this.economy);
        this.upgrades = new UpgradeSystem(this.bus, this.economy, this.automation);
        this.prestige = new PrestigeSystem(this.bus, this.economy);
        this.achievements = new AchievementSystem(this.bus, this);
        this.daily = new DailyRewardSystem(this.bus, this);

        this.playtimeSec = 0;
        this._saveTimer = 0;
        this._offlineEarning = 0;
        this._hiddenAt = null;
        this.offlineCapMultiplier = 1;
        this._pendingOffline = null; // für Willkommen-zurück mit Bestätigen
        /** true sobald init() gelaufen ist (erst dann darf persistiert werden) */
        this.initialized = false;

        // Offline-Cap-Multiplikator via Upgrades
        this.bus.on('upgrade:applied', ({ effect }) => {
            if (effect.type === 'offline_cap_mult') {
                this.offlineCapMultiplier *= effect.value;
            }
        });
        // Achievements live prüfen
        this.bus.on('economy:changed', () => this.achievements.check());
        this.bus.on('automation:bought', () => this.achievements.check());
        this.bus.on('upgrade:bought', () => this.achievements.check());
        this.bus.on('prestige:changed', () => this.achievements.check());
        this.bus.on('game:initialized', () => this.achievements.check());

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
        if (this.initialized) return;
        let data = this.save.load();
        const raw = this.save.loadRaw();
        const hasRaw = typeof raw === 'string' && raw.length > 0;
        // Korruption: raw da aber load null → ungültiges JSON/Shape
        if (hasRaw && !data) {
            this.bus.emit('save:corrupted', { key: this.save.key, raw });
            // Nicht crashen — frisch starten, User entscheidet via UI ob Reset
        }
        if (!data) {
            try {
                const legacy = localStorage.getItem('idle_hacker_tycoon_v01');
                if (legacy) {
                    const parsed = JSON.parse(legacy);
                    if (parsed && parsed.economy && parsed.automation) data = parsed;
                }
            } catch {}
        }
        if (data) {
            const migrated = this._migrate(data);
            if (migrated) {
                try {
                    this._applyLoadedData(migrated);
                } catch (e) {
                    console.warn('[Game] _applyLoadedData failed', e);
                    this.bus.emit('save:corrupted', { key: this.save.key, error: String(e) });
                }
            } else {
                // Zu neu — Save von neuerer Version
                this.bus.emit('save:newer', { key: this.save.key, version: data.schemaVersion });
            }
        }
        this.initialized = true;
        this.bus.emit('game:initialized', { offlineEarning: this._offlineEarning });
        this.bus.emit('economy:changed', this.economy.snapshot());
    }

    /** Spiel-Loop starten (vom Hauptmenü via "Spielen"). */
    start() {
        this.loop.start();
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
        try { this.economy.load(data.economy); } catch (e) { console.warn('[Game] economy load failed', e); }
        try { this.automation.load(data.automation); } catch (e) { console.warn('[Game] automation load failed', e); }
        try { this.upgrades.load(data.upgrades); } catch (e) { console.warn('[Game] upgrades load failed', e); }
        try { this.prestige.load(data.prestige); } catch (e) { console.warn('[Game] prestige load failed', e); }
        try { this.achievements.load(data.achievements); } catch (e) { console.warn('[Game] achievements load failed', e); }
        try { this.daily.load(data.daily); } catch (e) { console.warn('[Game] daily load failed', e); }
        this.playtimeSec = Number.isFinite(data.playtimeSec) ? data.playtimeSec : 0;
        this.offlineCapMultiplier = Number.isFinite(data.offlineCapMultiplier) ? data.offlineCapMultiplier : 1;
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
     * Offline-/Catch-Up-Ertrag (auf offlineCapHours gedeckelt).
     * isInit=true: erst ab 2 Min (120s) und Guthaben erst nach Bestätigen.
     * isInit=false (Tab-Rückkehr): sofort wie bisher ab 10s.
     * @param {number} elapsedSec
     * @param {boolean} isInit - true beim Spielstart, false bei Tab-Rückkehr
     */
    _grantOffline(elapsedSec, isInit) {
        if (!Options.get('offlineEarnings')) return;
        const maxHours = GameConfig.offlineCapHours * this.offlineCapMultiplier;
        const capped = Math.min(elapsedSec, maxHours * 3600);
        const threshold = isInit ? 120 : GameConfig.offlineCatchUpMinSec;
        if (capped < threshold) return;
        const perSec = this.automation.getTotalPerSec();
        if (perSec <= 0) return;
        const amount = perSec * capped;
        if (isInit) {
            // Guthaben erst nach Bestätigen im Willkommen-Popup
            this._pendingOffline = { amount, seconds: capped, perSec, capped: elapsedSec > capped };
            this.bus.emit('game:offline', {
                amount,
                seconds: capped,
                perSec,
                capped: elapsedSec > capped,
                isInit,
                pending: true,
                total: this._offlineEarning,
            });
            return;
        }
        this.economy.addBits(amount);
        this._offlineEarning += amount;
        this.bus.emit('game:offline', {
            amount,
            seconds: capped,
            perSec,
            capped: elapsedSec > capped,
            isInit,
            total: this._offlineEarning,
        });
    }

    /** Vom Willkommen-Popup nach Bestätigen aufrufen — addiert Offline-Ertrag. */
    claimPendingOffline() {
        if (!this._pendingOffline) return null;
        const { amount } = this._pendingOffline;
        this.economy.addBits(amount);
        this._offlineEarning += amount;
        const claimed = this._pendingOffline;
        this._pendingOffline = null;
        this.bus.emit('economy:changed', this.economy.snapshot());
        this.persist();
        return claimed;
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
        if (!this.initialized) return;
        this.save.save({
            economy: this.economy.serialize(),
            automation: this.automation.serialize(),
            upgrades: this.upgrades.serialize(),
            prestige: this.prestige.serialize(),
            achievements: this.achievements.serialize(),
            daily: this.daily.serialize(),
            playtimeSec: this.playtimeSec,
            offlineCapMultiplier: this.offlineCapMultiplier,
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

        this.economy.reset();
        this.automation.reset();
        this.upgrades.reset();
        this.prestige.resetHard();
        this.achievements.reset();
        this.daily.reset();
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
        try { localStorage.removeItem('idle_hacker_tycoon_v01'); } catch {}
        this.economy.reset();
        this.automation.reset();
        this.upgrades.reset();
        this.prestige.resetHard();
        this.achievements.reset();
        this.daily.reset();
        this.playtimeSec = 0;
        this._offlineEarning = 0;
        this._hiddenAt = null;
        this.offlineCapMultiplier = 1;
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

    /**
     * Liefert NPC-Liste mit dynamisch skalierten Werten (Gummiband).
     * Prestige + Bits der NPCs wachsen mit Spieler-Fortschritt, damit Platz 1
     * nie dauerhaft sicher ist. Basis bleibt in npcLeaderboard, Effektivwerte
     * werden live berechnet. Für beide Modi: All-Time (totalEarned) und Aktuell (bits).
     * @param {Array} baseList
     * @returns {Array<{name,prestigest,totalBits,level,effectivePrestige,effectiveBits,effectiveCurrentBits}>}
     */
    getEffectiveNpcLeaderboard(baseList = []) {
        const own = this.getState();
        const p = own.prestige.totalPrestiges;
        const earned = own.economy.totalEarned;
        const current = own.economy.bits;
        return baseList.map(npc => {
            const prestigeBoost = Math.floor(p * 0.32);
            const effectivePrestige = npc.prestigest + prestigeBoost;
            const effectiveBits = Math.floor(
                npc.totalBits * (1 + p * 0.12) + earned * 0.18
            );
            // Aktuell: NPCs halten ~60% ihrer All-Time als "Kontostand", skaliert mit Prestige + Spieler-Current
            const effectiveCurrentBits = Math.floor(
                npc.totalBits * 0.62 * (1 + p * 0.08) + current * 0.22
            );
            return { ...npc, effectivePrestige, effectiveBits, effectiveCurrentBits };
        });
    }

    /** Berechnet die eigene Position in der NPC-Rangliste (1-20) — dynamisch. */
    getNpcLeaderboardPosition(npcData = [], mode = 'alltime') {
        const own = this.getState();
        const base = npcData.length > 0 ? npcData : (GameConfig.npcLeaderboard || []);
        const effective = this.getEffectiveNpcLeaderboard(base);
        const isCurrent = mode === 'current';
        const sorted = [...effective].sort((a, b) => {
            if (isCurrent) return b.effectiveCurrentBits - a.effectiveCurrentBits;
            if (b.effectivePrestige !== a.effectivePrestige) return b.effectivePrestige - a.effectivePrestige;
            return b.effectiveBits - a.effectiveBits;
        });
        let position = sorted.length + 1;
        for (let i = 0; i < sorted.length; i++) {
            if (isCurrent) {
                if (own.economy.bits > sorted[i].effectiveCurrentBits) { position = i + 1; break; }
            } else {
                if (own.prestige.totalPrestiges > sorted[i].effectivePrestige ||
                    (own.prestige.totalPrestiges === sorted[i].effectivePrestige &&
                     own.economy.totalEarned > sorted[i].effectiveBits)) {
                    position = i + 1; break;
                }
            }
        }
        return position;
    }
}
