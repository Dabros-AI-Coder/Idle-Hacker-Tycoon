/**
 * Test-Helfer: DOM/localStorage-Mocks (headless Node) + Assertions.
 * Muss importiert werden, BEVOR Game-Module geladen werden.
 */

export function setupMocks() {
    if (!globalThis.localStorage) {
        globalThis.localStorage = {
            _d: {},
            getItem(k) { return this._d[k] ?? null; },
            setItem(k, v) { this._d[k] = String(v); },
            removeItem(k) { delete this._d[k]; },
            clear() { this._d = {}; },
        };
    }
    if (!globalThis.document) {
        globalThis.document = {
            visibilityState: 'visible',
            addEventListener() {},
            getElementById() { return { textContent: '', innerHTML: '', style: {}, title: '', classList: { toggle() {}, add() {}, remove() {} }, appendChild() {}, querySelectorAll() { return []; }, addEventListener() {} }; },
            querySelectorAll() { return []; },
            createElement() { return { classList: { add() {} }, style: {}, textContent: '', appendChild() {}, addEventListener() {}, remove() {} }; },
        };
    }
    if (!globalThis.window) {
        globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), navigator: {} };
    }
    try { if (!globalThis.navigator) globalThis.navigator = {}; } catch {}
    if (!globalThis.navigator?.vibrate) { try { globalThis.navigator.vibrate = () => {}; } catch {} }
    if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };
    if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
    if (!globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

export function assert(cond, msg = 'Assertion fehlgeschlagen') {
    if (!cond) throw new Error(msg);
}

export function assertEquals(actual, expected, msg = '') {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${msg} erwartet ${e}, bekommen ${a}`);
}

export function assertClose(actual, expected, epsilon = 1e-9, msg = '') {
    if (Math.abs(actual - expected) > epsilon) {
        throw new Error(`${msg} erwartet ~${expected}, bekommen ${actual}`);
    }
}
