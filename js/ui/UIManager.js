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
            statTotal: $('stat-total-earned'),
            statClicks: $('stat-clicks'),
            statPlaytime: $('stat-playtime'),
            statOffline: $('stat-offline'),
            btnReset: $('btn-reset'),
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
        this.bus.on('economy:changed', () => this.renderEconomy());
        this.bus.on('click:changed', () => this.renderEconomy());
        this.bus.on('automation:bought', () => this.renderGenerators());
        this.bus.on('upgrade:bought', () => { this.renderUpgrades(); this.renderGenerators(); });
        this.bus.on('game:tick', () => this.renderTick());
        this.bus.on('game:initialized', ({ offlineEarning }) => {
            this.renderAll();
            if (offlineEarning > 0) {
                this.toast(`Offline: +${Formatter.formatBits(offlineEarning)} Bits`);
            }
        });
        this.bus.on('game:reset', () => this.renderAll());
    }

    _switchTab(name) {
        for (const b of this.els.tabs) b.classList.toggle('active', b.dataset.tab === name);
        for (const c of this.els.tabContents) c.classList.toggle('active', c.id === `tab-${name}`);
    }

    renderAll() {
        this.renderEconomy();
        this.renderGenerators();
        this.renderUpgrades();
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
        // Nur Playtime hier, Bits kommen via economy:changed
        this.els.statPlaytime.textContent = Formatter.formatTime(this.game.playtimeSec);
        this.els.statTotal.textContent = Formatter.formatFull(this.game.economy.totalEarned);
        this.els.statClicks.textContent = Formatter.formatFull(this.game.economy.totalClicks);
        this.els.statOffline.textContent = Formatter.formatBits(this.game.getState().offlineEarning);
    }

    renderGenerators() {
        const states = this.game.automation.getAllStates();
        this.els.generatorsList.innerHTML = states.map(s => `
            <div class="item ${s.canAfford ? 'can-afford' : ''}" data-id="${s.def.id}">
                <div class="item-icon">${s.def.icon}</div>
                <div class="item-info">
                    <div class="item-name">${s.def.name}</div>
                    <div class="item-desc">${s.def.description}</div>
                    <div class="item-meta">${Formatter.formatPerSec(s.def.basePerSec)} /sec each · ${Formatter.formatBits(s.perSec)} total</div>
                </div>
                <div class="item-owned">x${s.owned}</div>
                <button class="btn-buy" data-buy="${s.def.id}" ${s.canAfford ? '' : 'disabled'}>
                    ${Formatter.formatBits(s.cost)} Bits
                </button>
            </div>
        `).join('');

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
