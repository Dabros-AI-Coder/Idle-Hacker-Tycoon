/**
 * UIManager — verbindet DOM mit Game-Events.
 * Keine Game-Logik, nur Darstellung (OOP: Separation of Concerns).
 */
import { GameConfig } from '../config/GameConfig.js';
import { Formatter } from '../utils/Formatter.js';

export class UIManager {
    /** @param {import('../core/Game.js').Game} game */
    constructor(game) {
        this.game = game;
        this.bus = game.bus;
        this.els = {};
        this._bindElements();
        this._bindEvents();
        this._subscribe();
    }

    _bindElements() {
        const $ = (s) => document.getElementById(s);
        this.els = {
            bits: $('display-bits'),
            perSec: $('display-per-sec'),
            clickValue: $('display-click-value'),
            levelProgress: $('level-progress'),
            levelText: $('level-text'),
            btnHack: $('btn-hack'),
            hackFeedback: $('hack-feedback'),
            generatorsList: $('generators-list'),
            upgradesList: $('upgrades-list'),
            prestigeContent: $('prestige-content'),
            statTotal: $('stat-total-earned'),
            statClicks: $('stat-clicks'),
            statPlaytime: $('stat-playtime'),
            statOffline: $('stat-offline'),
            statPrestigePoints: $('stat-prestige-points'),
            statPrestigeCount: $('stat-prestige-count'),
            btnReset: $('btn-reset'),
            btnExport: $('btn-export'),
            btnImport: $('btn-import'),
            tutorialHint: $('tutorial-hint'),
            tutorialText: $('tutorial-text'),
            btnTutorialSkip: $('btn-tutorial-skip'),
            toastContainer: $('toast-container'),
            tabs: [...document.querySelectorAll('.tab-btn')],
            tabContents: [...document.querySelectorAll('.tab-content')],
        };
    }

    _bindEvents() {
        // Hack Button — touch + click, prevent double-fire
        const hack = (e) => {
            e.preventDefault();
            const value = this.game.click.hack();
            this._spawnFloat(`+${Formatter.formatBits(value)}`);
            // Haptik falls verfügbar
            if (navigator.vibrate) navigator.vibrate(20);
        };
        this.els.btnHack.addEventListener('click', hack);
        this.els.btnHack.addEventListener('touchend', hack, { passive: false });

        // Tabs
        for (const btn of this.els.tabs) {
            btn.addEventListener('click', () => this._switchTab(btn.dataset.tab));
        }

        this.els.btnReset.addEventListener('click', () => {
            if (confirm('Wirklich gesamten Fortschritt löschen?')) {
                this.game.reset();
                this.toast('Fortschritt gelöscht');
                this.renderAll();
            }
        });

        // Spielstand Export / Import
        this.els.btnExport.addEventListener('click', () => this._showSaveModal('export'));
        this.els.btnImport.addEventListener('click', () => this._showSaveModal('import'));

        // Tutorial
        this.els.btnTutorialSkip.addEventListener('click', () => this._finishTutorial(true));

        // Verhindere Zoom bei Doppel-Tap auf iOS (zusätzlich zu viewport)
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) e.preventDefault();
        }, { passive: false });
        let lastTouch = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouch < 300) e.preventDefault();
            lastTouch = now;
        }, { passive: false });
    }

    _subscribe() {
        this.bus.on('economy:changed', () => { this.renderEconomy(); this.renderPrestige(); });
        this.bus.on('click:changed', () => this.renderEconomy());
        this.bus.on('automation:bought', () => this.renderGenerators());
        this.bus.on('upgrade:bought', () => { this.renderUpgrades(); this.renderGenerators(); });
        this.bus.on('prestige:changed', () => { this.renderPrestige(); this.renderEconomy(); this.renderGenerators(); });
        this.bus.on('prestige:committed', ({ gain, multiplier }) => {
            this.toast(`Root-Zugriff! +${gain} Keys · ×${multiplier.toFixed(2)} Multiplikator`);
            this.renderAll();
        });
        this.bus.on('game:prestige', () => this.renderAll());
        this.bus.on('game:tick', () => this.renderTick());
        this.bus.on('game:initialized', () => this.renderAll());
        this.bus.on('game:offline', ({ amount, seconds, capped, isInit }) => {
            if (amount <= 0) return;
            if (isInit) {
                this._showOfflineModal(amount, seconds, capped);
            } else {
                this.toast(`Willkommen zurück! +${Formatter.formatBits(amount)} Bits`);
            }
        });
        this.bus.on('game:reset', () => this.renderAll());
        // Tutorial: bei relevanten Events weiterschalten
        this.bus.on('game:initialized', () => this._initTutorial());
        this.bus.on('click:hacked', () => this._updateTutorial());
        this.bus.on('automation:bought', () => this._updateTutorial());
        this.bus.on('upgrade:bought', () => this._updateTutorial());
        // Update verfügbar (nur als installierte App via UpdateManager onlyStandalone)
        this.bus.on('update:available', ({ remote, current }) => this._showUpdateModal(remote, current));
        this.bus.on('update:pending', () => {
            this.toast('Update bereits angestoßen — neue Version noch nicht am Server. Später erneut prüfen.');
        });
        this.bus.on('update:uptodate', () => { /* silent */ });
    }

    _switchTab(name) {
        for (const b of this.els.tabs) b.classList.toggle('active', b.dataset.tab === name);
        for (const c of this.els.tabContents) c.classList.toggle('active', c.id === `tab-${name}`);
    }

    renderAll() {
        this.renderEconomy();
        this.renderGenerators();
        this.renderUpgrades();
        this.renderPrestige();
        this.renderTick();
    }

    renderEconomy() {
        const snap = this.game.economy.snapshot();
        const perSec = this.game.automation.getTotalPerSec();
        const clickVal = this.game.click.getClickValue();
        this.els.bits.textContent = Formatter.formatBits(snap.bits);
        this.els.bits.title = Formatter.formatFull(snap.bits);
        this.els.perSec.textContent = Formatter.formatPerSec(perSec);
        this.els.clickValue.textContent = Formatter.formatBits(clickVal);

        // Level Bar
        const lvl = this._calcLevel(snap.totalEarned);
        this.els.levelText.textContent = `Lvl ${lvl.level} — ${lvl.name}`;
        this.els.levelProgress.style.width = `${lvl.progress * 100}%`;

        // Affordability aktualisieren ohne kompletten Re-Render
        this._updateAffordability();
    }

    renderTick() {
        this.els.statPlaytime.textContent = Formatter.formatTime(this.game.playtimeSec);
        this.els.statTotal.textContent = Formatter.formatFull(this.game.economy.totalEarned);
        this.els.statClicks.textContent = Formatter.formatFull(this.game.economy.totalClicks);
        this.els.statOffline.textContent = Formatter.formatBits(this.game.getState().offlineEarning);
        if (this.els.statPrestigePoints) this.els.statPrestigePoints.textContent = String(this.game.prestige.points);
        if (this.els.statPrestigeCount) this.els.statPrestigeCount.textContent = String(this.game.prestige.totalPrestiges);
        // Prestige Fortschritt live ticken
        if (this.els.prestigeContent && document.getElementById('tab-prestige')?.classList.contains('active')) {
            // Nur wenn Tab sichtbar, sonst alle 1s via economy:changed
            this.renderPrestige();
        }
    }

    renderPrestige() {
        if (!this.els.prestigeContent) return;
        const snap = this.game.prestige.snapshot();
        const total = this.game.economy.totalEarned;
        const threshold = GameConfig.prestige.threshold;
        const progress = Math.min(1, total / threshold);
        const pending = snap.pendingGain;
        const nextMult = 1 + (snap.points + pending) * GameConfig.prestige.multiplierPerPoint;
        const can = snap.canPrestige;

        const fmt = (n) => Formatter.formatBits(n);
        this.els.prestigeContent.innerHTML = `
            <div class="prestige-card">
                <div class="prestige-hero">
                    <div class="prestige-icon">🔑</div>
                    <div class="prestige-hero-text">
                        <h3>Root-Zugriff</h3>
                        <p>Setze dein Netzwerk zurück und erhalte <strong>Root-Keys</strong>.<br>Jeder Key gibt <strong>+${(GameConfig.prestige.multiplierPerPoint*100).toFixed(0)}% global</strong> auf Klick &amp; Server.</p>
                    </div>
                </div>
                <div class="prestige-stats">
                    <div class="prestige-stat"><span>Root-Keys</span><strong>${snap.points}</strong></div>
                    <div class="prestige-stat"><span>Multiplikator</span><strong class="accent">×${snap.multiplier.toFixed(2)}</strong></div>
                    <div class="prestige-stat"><span>Nächste Keys</span><strong>+${pending}</strong></div>
                </div>
                <div class="prestige-progress">
                    <div class="prestige-progress-label"><span>Fortschritt</span><strong>${fmt(total)} / ${fmt(threshold)}</strong></div>
                    <div class="prestige-bar"><div class="prestige-bar-fill" style="width:${(progress*100).toFixed(1)}%"></div></div>
                </div>
                <div class="prestige-hint">
                    ${can ? `Bereit! Du erhältst <strong>+${pending} Keys</strong> → nächster Multiplikator <strong>×${nextMult.toFixed(2)}</strong>.` : `Sammle <strong>${fmt(Math.max(0, threshold - total))} Bits</strong> mehr (total) um Root-Zugriff freizuschalten.`}
                    <br><span style="color:var(--text-dim)">Reset setzt Bits, Server &amp; Upgrades zurück — Root-Keys bleiben.</span>
                </div>
                ${this._renderMilestones(snap)}
                <button id="btn-prestige" class="btn-prestige ${can ? 'ready' : ''}" ${can ? '' : 'disabled'}>
                    ${can ? `ROOT-ZUGRIFF — +${pending} Keys freischalten` : `Gesperrt — ${fmt(threshold)} benötigt`}
                </button>
            </div>
        `;
        const btn = document.getElementById('btn-prestige');
        if (btn) {
            btn.addEventListener('click', () => {
                if (!this.game.prestige.canPrestige()) return;
                this._showPrestigeModal(pending, nextMult);
            });
        }
    }

    /** Meilenstein-Liste für den Prestige-Tab */
    _renderMilestones(snap) {
        const all = GameConfig.prestige.milestones;
        if (!all || all.length === 0) return '';
        const activeIds = new Set(snap.activeMilestones.map(m => m.prestiges));
        const items = all.map(m => {
            const done = activeIds.has(m.prestiges);
            return `<div class="milestone ${done ? 'done' : ''}">
                <span class="milestone-icon">${done ? m.icon : '🔒'}</span>
                <div class="milestone-info">
                    <div class="milestone-name">${m.name}</div>
                    <div class="milestone-desc">${m.description}</div>
                </div>
                <span class="milestone-count">${done ? '✓' : `${snap.totalPrestiges}/${m.prestiges}`}</span>
            </div>`;
        }).join('');
        return `<div class="prestige-milestones"><h4>Meilensteine</h4>${items}</div>`;
    }

    _showPrestigeModal(pending, nextMult) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <h3>Root-Zugriff bestätigen?</h3>
                <p>Du erhältst <strong>+${pending} Root-Keys</strong> und startest neu.<br>
                Neuer Multiplikator: <strong>×${nextMult.toFixed(2)}</strong>.<br>
                Alle Bits, Server und Upgrades werden zurückgesetzt.</p>
                <div class="modal-actions">
                    <button class="btn-modal secondary" data-action="cancel">Abbrechen</button>
                    <button class="btn-modal primary" data-action="confirm">Bestätigen</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('[data-action="cancel"]').addEventListener('click', close);
        overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
            const ok = this.game.doPrestige();
            close();
            if (ok && navigator.vibrate) navigator.vibrate([20, 30, 20]);
        });
    }

    // === Tutorial (nur für neue Spieler) ===

    _loadTutorialFlag() {
        try { return localStorage.getItem('idle_hacker_tutorial_done') === '1'; } catch { return true; }
    }
    _saveTutorialFlag() {
        try { localStorage.setItem('idle_hacker_tutorial_done', '1'); } catch {}
    }

    _initTutorial() {
        this._tutorialDone = this._loadTutorialFlag();
        // Bestehende Spieler überspringen den Tutorial automatisch
        if (!this._tutorialDone && this._hasRealProgress()) {
            this._finishTutorial(false);
            return;
        }
        this._updateTutorial();
    }

    _hasRealProgress() {
        const g = this.game;
        return g.economy.totalClicks > 15
            || g.automation.getAllStates().some(s => s.owned > 0)
            || g.upgrades.purchased.size > 0
            || g.prestige.totalPrestiges > 0;
    }

    /** @returns {{id:string, text:string, done:()=>boolean}[]} */
    _tutorialSteps() {
        return [
            {
                id: 'hack',
                text: '<strong>👆 Tippe HACK</strong>, um deine ersten Bits zu sammeln!',
                done: () => this.game.economy.totalClicks >= 5,
            },
            {
                id: 'first_server',
                text: '<strong>💻 Stark!</strong> Kaufe jetzt einen <strong>Script Kiddie</strong> — dein Netzwerk arbeitet für dich.',
                done: () => this.game.automation.getOwned('script_kiddie') > 0,
            },
            {
                id: 'idle_loop',
                text: '<strong>⚡ Läuft!</strong> Deine Server verdienen jetzt <strong>Bits/sec</strong> — auch offline. Im <strong>Upgrades</strong>-Tab gibt\'s Boosts.',
                done: () => this.game.upgrades.purchased.size > 0,
                optional: true,
            },
        ];
    }

    _updateTutorial() {
        if (!this._tutorialDone) {
            const steps = this._tutorialSteps();
            const current = steps.find(s => !s.done());
            if (!current) {
                this._finishTutorial(false);
                return;
            }
            this.els.tutorialText.innerHTML = current.text;
            this.els.tutorialHint.classList.remove('hidden');
        }
    }

    _finishTutorial(manual) {
        if (this._tutorialDone) return;
        this._tutorialDone = true;
        this._saveTutorialFlag();
        this.els.tutorialHint.classList.add('hidden');
        if (manual) this.toast('Tutorial übersprungen');
    }

    /**
     * Export/Import-Modal. Beim Export ist die Textarea mit dem Save-JSON
     * gefüllt (Kopieren-Button), beim Import leer (Einfügen + Laden).
     */
    _showSaveModal(mode) {
        const isExport = mode === 'export';
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal save-modal">
                <h3>${isExport ? '💾 Spielstand exportieren' : '📥 Spielstand importieren'}</h3>
                <p>${isExport
                    ? 'Kopiere dir diesen Code und bewahre ihn sicher auf.'
                    : 'Füge hier deinen Spielstand-Code ein.<br><strong>Achtung:</strong> Überschreibt den aktuellen Fortschritt.'}</p>
                <textarea class="save-textarea" spellcheck="false" placeholder="${isExport ? '' : '{ ... }'}"></textarea>
                <div class="modal-actions">
                    <button class="btn-modal secondary" data-action="cancel">Schließen</button>
                    ${isExport
                        ? '<button class="btn-modal primary" data-action="copy">Kopieren</button>'
                        : '<button class="btn-modal primary" data-action="load">Laden</button>'}
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const textarea = overlay.querySelector('.save-textarea');
        const close = () => overlay.remove();
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('[data-action="cancel"]').addEventListener('click', close);

        if (isExport) {
            textarea.value = this.game.exportSave();
            overlay.querySelector('[data-action="copy"]').addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(textarea.value);
                } catch {
                    textarea.select();
                    document.execCommand('copy'); // Fallback (Standalone/HTTP)
                }
                this.toast('Spielstand kopiert!');
                if (navigator.vibrate) navigator.vibrate(15);
            });
        } else {
            overlay.querySelector('[data-action="load"]').addEventListener('click', () => {
                const text = textarea.value.trim();
                if (!text) return;
                if (!confirm('Aktuellen Fortschritt mit dem eingefügten Spielstand überschreiben?')) return;
                const result = this.game.importSave(text);
                if (result.ok) {
                    close();
                    this.renderAll();
                    this.toast('Spielstand geladen!');
                    if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
                } else {
                    const msg = result.reason === 'parse' ? 'Ungültiges JSON.'
                        : result.reason === 'newer' ? 'Spielstand stammt von einer neueren Version.'
                        : 'Kein gültiger Spielstand.';
                    this.toast(`Import fehlgeschlagen: ${msg}`);
                }
            });
        }
    }

    _showOfflineModal(amount, seconds, capped) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        const capNote = capped
            ? `<br><span style="color:var(--text-dim)">Ertrag auf ${GameConfig.offlineCapHours}h Offline-Limit gedeckelt.</span>`
            : '';
        overlay.innerHTML = `
            <div class="modal offline-modal">
                <h3><span class="update-icon">💤</span> Willkommen zurück!</h3>
                <p>Dein Netzwerk hat weitergemined, während du weg warst:</p>
                <div class="offline-summary">
                    <div class="server-kpi"><span>Offline-Zeit</span><strong>${Formatter.formatTime(seconds)}</strong></div>
                    <div class="server-kpi"><span>Erhaltene Bits</span><strong class="accent">+${Formatter.formatBits(amount)}</strong></div>
                </div>${capNote}
                <div class="modal-actions">
                    <button class="btn-modal primary" data-action="collect">Einsammeln</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const close = () => {
            overlay.remove();
            if (navigator.vibrate) navigator.vibrate(20);
        };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('[data-action="collect"]').addEventListener('click', close);
    }

    _showUpdateModal(remote, current) {
        // Verhindere Doppel-Popup
        if (document.querySelector('.modal.update-modal')) return;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal update-modal">
                <h3><span class="update-icon">↻</span> Update verfügbar</h3>
                <p>Neue Version <strong>${remote}</strong> verfügbar.<br>
                Installiert: <strong>${current}</strong><br>
                Tippe <strong>Aktualisieren</strong> um neu zu laden — dein Spielstand bleibt erhalten.</p>
                <div class="modal-actions">
                    <button class="btn-modal secondary" data-action="later">Später</button>
                    <button class="btn-modal primary update" data-action="update">Aktualisieren</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const close = (dismissVersion = null) => {
            overlay.remove();
            if (dismissVersion && this.game.updateManager) {
                this.game.updateManager.dismiss(dismissVersion);
            }
        };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(remote); });
        overlay.querySelector('[data-action="later"]').addEventListener('click', () => close(remote));
        overlay.querySelector('[data-action="update"]').addEventListener('click', () => {
            if (this.game.updateManager) this.game.updateManager.applyUpdate(remote);
            else window.location.reload();
            if (navigator.vibrate) navigator.vibrate(20);
        });
    }

    renderGenerators() {
        const states = this.game.automation.getAllStates();
        const totalPerSec = this.game.automation.getTotalPerSec();
        const totalOwned = states.reduce((a, s) => a + s.owned, 0);
        const bits = this.game.economy.bits;

        // --- Overview Header ---
        const kpiTotal = Formatter.formatBits(totalPerSec);
        const kpiNodes = totalOwned;
        const nextAffordable = states.find(s => !s.canAfford);
        const nextHint = nextAffordable ? `${nextAffordable.def.name} in ${Formatter.formatBits(Math.max(0, nextAffordable.cost - bits))} Bits` : 'Alle Server verfügbar';

        const rackHtml = states.map(s => {
            const active = s.owned > 0;
            return `<div class="rack-unit ${active ? 'active' : 'inactive'}">
                <div class="led"></div>
                <span class="rack-label">${s.def.name.split(' ')[0]}</span>
                <span class="rack-count">x${s.owned}</span>
            </div>`;
        }).join('');

        const terminalLine = totalOwned === 0
            ? 'Bereit für ersten Exploit... Tippe HACK um Bits zu sammeln.'
            : totalPerSec === 0
                ? 'Initialisiere Knoten...'
                : `Mining ${Formatter.formatPerSec(totalPerSec)} Bits/sec · ${totalOwned} Knoten online · Uptime ${Formatter.formatTime(this.game.playtimeSec)}`;

        // --- Generator Items ---
        const itemsHtml = states.map((s, idx) => {
            const share = totalPerSec > 0 ? (s.perSec / totalPerSec) * 100 : 0;
            const tierLabel = `T${idx + 1}`;
            const roi = s.def.basePerSec > 0 ? (s.cost / (s.def.basePerSec * (this.game.automation.genMultipliers.get(s.def.id) || 1) * this.game.automation.globalMultiplier)) : 0;
            const roiText = s.owned === 0 && s.def.basePerSec > 0 ? ` · Amortisation ~${Math.ceil(roi)}s` : '';
            return `
            <div class="item ${s.canAfford ? 'can-afford' : ''}" data-id="${s.def.id}">
                <div class="item-icon">${s.def.icon}</div>
                <div class="item-info">
                    <div class="item-name">${s.def.name}<span class="item-tier">${tierLabel}</span></div>
                    <div class="item-desc">${s.def.description}</div>
                    <div class="item-meta">${Formatter.formatPerSec(s.def.basePerSec)} Bits/sec pro Einheit${roiText}</div>
                    <div class="item-footer"><span class="share">${share.toFixed(1)}% Output</span> · ${Formatter.formatBits(s.perSec)} /sec total</div>
                    <div class="item-progress" title="Anteil am Gesamt-Output"><div class="item-progress-fill" style="width:${share.toFixed(1)}%"></div></div>
                </div>
                <div class="item-owned">x${s.owned}</div>
                <button class="btn-buy" data-buy="${s.def.id}" ${s.canAfford ? '' : 'disabled'}>
                    ${Formatter.formatBits(s.cost)} Bits
                </button>
            </div>`;
        }).join('');

        const emptyHint = totalOwned === 0 ? `<div class="server-empty">🛰️ <strong>Dein Netzwerk ist offline.</strong><br>Starte mit <strong>Script Kiddie</strong> (15 Bits) — der erste Knoten öffnet den Idle-Ertrag.</div>` : '';

        this.els.generatorsList.innerHTML = `
            <div class="server-overview">
                <div class="server-overview-head">
                    <div class="server-overview-title"><span class="dot"></span> Hacker-Netzwerk</div>
                    <span class="server-overview-sub">${totalOwned === 0 ? 'OFFLINE' : 'ONLINE · ' + kpiNodes + ' Knoten'}</span>
                </div>
                <div class="server-kpi-grid">
                    <div class="server-kpi"><span>Knoten</span><strong>${kpiNodes}</strong></div>
                    <div class="server-kpi"><span>Leistung</span><strong>${kpiTotal} <small>/sec</small></strong></div>
                    <div class="server-kpi"><span>Nächstes Ziel</span><strong style="font-size:0.72rem">${nextHint}</strong></div>
                </div>
                <div class="server-rack">${rackHtml}</div>
                <div class="server-terminal">${terminalLine}</div>
            </div>
            ${emptyHint}
            ${itemsHtml}
        `;

        for (const btn of this.els.generatorsList.querySelectorAll('[data-buy]')) {
            btn.addEventListener('click', () => {
                const ok = this.game.automation.buy(btn.dataset.buy);
                if (!ok) this.toast('Nicht genug Bits!');
                else if (navigator.vibrate) navigator.vibrate(10);
            });
        }
        this.renderEconomy();
    }

    renderUpgrades() {
        const states = this.game.upgrades.getAllStates();
        // Sort: verfügbar zuerst, dann gesperrt, gekauft zuletzt
        states.sort((a, b) => {
            if (a.purchased !== b.purchased) return a.purchased ? 1 : -1;
            if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
            return 0;
        });

        if (states.length === 0) {
            this.els.upgradesList.innerHTML = `<p style="color:var(--text-dim);text-align:center;padding:16px;">Keine Upgrades verfügbar</p>`;
            return;
        }

        this.els.upgradesList.innerHTML = states.map(s => {
            const locked = !s.unlocked;
            const owned = s.purchased;
            return `
            <div class="item ${owned ? 'upgrade-owned' : ''} ${s.canAfford && !owned ? 'can-afford' : ''}" style="${locked ? 'opacity:0.45' : ''}">
                <div class="item-icon">${s.def.icon}</div>
                <div class="item-info">
                    <div class="item-name">${s.def.name} ${owned ? '✓' : ''} ${locked ? '🔒' : ''}</div>
                    <div class="item-desc">${s.def.description}</div>
                    <div class="item-meta">${owned ? 'Gekauft' : locked ? `Benötigt: ${GameConfig.getUpgrade(s.def.requires)?.name ?? s.def.requires}` : `${Formatter.formatBits(s.def.cost)} Bits`}</div>
                </div>
                <button class="btn-buy" data-upgrade="${s.def.id}" ${owned || locked || !s.canAfford ? 'disabled' : ''}>
                    ${owned ? 'Erworben' : locked ? 'Gesperrt' : 'Kaufen'}
                </button>
            </div>`;
        }).join('');

        for (const btn of this.els.upgradesList.querySelectorAll('[data-upgrade]')) {
            btn.addEventListener('click', () => {
                const ok = this.game.upgrades.buy(btn.dataset.upgrade);
                if (ok) {
                    this.toast('Upgrade erworben!');
                    if (navigator.vibrate) navigator.vibrate(15);
                }
            });
        }
    }

    _updateAffordability() {
        // Buttons disablen/enablen ohne kompletten Neuaufbau — für 60fps freundlich
        const bits = this.game.economy.bits;
        for (const el of this.els.generatorsList.querySelectorAll('.item')) {
            const id = el.dataset.id;
            const cost = this.game.automation.getCost(id);
            const can = bits >= cost;
            el.classList.toggle('can-afford', can);
            const btn = el.querySelector('.btn-buy');
            if (btn) btn.disabled = !can;
        }
    }

    _calcLevel(totalEarned) {
        const th = GameConfig.levelThresholds;
        const names = GameConfig.levelNames;
        let level = 1;
        for (let i = th.length - 1; i >= 0; i--) {
            if (totalEarned >= th[i]) { level = i + 1; break; }
        }
        const cur = th[level - 1] ?? 0;
        const next = th[level] ?? cur * 2;
        const progress = next === cur ? 1 : Math.min(1, (totalEarned - cur) / (next - cur));
        return { level, name: names[level - 1] ?? names[names.length - 1], progress };
    }

    _spawnFloat(text) {
        const el = document.createElement('span');
        el.className = 'float-text';
        // leichter Random-Offset für mehrere schnelle Klicks
        const rx = (Math.random() - 0.5) * 60;
        el.style.left = `calc(50% + ${rx}px)`;
        el.textContent = text;
        this.els.hackFeedback.appendChild(el);
        el.addEventListener('animationend', () => el.remove());
    }

    toast(msg) {
        const el = document.createElement('div');
        el.className = 'toast';
        el.textContent = msg;
        this.els.toastContainer.appendChild(el);
        setTimeout(() => el.remove(), 2600);
    }
}
