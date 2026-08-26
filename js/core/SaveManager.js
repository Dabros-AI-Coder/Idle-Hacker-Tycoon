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
            return JSON.parse(raw);
        } catch (e) {
            console.warn('[SaveManager] load failed', e);
            return null;
        }
    }

    clear() {
        localStorage.removeItem(this.key);
    }

    hasSave() {
        return localStorage.getItem(this.key) !== null;
    }
}
