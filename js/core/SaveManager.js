/**
 * SaveManager — persistiert Spielstand in localStorage.
 */
export class SaveManager {
    /** @param {string} key */
    constructor(key) {
        this.key = key;
    }

    save(state) {
        try {
            const payload = { ...state, savedAt: Date.now() };
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
