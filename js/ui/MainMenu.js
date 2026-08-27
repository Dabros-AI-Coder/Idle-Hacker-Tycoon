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
        document.getElementById('menu-options').addEventListener('click', () => { this._fromGame = false; this._showOptions(); });
        document.getElementById('menu-quit').addEventListener('click', () => this._quit());
        document.getElementById('menu-back').addEventListener('click', () => this._handleBack());
        document.getElementById('opt-reset-tutorial').addEventListener('click', () => this._resetTutorial());
        const toMenuBtn = document.getElementById('btn-to-menu');
        if (toMenuBtn) toMenuBtn.addEventListener('click', () => this._showInGamePopup());

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

        this._fromGame = false; // true wenn Optionen aus In-Game geöffnet wurden
        // ESC: zurück — respektiert _fromGame
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.optionsPanel.classList.contains('hidden')) {
                this._handleBack();
            }
        });

        this.versionEl.textContent = `v${GameConfig.version}`;
        this.statusEl.textContent = '';

        // Username: bei Erststart nach SPIELEN abfragen, hier schon Input im Optionen-Panel spiegeln
        this.usernameInput = document.getElementById('opt-username');
        if (this.usernameInput) {
            this.usernameInput.value = Options.get('username') || '';
            this.usernameInput.addEventListener('change', (e) => {
                const v = this._sanitizeUsername(e.target.value);
                Options.set('username', v);
                e.target.value = v;
                this._setStatus(v ? `✓ Name: ${v}` : 'Name gelöscht');
                haptic(10);
                window.__IDLE_HACKER__?.renderNpcLeaderboard?.();
            });
        }

        // Subtabs in Optionen (Optionen ↔ Statistiken)
        this.menuSubtabs = [...document.querySelectorAll('.menu-subtab')];
        this.menuTabContents = [...document.querySelectorAll('.menu-tab-content')];
        for (const btn of this.menuSubtabs) {
            btn.addEventListener('click', () => this._switchMenuTab(btn.dataset.menuTab));
        }
    }

    get isVisible() {
        return !this.el.classList.contains('hidden');
    }

    hide() {
        this.el.classList.add('hidden');
    }

    show() {
        haptic(10);
        try { this.game.persist(); } catch {}
        try { this.game.loop.stop(); } catch {}
        this._fromGame = false;
        this._showMain();
        this.el.classList.remove('hidden');
    }

    showOptionsFromGame() {
        haptic(10);
        try { this.game.persist(); } catch {}
        try { this.game.loop.stop(); } catch {}
        this._fromGame = true;
        this.mainPanel.classList.add('hidden');
        this.optionsPanel.classList.remove('hidden');
        this._switchMenuTab('options');
        this._setStatus('');
        this.el.classList.remove('hidden');
    }

    _handleBack() {
        if (this._fromGame) {
            // Zurück ins Spiel statt Hauptmenü
            this._fromGame = false;
            this.hide();
            try { this.game.start(); } catch {}
            haptic(10);
        } else {
            this._showMain();
        }
    }

    _showInGamePopup() {
        haptic(10);
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay ingame-menu-overlay';
        overlay.innerHTML = `
            <div class="modal ingame-menu-modal">
                <h3>Menü</h3>
                <div class="menu-panel" style="margin-top:12px;">
                    <button class="menu-btn" data-action="hauptmenu">🏠 Hauptmenü</button>
                    <button class="menu-btn" data-action="optionen">⚙ Optionen</button>
                    <button class="menu-btn" data-action="beenden">⏻ Beenden</button>
                    <button class="btn menu-opt-btn secondary" data-action="close">Weiter spielen</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('[data-action="close"]').addEventListener('click', close);
        overlay.querySelector('[data-action="hauptmenu"]').addEventListener('click', () => { close(); this.show(); });
        overlay.querySelector('[data-action="optionen"]').addEventListener('click', () => { close(); this.showOptionsFromGame(); });
        overlay.querySelector('[data-action="beenden"]').addEventListener('click', () => { close(); this._quit(); });
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
        });
    }

    _setStatus(msg) {
        this.statusEl.textContent = msg || '';
    }

    /** "Spielen": Menü schließen, Spiel initialisieren + Loop starten. */
    _play() {
        haptic(20);
        if (!Options.get('username')) {
            // Über In-Game-Szene legen: erst Spiel starten/hide, dann Popup mit milchigem Blur
            this._doPlay();
            this._promptUsername();
            return;
        }
        this._doPlay();
    }

    _doPlay() {
        this.hide();
        if (!this.game.initialized) {
            this.game.init();
        }
        this.game.start();
    }

    _sanitizeUsername(raw) {
        let v = String(raw || '').trim().replace(/\s+/g, ' ');
        // 2-16 Zeichen, alphanumerisch + _-.
        v = v.slice(0, 16);
        if (v.length > 0 && v.length < 2) v = '';
        if (/[^a-zA-Z0-9_\- äöüÄÖÜß]/.test(v)) v = v.replace(/[^a-zA-Z0-9_\- äöüÄÖÜß]/g, '').trim();
        return v;
    }

    _promptUsername(onDone) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay username-overlay';
        overlay.innerHTML = `
            <div class="modal username-modal">
                <h3>Wie sollen wir dich nennen?</h3>
                <p>Dein Hacker-Name für die fiktive Rangliste. 2–16 Zeichen.</p>
                <input id="username-input" class="username-input" type="text" maxlength="16" placeholder="z. B. ZeroCool" autocomplete="off" spellcheck="false" />
                <p id="username-error" class="username-error hidden"></p>
                <div class="modal-actions">
                    <button class="btn-modal primary" data-action="confirm">Bestätigen</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const input = overlay.querySelector('#username-input');
        const error = overlay.querySelector('#username-error');
        const confirm = overlay.querySelector('[data-action="confirm"]');
        const current = Options.get('username') || '';
        input.value = current;
        setTimeout(() => input.focus(), 80);
        const close = () => overlay.remove();
        const submit = () => {
            const v = this._sanitizeUsername(input.value);
            if (!v || v.length < 2) {
                error.textContent = 'Bitte 2–16 Zeichen eingeben.';
                error.classList.remove('hidden');
                input.focus();
                haptic([10, 20]);
                return;
            }
            Options.set('username', v);
            if (this.usernameInput) this.usernameInput.value = v;
            haptic(20);
            close();
            window.__IDLE_HACKER__?.renderNpcLeaderboard?.();
            if (onDone) onDone();
        };
        confirm.addEventListener('click', submit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) { haptic(10); input.focus(); } });
    }

    _switchMenuTab(name) {
        for (const b of this.menuSubtabs) b.classList.toggle('active', b.dataset.menuTab === name);
        for (const c of this.menuTabContents) c.classList.toggle('active', c.id === `menu-tab-${name}`);
        // hidden-Klasse für Kompatibilität
        for (const c of this.menuTabContents) c.classList.toggle('hidden', c.id !== `menu-tab-${name}`);
        haptic(10);
    }

    _showOptions() {
        haptic(10);
        this.mainPanel.classList.add('hidden');
        this.optionsPanel.classList.remove('hidden');
        this._switchMenuTab('options');
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
