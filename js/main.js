/**
 * main.js — Entry Point.
 * Initialisiert Game + UI.
 */
import { Game } from './core/Game.js';
import { UIManager } from './ui/UIManager.js';

const game = new Game();
const ui = new UIManager(game);

game.init();

// Expose für Debugging (nur dev)
window.__IDLE_HACKER__ = { game, ui };

// Dynamische Viewport-Höhe fix für mobile Browser (100dvh Fallback)
function setVh() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}
setVh();
window.addEventListener('resize', setVh);
window.addEventListener('orientationchange', () => setTimeout(setVh, 150));
