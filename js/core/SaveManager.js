/**
 * SaveManager — persistiert Spielstand in localStorage.
 * Der Payload enthält immer schemaVersion + savedAt (für Migration & Offline-Ertrag).
 */
export class SaveManager {
    /**
     * @param {string} key - localStorage-Key
     * @param {number} schemaVersion
     */
    constructor(key, schemaVersion = 1) {
        this.key = key;
        this.schemaVersion = schemaVersion;
    }

    save(state) {
        try {
            const payload = {
                ...state,
                schemaVersion: this.schemaVersion,
                savedAt: Date.now(),
            };
            localStorage.setItem(this.key, JSON.stringify(payload));
            return true;
        } catch (e) {
            console.warn('[SaveManager] save failed', e);
            return false;
        }
    }

    load() {
        try {
            const raw = localStorage.getItem(this.key);
            if (!raw) return null;
            const data = JSON.parse(raw);
            // Basis-Validierung: erwartete Top-Level Keys
            if (!data || typeof data !== 'object' || !data.economy || !data.automation) {
                console.warn('[SaveManager] load: invalid shape', data);
                return null;
            }
            return data;
        } catch (e) {
            console.warn('[SaveManager] load failed', e);
            return null;
        }
    }

    /** Liefert Roh-String für Korruptions-Erkennung (null wenn kein Save). */
    loadRaw() {
        try { return localStorage.getItem(this.key); } catch { return null; }
    }

    /** True wenn raw existiert aber load() null liefert (korrupt/ungültig). */
    isCorrupted() {
        const raw = this.loadRaw();
        if (!raw) return false;
        return this.load() === null;
    }

    clear() {
        try { localStorage.removeItem(this.key); } catch { /* ignore */ }
    }
}
