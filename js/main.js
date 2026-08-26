/**
 * main.js — Entry Point.
 * Initialisiert Game + UI.
 */
import { Game } from './core/Game.js';
import { UIManager } from './ui/UIManager.js';
import { UpdateManager } from './core/UpdateManager.js';

const game = new Game();
const ui = new UIManager(game);
const updateManager = new UpdateManager(game.bus);
game.updateManager = updateManager;

game.init();

// Expose für Debugging (nur dev)
window.__IDLE_HACKER__ = { game, ui, updateManager };

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
// Langdruck-Menu auf iOS wird via CSS -webkit-touch-callout unterdrückt,
// zusätzlich Touch-Callout als Double-Safety
document.addEventListener('touchcallout', blockIfStandalone);
