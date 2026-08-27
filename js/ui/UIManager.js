/**
 * UIManager — verbindet DOM mit Game-Events.
 * Keine Game-Logik, nur Darstellung (OOP: Separation of Concerns).
 */
import { GameConfig } from '../config/GameConfig.js';
import { Formatter } from '../utils/Formatter.js';
import { haptic } from '../utils/haptics.js';
import { buildFeedbackUrl } from '../utils/feedback.js';
import { audio } from '../utils/audio.js';
import { HackMinigame } from './HackMinigame.js';

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
            feedbackLink: $('feedback-link'),
            toastContainer: $('toast-container'),
            dailyCard: $('daily-card'),
            achievementsList: $('achievements-list'),
            tabs: [...document.querySelectorAll('.tab-btn')],
            tabContents: [...document.querySelectorAll('.tab-content')],
        };
        this.hackMinigame = new HackMinigame(this.game, this);
    }

    _showMinigameResult(hit, mult) {
        this._spawnFloat(hit ? `★ +${mult}× BONUS!` : 'Miss');
    }

    _bindEvents() {
        const hack = async (e) => {
            e.preventDefault();
            if (this.hackMinigame.active) {
                this.hackMinigame._hit();
                return;
            }
            const pending = this.hackMinigame.onHack();
            if (pending) {
                const mult = await pending;
                const value = this.game.click.hack();
                if (mult > 1) {
                    const bonus = value * (mult - 1);
                    this.game.economy.addBits(bonus);
                    this._spawnFloat(`+${Formatter.formatBits(value * mult)} ★`);
                    haptic([20, 30]); audio.hackMinigameHit();
                } else {
                    this._spawnFloat(`+${Formatter.formatBits(value)}`);
                    haptic(20); audio.click();
                }
                return;
            }
            const value = this.game.click.hack();
            this._spawnFloat(`+${Formatter.formatBits(value)}`);
            haptic(20); audio.click();
        };
        if (this.els.btnHack) {
            this.els.btnHack.addEventListener('click', hack);
            this.els.btnHack.addEventListener('touchend', hack, { passive: false });
        }

        // Tabs
        if (this.els.tabs) {
            for (const btn of this.els.tabs) {
                btn.addEventListener('click', () => { this._switchTab(btn.dataset.tab); audio.click(); haptic(10); });
            }
        }

        if (this.els.btnReset) {
            this.els.btnReset.addEventListener('click', () => {
                if (confirm('Wirklich gesamten Fortschritt löschen?')) {
                    this.game.reset();
                    this.toast('Fortschritt gelöscht');
                    this.renderAll();
                }
            });
        }

        // Spielstand Export / Import
        if (this.els.btnExport) this.els.btnExport.addEventListener('click', () => this._showSaveModal('export'));
        if (this.els.btnImport) this.els.btnImport.addEventListener('click', () => this._showSaveModal('import'));

        // Tutorial
        if (this.els.btnTutorialSkip) this.els.btnTutorialSkip.addEventListener('click', () => this._finishTutorial(true));

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
            audio.prestige();
            haptic([20, 30, 20]);
            this.renderAll();
        });
        this.bus.on('game:prestige', () => this.renderAll());
        this.bus.on('game:tick', () => this.renderTick());
        this.bus.on('game:initialized', () => this.renderAll());
        this.bus.on('game:offline', ({ amount, seconds, perSec, capped, isInit }) => {
            if (amount <= 0) return;
            if (isInit) {
                this._showOfflineModal(amount, seconds, perSec, capped);
            } else {
                this.toast(`Willkommen zurück! +${Formatter.formatBits(amount)} Bits`);
            }
        });
        this.bus.on('game:reset', () => this.renderAll());
        this.bus.on('save:corrupted', ({ key }) => this._showCorruptedModal(key));
        this.bus.on('save:newer', ({ version }) => this._showNewerModal(version));
        this.bus.on('achievement:unlocked', ({ def }) => { this.toast(`🏆 ${def.name} freigeschaltet!`); audio.buy(); this.renderAchievements(); });
        this.bus.on('daily:claimed', ({ amount, streak }) => { this.toast(`Tagesbonus Tag ${streak}: +${Formatter.formatBits(amount)} Bits`); audio.buy(); this.renderDaily(); this.renderAchievements(); });
        // Tutorial: bei relevanten Events weiterschalten
        this.bus.on('game:initialized', () => {
            this._initTutorial();
            if (this.els.feedbackLink) this.els.feedbackLink.href = buildFeedbackUrl();
        });
        this.bus.on('click:hacked', () => this._updateTutorial());
        this.bus.on('automation:bought', () => this._updateTutorial());
        this.bus.on('upgrade:bought', () => this._updateTutorial());
        this.bus.on('prestige:changed', () => this._updateTutorial());
        this.bus.on('game:prestige', () => this._updateTutorial());
        // Update verfügbar (nur als installierte App via UpdateManager onlyStandalone)
        this.bus.on('update:available', ({ remote, current }) => this._showUpdateModal(remote, current));
        this.bus.on('update:pending', () => {
            this.toast('Update bereits angestoßen — neue Version noch nicht am Server. Später erneut prüfen.');
        });
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
        this.renderAchievements();
        this.renderDaily();
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
            this.renderPrestige();
        }
        if (this.els.dailyCard && document.getElementById('tab-achievements')?.classList.contains('active')) {
            this.renderDaily();
        }
    }

    renderDaily() {
        if (!this.els.dailyCard) return;
        const can = this.game.daily.canClaim();
        const streak = this.game.daily.streak;
        const reward = this.game.daily.getRewardAmount();
        const nextStreak = Math.min(streak + 1, 7);
        this.els.dailyCard.innerHTML = `
            <div class="daily-header">
                <div><h3>📅 Tagesbonus</h3><p>Streak: ${streak} Tage • Nächster: Tag ${nextStreak}</p></div>
                <div class="daily-reward">+${Formatter.formatBits(reward)}</div>
            </div>
            <button class="btn-buy ${can ? 'can-afford' : ''}" id="btn-daily-claim" ${can ? '' : 'disabled'}>${can ? `Abholen +${Formatter.formatBits(reward)}` : 'Heute schon abgeholt'}</button>
        `;
        const btn = document.getElementById('btn-daily-claim');
        if (btn) btn.addEventListener('click', () => {
            const r = this.game.daily.claim();
            if (r) { haptic([10,20]); audio.buy(); } else audio.buyFail();
            this.renderDaily();
        });
    }

    renderAchievements() {
        if (!this.els.achievementsList) return;
        const all = this.game.achievements.getAll();
        const unlocked = all.filter(a=>a.unlocked).length;
        this.els.achievementsList.innerHTML = `
            <div class="achievements-header"><h3>🏆 Erfolge ${unlocked}/${all.length}</h3></div>
            ${all.map(a=>`
                <div class="item ${a.unlocked ? 'can-afford' : ''}" style="${a.unlocked ? '' : 'opacity:0.55'}">
                    <div class="item-icon">${a.icon}</div>
                    <div class="item-info">
                        <div class="item-name">${a.name} ${a.unlocked ? '✓' : '🔒'}</div>
                        <div class="item-desc">${a.desc}</div>
                    </div>
                    <span class="item-owned">${a.unlocked ? '✓' : ''}</span>
                </div>
            `).join('')}
        `;
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
            if (ok) haptic([20, 30, 20]);
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
        if (!this._tutorialDone && this._hasRealProgress()) {
            // Prestige-Tutorial trotzdem zeigen wenn noch kein Prestige möglich/geschafft
            const needPrestigeHint = !this.game.prestige.canPrestige() && this.game.prestige.totalPrestiges === 0;
            if (needPrestigeHint && this.game.economy.totalEarned < GameConfig.prestige.threshold * 0.3) {
                this._finishTutorial(false);
                return;
            }
            if (this.game.prestige.totalPrestiges > 0) {
                this._finishTutorial(false);
                return;
            }
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

    /** @returns {{id:string, text:string, done:()=>boolean, optional?:boolean}[]} */
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
                done: () => this.game.upgrades.purchased.size > 0 || this.game.automation.getTotalPerSec() >= 2,
                optional: true,
            },
            {
                id: 'prestige',
                text: '<strong>👑 Bei 1M total Bits</strong> wartet <strong>Root-Zugriff</strong> im Root-Tab — resettet für permanente +5% Boni je Key.',
                done: () => this.game.prestige.canPrestige() || this.game.prestige.totalPrestiges > 0,
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
                haptic(15);
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
                    haptic([15, 30, 15]);
                } else {
                    const msg = result.reason === 'parse' ? 'Ungültiges JSON.'
                        : result.reason === 'newer' ? 'Spielstand stammt von einer neueren Version.'
                        : 'Kein gültiger Spielstand.';
                    this.toast(`Import fehlgeschlagen: ${msg}`);
                }
            });
        }
    }

    _showOfflineModal(amount, seconds, perSec, capped) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay username-overlay';
        const capNote = capped
            ? `<p style="color:var(--text-dim);font-size:0.72rem;margin-top:8px;">Auf ${GameConfig.offlineCapHours}h Limit gedeckelt.</p>`
            : '';
        const effectivePerSec = perSec ?? (seconds > 0 ? amount / seconds : 0);
        overlay.innerHTML = `
            <div class="modal offline-modal">
                <h3>Willkommen zurück!</h3>
                <p>Dein Netzwerk hat offline weiter verdient:</p>
                <div class="offline-formula">
                    <span>${Formatter.formatTime(seconds)}</span>
                    <span class="op">×</span>
                    <span>${Formatter.formatPerSec(effectivePerSec)} /sec</span>
                    <span class="op">=</span>
                </div>
                <div class="offline-total" title="${Formatter.formatFull(amount)} Bits">+${Formatter.formatBits(amount)} Bits</div>
                <p style="color:var(--text-dim);font-size:0.72rem;margin-top:4px;word-break:break-all;">${Formatter.formatTime(seconds)} × ${Formatter.formatPerSec(effectivePerSec)} Bits/sec</p>
                ${capNote}
                <div class="modal-actions" style="margin-top:16px;">
                    <button class="btn-modal primary" data-action="collect">Bestätigen</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const close = () => {
            overlay.remove();
            const claimed = this.game.claimPendingOffline?.();
            if (claimed) this.toast(`+${Formatter.formatBits(claimed.amount)} Bits eingesammelt`);
            haptic(20);
            this.renderAll();
        };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) { haptic(10); } });
        overlay.querySelector('[data-action="collect"]').addEventListener('click', close);
    }

    _showCorruptedModal(key) {
        if (document.querySelector('.modal.corrupted-modal')) return;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal corrupted-modal" style="border-color: rgba(239,68,68,0.45);">
                <h3>⚠️ Spielstand beschädigt</h3>
                <p>Der gespeicherte Stand (<code>${key}</code>) ist ungültig und konnte nicht geladen werden.<br>Du startest frisch — der alte Stand bleibt vorerst erhalten.</p>
                <div class="modal-actions">
                    <button class="btn-modal secondary" data-action="keep">Weiter (frisch)</button>
                    <button class="btn-modal primary" style="background: #ef4444;" data-action="reset">Speicher löschen</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const closeKeep = () => overlay.remove();
        const closeReset = () => {
            try { localStorage.removeItem(key); localStorage.removeItem('idle_hacker_tycoon_v01'); } catch {}
            overlay.remove();
            this.toast('Beschädigter Stand gelöscht');
            haptic(20);
        };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeKeep(); });
        overlay.querySelector('[data-action="keep"]').addEventListener('click', closeKeep);
        overlay.querySelector('[data-action="reset"]').addEventListener('click', closeReset);
    }

    _showNewerModal(version) {
        if (document.querySelector('.modal.newer-modal')) return;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal newer-modal" style="border-color: rgba(239,68,68,0.45);">
                <h3>⚠️ Neuere Version erkannt</h3>
                <p>Dieser Stand stammt von Schema v<strong>${version ?? '?'}</strong> und ist mit v${GameConfig.schemaVersion} nicht kompatibel.<br>Bitte aktualisiere das Spiel oder starte frisch.</p>
                <div class="modal-actions">
                    <button class="btn-modal secondary" data-action="keep">Weiter (frisch)</button>
                    <button class="btn-modal primary" style="background: #ef4444;" data-action="reset">Speicher löschen</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const closeKeep = () => overlay.remove();
        const closeReset = () => {
            this.game.reset();
            overlay.remove();
            this.toast('Stand zurückgesetzt');
            haptic(20);
        };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeKeep(); });
        overlay.querySelector('[data-action="keep"]').addEventListener('click', closeKeep);
        overlay.querySelector('[data-action="reset"]').addEventListener('click', closeReset);
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
            haptic(20);
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
                if (!ok) { this.toast('Nicht genug Bits!'); audio.buyFail(); }
                else { haptic(10); audio.buy(); }
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
                    haptic(15);
                    audio.buy();
                } else audio.buyFail();
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
