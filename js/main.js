/**
 * main.js — Entry Point.
 * Initialisiert Game + UI.
 */
import { Game } from './core/Game.js';
import { UIManager } from './ui/UIManager.js';
import { MainMenu } from './ui/MainMenu.js';
import { UpdateManager } from './core/UpdateManager.js';
import { Formatter } from './utils/Formatter.js';
import { Options } from './core/Options.js';

const game = new Game();
const ui = new UIManager(game);
// Menü zuerst zeigen — das Spiel startet erst bei "Spielen"
const menu = new MainMenu(game);
const updateManager = new UpdateManager(game.bus);
game.updateManager = updateManager;

game.init();

// === Service Worker (PWA: Offline-Fähigkeit + sofortige Updates) ===
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => { /* offline-PWA nicht kritisch */ });
    });
}

// Dynamische Viewport-Höhe fix für mobile Browser (100dvh Fallback)
function setVh() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}
setVh();
window.addEventListener('resize', setVh);
window.addEventListener('orientationchange', () => setTimeout(setVh, 150));

// === Standalone-Erkennung & Browser-Schutz (nur als installierte App) ===
function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.matchMedia('(display-mode: window-controls-overlay)').matches
        || window.navigator.standalone === true; // iOS Safari
}

function applyStandaloneProtection() {
    const standalone = isStandalone();
    document.documentElement.classList.toggle('standalone', standalone);
    return standalone;
}

// Initial + bei Wechsel (z.B. PWA Start)
applyStandaloneProtection();
try {
    window.matchMedia('(display-mode: standalone)').addEventListener('change', applyStandaloneProtection);
} catch { /* Safari <14 fallback */ }

// === Update-Check (nur als installierte App) ===
function scheduleUpdateCheck() {
    // Kurz verzögern damit UI bereit ist
    setTimeout(() => updateManager.check({ onlyStandalone: true }), 2000);
}
scheduleUpdateCheck();
// Bei Rückkehr in App erneut prüfen (z.B. nach längerer Pause)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && updateManager.isStandalone()) {
        updateManager.check({ onlyStandalone: true });
    }
});

// Tauri Auto-Updater (Desktop) — prüft GitHub Releases via updater plugin
if (window.__TAURI__ || navigator.userAgent.includes('Tauri')) {
    setTimeout(async () => {
        try {
            const { check } = await import('@tauri-apps/plugin-updater');
            const update = await check();
            if (update) {
                const { relaunch } = await import('@tauri-apps/plugin-process');
                // Nutze UIManager Toast wenn verfügbar, sonst confirm
                if (confirm(`Update ${update.version} verfügbar\n${update.body || ''}\nJetzt installieren?`)) {
                    await update.downloadAndInstall();
                    await relaunch();
                }
            }
        } catch (e) { console.warn('[updater] check failed (offline oder kein Release)', e); }
    }, 3500);
}

// Blockiere Browser-Defaults nur im Standalone-Modus
const blockIfStandalone = (e) => {
    if (!isStandalone()) return;
    e.preventDefault();
};

// Rechtsklick / Kontextmenü
document.addEventListener('contextmenu', blockIfStandalone);
// Text markieren / ziehen
document.addEventListener('selectstart', blockIfStandalone);
document.addEventListener('dragstart', blockIfStandalone);
// Kopieren / Ausschneiden (verhindert Markierungs-Menu)
document.addEventListener('copy', blockIfStandalone);
document.addEventListener('cut', blockIfStandalone);
// Langdruck-Menu auf iOS wird via CSS -webkit-touch-callout unterdrückt

/** 19 fiktive NPC-Spieler als Motivation für Single-Player */
const npcLeaderboard = [
    { name: 'GhostWriter', prestigest: 3, totalBits: 500000, level: 'Elite Hacker' },
    { name: 'ShadowCode', prestigest: 5, totalBits: 1500000, level: 'Root God' },
    { name: 'MatrixLord', prestigest: 8, totalBits: 5000000, level: 'Singularity' },
    { name: 'NeonHacker', prestigest: 2, totalBits: 300000, level: 'Cyber Ghost' },
    { name: 'ByteHunter', prestigest: 6, totalBits: 2500000, level: 'Root God' },
    { name: 'DataGhost', prestigest: 4, totalBits: 800000, level: 'Elite Hacker' },
    { name: 'ScriptKiller', prestigest: 1, totalBits: 100000, level: 'Script Kiddie' },
    { name: 'FirewallBreaker', prestigest: 7, totalBits: 8000000, level: 'Singularity' },
    { name: 'NetNinja', prestigest: 3, totalBits: 600000, level: 'Elite Hacker' },
    { name: 'CodePhantom', prestigest: 9, totalBits: 12000000, level: 'Singularity' },
    { name: 'LogicLoop', prestigest: 2, totalBits: 400000, level: 'Junior Hacker' },
    { name: 'CacheCleaner', prestigest: 5, totalBits: 2000000, level: 'Root God' },
    { name: 'AlgoExpert', prestigest: 8, totalBits: 10000000, level: 'Singularity' },
    { name: 'TechWizard', prestigest: 4, totalBits: 900000, level: 'Elite Hacker' },
    { name: 'BinarySamurai', prestigest: 6, totalBits: 3500000, level: 'Root God' },
    { name: 'QuantumFool', prestigest: 2, totalBits: 250000, level: 'Hacker' },
    { name: 'PacketPusher', prestigest: 7, totalBits: 6500000, level: 'Singularity' },
    { name: 'RouterRebel', prestigest: 3, totalBits: 700000, level: 'Elite Hacker' },
    { name: 'ZeroCool', prestigest: 10, totalBits: 18000000, level: 'Singularity' },
];

let lbMode = 'alltime'; // 'alltime' | 'current'

/** Rendert das NPC-Leaderboard in die Stats-Seite — dynamische Werte + Spieler. */
function renderNpcLeaderboard() {
    const effective = game.getEffectiveNpcLeaderboard(npcLeaderboard);
    const isCurrent = lbMode === 'current';
    const username = (Options.get('username') || '').trim() || 'Du';
    const playerEntry = {
        name: username,
        isPlayer: true,
        effectivePrestige: game.prestige.totalPrestiges,
        effectiveBits: game.economy.totalEarned,
        effectiveCurrentBits: game.economy.bits,
    };
    const withPlayer = [...effective, playerEntry];
    const sorted = [...withPlayer].sort((a, b) => {
        if (isCurrent) return b.effectiveCurrentBits - a.effectiveCurrentBits;
        if (b.effectivePrestige !== a.effectivePrestige) return b.effectivePrestige - a.effectivePrestige;
        return b.effectiveBits - a.effectiveBits;
    });
    const position = sorted.findIndex(e => e.isPlayer) + 1;
    const listEl = document.getElementById('npc-list');
    const ownEl = document.getElementById('own-npc-rank');
    const colPrestige = document.getElementById('lb-col-prestige');
    const colBits = document.getElementById('lb-col-bits');
    if (!listEl || !ownEl) return;
    if (colPrestige) colPrestige.textContent = isCurrent ? '—' : 'Prestige';
    if (colBits) colBits.textContent = isCurrent ? 'Aktuell' : 'All-Time';

    listEl.innerHTML = '';
    sorted.forEach((npc, idx) => {
        const li = document.createElement('li');
        if (npc.isPlayer) li.classList.add('is-player');
        else if (idx === 0) li.classList.add('top1');
        else if (idx === 1) li.classList.add('top2');
        else if (idx === 2) li.classList.add('top3');
        const prestigeVal = isCurrent ? (npc.isPlayer ? '—' : '—') : `${npc.effectivePrestige} ◆`;
        const bitsVal = Formatter.formatFull(isCurrent ? npc.effectiveCurrentBits : npc.effectiveBits);
        li.innerHTML = `<span class="npc-rank">#${idx + 1}</span>
                        <span class="npc-name">${npc.name}</span>
                        <span class="npc-prestige">${prestigeVal}</span>
                        <span class="npc-bits">${bitsVal}</span>`;
        listEl.appendChild(li);
    });
    ownEl.textContent = position;
    document.querySelectorAll('.lb-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lbTab === lbMode);
    });
}

// Tab-Wechsel
document.querySelectorAll('.lb-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        lbMode = btn.dataset.lbTab;
        renderNpcLeaderboard();
    });
});

// Live-Update: Rangliste wächst mit Spieler (Gummiband)
game.bus.on('economy:changed', () => renderNpcLeaderboard());
game.bus.on('prestige:changed', () => renderNpcLeaderboard());
game.bus.on('prestige:committed', () => renderNpcLeaderboard());
game.bus.on('game:tick', () => {
    if (document.getElementById('tab-leaderboard')?.classList.contains('active')) renderNpcLeaderboard();
});

// Fallback: bei Tab-Fokus
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') renderNpcLeaderboard();
});

/** Exposiert an game-Objekt für potentialen späteren Zugriff */
game.npcLeaderboard = npcLeaderboard;

/** Exposiert an window für Debugging */
window.__IDLE_HACKER__ = { game, ui, menu, updateManager, npcLeaderboard, renderNpcLeaderboard };

// Initiales Rendern nach Definition (DOM ist bereit — Script steht am Body-Ende)
renderNpcLeaderboard();
