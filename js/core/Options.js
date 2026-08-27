/**
 * Options — persistente Benutzeroptionen (unabhängig vom Spielstand).
 * Bewusst separates localStorage-Key: Save-Format bleibt unberührt.
 */
const KEY = 'idle_hacker_options';

const DEFAULTS = {
    haptics: true,          // Vibration bei Klicks/Käufen
    offlineEarnings: true,  // Offline-/Catch-Up-Ertrag gutschreiben
    username: '',           // Hacker-Name für Rangliste
    sound: true,            // WebAudio Feedback
};

class _Options {
    constructor() {
        this._cache = null;
    }

    _load() {
        if (this._cache) return this._cache;
        try {
            const raw = localStorage.getItem(KEY);
            this._cache = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
        } catch {
            this._cache = { ...DEFAULTS };
        }
        return this._cache;
    }

    /** @returns {boolean|number|string} Wert der Option (Default falls unbekannt) */
    get(key) {
        const v = this._load()[key];
        return v !== undefined ? v : DEFAULTS[key];
    }

    set(key, value) {
        const data = this._load();
        data[key] = value;
        this._cache = data;
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
    }
}

export const Options = new _Options();
