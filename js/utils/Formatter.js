/**
 * Formatter — Zahlen & Zeit formatieren.
 */
export class Formatter {
    static formatBits(value) {
        const n = Number(value) || 0;
        if (n < 1000) return Math.floor(n).toString();
        const units = [
            [1e12, 'T'],
            [1e9, 'B'],
            [1e6, 'M'],
            [1e3, 'K'],
        ];
        for (const [threshold, suffix] of units) {
            if (n >= threshold) {
                const v = n / threshold;
                return (v >= 100 ? Math.floor(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/\.0+$/, '').replace(/\.$/, '') + suffix;
            }
        }
        return Math.floor(n).toString();
    }

    static formatFull(value) {
        return Math.floor(Number(value) || 0).toLocaleString('de-DE');
    }

    static formatPerSec(value) {
        const n = Number(value) || 0;
        if (n < 0.01 && n > 0) return n.toFixed(2);
        if (n < 10) return n.toFixed(1);
        return this.formatBits(n);
    }

    static formatTime(totalSeconds) {
        const s = Math.floor(totalSeconds);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
        return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    }
}
