/**
 * InstallHandler — fängt den browser-internen PWA-Installations-Prompt
 * ab und stellt eine eigene install() Methode bereit.
 *
 * Auf iOS Safari gibt es kein beforeinstallprompt — dort wird der
 * manuelle "Teilen → Zum Home-Bildschirm"-Hinweis angezeigt.
 */
export class InstallHandler {
    constructor() {
        /** @type {Event|null} */
        this._deferredPrompt = null;
        this._isInstalled = this._checkInstalled();
        this._canInstall = false;

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this._deferredPrompt = e;
            this._canInstall = true;
        });

        window.addEventListener('appinstalled', () => {
            this._deferredPrompt = null;
            this._canInstall = false;
            this._isInstalled = true;
        });
    }

    _checkInstalled() {
        return window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
    }

    /** App bereits als PWA installiert? */
    get isInstalled() { return this._isInstalled; }

    /** Browser unterstützt Installation + noch nicht installiert? */
    get canInstall() { return this._canInstall && !this._isInstalled; }

    /**
     * Zeigt den Browser-Installations-Dialog an.
     * @returns {Promise<'accepted'|'dismissed'|'unavailable'>}
     */
    async install() {
        if (!this._deferredPrompt) return 'unavailable';
        this._deferredPrompt.prompt();
        const { outcome } = await this._deferredPrompt.userChoice;
        this._deferredPrompt = null;
        this._canInstall = false;
        return outcome === 'accepted' ? 'accepted' : 'dismissed';
    }
}
