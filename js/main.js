/**
 * main.js — Entry Point.
 * Initialisiert Game + UI.
 */
import { Game } from './core/Game.js';
import { UIManager } from './ui/UIManager.js';
import { MainMenu } from './ui/MainMenu.js';
import { UpdateManager } from './core/UpdateManager.js';

const game = new Game();
const ui = new UIManager(game);
// Menü zuerst zeigen — das Spiel startet erst bei "Spielen"
const menu = new MainMenu(game);
const updateManager = new UpdateManager(game.bus);
game.updateManager = updateManager;

game.init();

// NPC-Leaderboard initial rendern
renderNpcLeaderboard();

// Expose für Debugging (nur dev)
window.__IDLE_HACKER__ = { game, ui, menu, updateManager };

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
];

/** Rendert das NPC-Leaderboard in die Stats-Seite. */
function renderNpcLeaderboard() {
    const position = game.getNpcLeaderboardPosition(npcLeaderboard);
    const listEl = document.getElementById('npc-list');
    const ownEl = document.getElementById('own-npc-rank');

    // Liste leeren & NPCs einfügen
    listEl.innerHTML = '';
    npcLeaderboard.forEach((npc, idx) => {
        const li = document.createElement('li');
        li.style.cssText = 'padding: 0.25rem 0; border-bottom: 1px solid #2a2a3a;';
        li.innerHTML = `<span style="width: 50%;">${idx + 1}. ${npc.name}</span>
                        <span style="width: 20%; text-align: right;">#${npc.prestigest}</span>
                        <span style="width: 30%; text-align: right;">${Formatter.formatFull(npc.totalBits)}</span>`;
        listEl.appendChild(li);
    });

    // Eigene Position setzen (1-20)
    ownEl.textContent = position;
}

// Optional: Position aktualisieren, wenn sich Stats ändern (hier einfach beim Focus-Event)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        renderNpcLeaderboard();
    }
});

/** Exposiert an game-Objekt für potentialen späteren Zugriff */
game.npcLeaderboard = npcLeaderboard;

/** Exposiert an window für Debugging */
window.__IDLE_HACKER__.npcLeaderboard = npcLeaderboard;

/** Rendert das NPC-Leaderboard in die Stats-Seite. */
function renderNpcLeaderboard() {
    const { npcLeaderboard } = GameConfig;
    const position = game.getNpcLeaderboardPosition();
    const listEl = document.getElementById('npc-list');
    const ownEl = document.getElementById('own-npc-rank');

    // Liste leeren & NPCs einfügen
    listEl.innerHTML = '';
    npcLeaderboard.forEach((npc, idx) => {
        const li = document.createElement('li');
        li.style.cssText = 'padding: 0.25rem 0; border-bottom: 1px solid #2a2a3a;';
        li.innerHTML = `<span style="width: 50%;">${idx + 1}. ${npc.name}</span>
                        <span style="width: 20%; text-align: right;">#${npc.prestigest}</span>
                        <span style="width: 30%; text-align: right;">${Formatter.formatFull(npc.totalBits)}</span>`;
        listEl.appendChild(li);
    });

    // Eigene Position setzen (1-20)
    ownEl.textContent = position;
}

// Optional: Position aktualisieren, wenn sich Stats ändern (hier einfach beim Focus-Event)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        renderNpcLeaderboard();
    }
});
