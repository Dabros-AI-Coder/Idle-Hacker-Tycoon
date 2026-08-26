/**
 * UpdateManager — prüft beim Start (besonders als PWA) ob neuere version.json verfügbar ist.
 * Modular via EventBus: emit 'update:available' | 'update:uptodate' | 'update:error'
 */
import { GameConfig } from '../config/GameConfig.js';

export class UpdateManager {
    /**
     * @param {import('./EventBus.js').EventBus} bus
     * @param {string} currentVersion - z.B. GameConfig.version
     * @param {string} versionUrl - Pfad zu version.json
     */
    constructor(bus, currentVersion = GameConfig.version, versionUrl = './version.json') {
        this.bus = bus;
        this.currentVersion = currentVersion;
        this.versionUrl = versionUrl;
        this.lastCheckAt = 0;
        this.cooldownMs = 5 * 60 * 1000; // 5min Cooldown
        this.storageKey = 'idle_hacker_update_dismissed';
        this.appliedKey = 'idle_hacker_update_applied';
        this.pendingWindowMs = 5 * 60 * 1000; // Schleifenschutz-Fenster
    }

    isStandalone() {
        try {
            return window.matchMedia('(display-mode: standalone)').matches
                || window.matchMedia('(display-mode: window-controls-overlay)').matches
                || window.navigator.standalone === true;
        } catch { return false; }
    }

    compareVersions(a, b) {
        // SemVer-ish: "0.3.0" -> [0,3,0]
        const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
        const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
            const av = pa[i] || 0;
            const bv = pb[i] || 0;
            if (av < bv) return -1;
            if (av > bv) return 1;
        }
        return 0;
    }

    async fetchRemoteVersion() {
        const url = `${this.versionUrl}?t=${Date.now()}`;
        const res = await fetch(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data || !data.version) throw new Error('version field missing');
        return String(data.version).trim();
    }

    /**
     * Prüft auf Update. Zeigt nichts an wenn kein Update oder dismissed.
     * @param {{force?:boolean, onlyStandalone?:boolean}} opts
     */
    async check(opts = {}) {
        const { force = false, onlyStandalone = false } = opts;
        const now = Date.now();
        if (!force && now - this.lastCheckAt < this.cooldownMs) return { status: 'cooldown' };
        this.lastCheckAt = now;

        // Wenn onlyStandalone true und nicht standalone -> skip (Popup nur für installierte App)
        if (onlyStandalone && !this.isStandalone()) {
            this.bus.emit('update:skipped', { reason: 'not_standalone' });
            return { status: 'skipped' };
        }

        try {
            const remote = await this.fetchRemoteVersion();
            const cmp = this.compareVersions(this.currentVersion, remote);
            if (cmp < 0) {
                // Bereits in dieser Session dismissed? (Session-only, bei PWA-Neustart erneut fragen)
                const dismissed = (() => { try { return sessionStorage.getItem(this.storageKey); } catch { return null; } })();
                if (!force && dismissed === remote) {
                    this.bus.emit('update:dismissed_cached', { remote, current: this.currentVersion });
                    return { status: 'dismissed', remote };
                }
                // Schleifenschutz: Update wurde kürzlich angestoßen, aber der Server
                // liefert die neue Version noch nicht (CDN/HTTP-Cache) — nicht endlos neu fragen.
                const applied = this._getApplied();
                if (!force && applied && applied.version === remote && now - applied.at < this.pendingWindowMs) {
                    this.bus.emit('update:pending', { remote, current: this.currentVersion });
                    return { status: 'pending', remote };
                }
                this.bus.emit('update:available', { remote, current: this.currentVersion, notes: null });
                return { status: 'available', remote, current: this.currentVersion };
            } else {
                this.bus.emit('update:uptodate', { remote, current: this.currentVersion });
                return { status: 'uptodate', remote };
            }
        } catch (e) {
            this.bus.emit('update:error', { error: String(e.message || e) });
            return { status: 'error', error: e };
        }
    }

    dismiss(version) {
        // Session-only: sessionStorage wird beim Schließen/Neustart der PWA geleert
        try { sessionStorage.setItem(this.storageKey, String(version)); } catch {}
        this.bus.emit('update:dismissed', { version });
    }

    clearDismissed() {
        try { sessionStorage.removeItem(this.storageKey); } catch {}
        try { localStorage.removeItem(this.storageKey); } catch {} // Altlasten aufräumen
    }

    _getApplied() {
        try {
            const raw = localStorage.getItem(this.appliedKey);
            if (!raw) return null;
            const data = JSON.parse(raw);
            return (data && data.version && data.at) ? data : null;
        } catch { return null; }
    }

    /**
     * Update anstoßen: Caches + Service Worker entfernen, dann Hard-Reload.
     * @param {string} remoteVersion - Ziel-Version (für Schleifenschutz)
     */
    async applyUpdate(remoteVersion = '') {
        this.clearDismissed();
        try { localStorage.setItem(this.appliedKey, JSON.stringify({ version: String(remoteVersion || this.currentVersion), at: Date.now() })); } catch {}

        // Alle Caches leeren
        try {
            if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k)));
            }
        } catch {}

        // Alten Service Worker abmelden — der nächste Load registriert
        // die neue sw.js frisch und holt alles aus dem Netz.
        try {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map(r => r.unregister()));
            }
        } catch {}

        // Hard-Reload mit Cache-Bust
        const url = new URL(window.location.href);
        url.searchParams.set('_update', Date.now());
        window.location.href = url.toString();
        // Fallback falls href nicht greift
        setTimeout(() => window.location.reload(), 300);
    }
}
