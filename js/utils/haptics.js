/**
 * Haptik-Feedback zentral — respektiert die Benutzeroption 'haptics'.
 */
import { Options } from '../core/Options.js';

/** @param {number|number[]} [pattern] - ms oder Muster wie bei navigator.vibrate */
export function haptic(pattern = 15) {
    if (!Options.get('haptics')) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {}
}
