/**
 * MainMenu — Hauptmenü-Screen mit Spielen / Optionen / Beenden.
 * Das Spiel wird erst bei "Spielen" initialisiert & gestartet
 * (Offline-Ertrag und Save-Load passieren dann, nicht beim Menü-Aufbau).
 */
import { GameConfig } from '../config/GameConfig.js';
import { Options } from '../core/Options.js';
import { InstallHandler } from '../core/InstallHandler.js';
import { haptic } from '../utils/haptics.js';

export class MainMenu {
    /** @param {import('../core/Game.js').Game} game */
    constructor(game) {
        this.game = game;
        this.el = document.getElementById('main-menu');
        this.mainPanel = document.getElementById('menu-main');
        this.optionsPanel = document.getElementById('menu-options-panel');
        this.statusEl = document.getElementById('menu-status');
        this.versionEl = document.getElementById('menu-version');

        document.getElementById('menu-play').addEventListener('click', () => this._play());
        document.getElementById('menu-options').addEventListener('click', () => this._showOptions());
        document.getElementById('menu-quit').addEventListener('click', () => this._quit());
        document.getElementById('menu-back').addEventListener('click', () => this._showMain());
        document.getElementById('opt-reset-tutorial').addEventListener('click', () => this._resetTutorial());

        // PWA-Install-Button
        this.installHandler = new InstallHandler();
        this.installBtn = document.getElementById('menu-install');
        if (this.installHandler.canInstall) {
            this.installBtn.classList.remove('hidden');
            this.installBtn.addEventListener('click', () => this._install());
        } else if (this.installHandler.isInstalled) {
            this.installBtn.classList.add('hidden');
        }
        // iOS: manuellen Hinweis zeigen (kein beforeinstallprompt)
        this._iosHint = document.getElementById('menu-ios-hint');
        if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !window.navigator.standalone) {
            if (this._iosHint) this._iosHint.classList.remove('hidden');
        }

        // Optionen initial in die Checkboxen spiegeln
        document.getElementById('opt-haptics').checked = Options.get('haptics');
        document.getElementById('opt-offline').checked = Options.get('offlineEarnings');
        document.getElementById('opt-haptics').addEventListener('change', (e) => {
            Options.set('haptics', e.target.checked);
            haptic(15);
        });
        document.getElementById('opt-offline').addEventListener('change', (e) => {
            Options.set('offlineEarnings', e.target.checked);
        });

        // ESC: zurück ins Hauptmenü-Panel
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.optionsPanel.classList.contains('hidden')) {
                this._showMain();
            }
        });

        this.versionEl.textContent = `v${GameConfig.version}`;
        this.statusEl.textContent = '';
    }

    get isVisible() {
        return !this.el.classList.contains('hidden');
    }

    hide() {
        this.el.classList.add('hidden');
    }

    _setStatus(msg) {
        this.statusEl.textContent = msg || '';
    }

    /** "Spielen": Menü schließen, Spiel initialisieren + Loop starten. */
    _play() {
        haptic(20);
        if (!this.game.initialized) {
            // Lädt den Spielstand, migriert ihn und gewährt Offline-Ertrag
            this.game.init();
        }
        this.game.start();
        this.hide();
    }

    _showOptions() {
        haptic(10);
        this.mainPanel.classList.add('hidden');
        this.optionsPanel.classList.remove('hidden');
        this._setStatus('');
    }

    _showMain() {
        haptic(10);
        this.optionsPanel.classList.add('hidden');
        this.mainPanel.classList.remove('hidden');
    }

    async _install() {
        haptic(20);
        this.installBtn.disabled = true;
        this.installBtn.textContent = '⏳ Wird installiert…';
        const result = await this.installHandler.install();
        if (result === 'accepted') {
            this.installBtn.textContent = '✓ Installiert!';
            this._setStatus('App wird installiert…');
        } else {
            this.installBtn.disabled = false;
            this.installBtn.textContent = '📲  ALS APP INSTALLIEREN';
            if (result === 'unavailable') {
                this._setStatus('Installation nicht verfügbar — nutze den Browser-Teilen-Button.');
            }
        }
    }

    /**
     * "Beenden": Spielstand speichern, Fenster schließen.
     * window.close() funktioniert nur bei skriptgeöffneten Fenstern bzw.
     * manchen PWA-Standalone-Kontexten — sonst Hinweis anzeigen.
     */
    _quit() {
        haptic(15);
        if (!this.game.initialized) {
            // Noch nie gespielt → nichts zu speichern
            this._tryClose();
            return;
        }
        this.game.persist();
        this._tryClose();
    }

    _tryClose() {
        try { window.close(); } catch {}
        // Falls das Schließen blockiert wurde (Browser-Tab): Hinweis statt stiller Fehlfunktion
        setTimeout(() => {
            this._setStatus(this.game.initialized
                ? '✓ Gespeichert — du kannst den Tab jetzt schließen.'
                : 'Du kannst den Tab jetzt schließen.');
        }, 250);
    }

    _resetTutorial() {
        try { localStorage.removeItem('idle_hacker_tutorial_done'); } catch {}
        this._setStatus('✓ Tutorial wird beim nächsten Start gezeigt.');
        haptic(15);
    }
}
