import { setupMocks } from './helpers.js';
setupMocks();

import { GameConfig } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { Game } from '../js/core/Game.js';
import { UpdateManager } from '../js/core/UpdateManager.js';
import { Formatter } from '../js/utils/Formatter.js';
import { assert, assertEquals } from './helpers.js';

/** Frisches Game ohne Loop-Timer (localStorage-Mock ist in-memory) */
function freshGame() {
    const g = new Game();
    g.loop.start = () => {};
    return g;
}

export const tests = [
    {
        name: 'game: _migrate akzeptiert Legacy-Save ohne schemaVersion',
        fn() {
            const g = freshGame();
            const data = { economy: {}, automation: {} };
            const out = g._migrate(data);
            assert(out !== null);
            assertEquals(out.schemaVersion, GameConfig.schemaVersion);
        },
    },
    {
        name: 'game: _migrate lehnt neuere Schema-Version ab',
        fn() {
            const g = freshGame();
            assertEquals(g._migrate({ schemaVersion: GameConfig.schemaVersion + 1 }), null);
        },
    },
    {
        name: 'game: _migrate lässt aktuelle Version unverändert durch',
        fn() {
            const g = freshGame();
            const data = { schemaVersion: GameConfig.schemaVersion, economy: {}, playtimeSec: 42 };
            const out = g._migrate(data);
            assertEquals(out.playtimeSec, 42);
            assertEquals(out.schemaVersion, GameConfig.schemaVersion);
        },
    },
    {
        name: 'game: importSave validiert Struktur',
        fn() {
            const g = freshGame();
            assertEquals(g.importSave('kein json').reason, 'parse');
            assertEquals(g.importSave('{}').reason, 'invalid');
            assertEquals(g.importSave(JSON.stringify({ economy: {} })).reason, 'invalid');
            assertEquals(g.importSave(JSON.stringify({ schemaVersion: 99, economy: {}, automation: {} })).reason, 'newer');
        },
    },
    {
        name: 'game: export/import Rundtrip erhält Fortschritt',
        fn() {
            const g = freshGame();
            // Echter SaveManager gegen gemocktes localStorage — nötig für Export
            g.init();
            g.economy.addBits(5000);
            g.automation.buy('script_kiddie');
            const json = g.exportSave();

            const g2 = freshGame();
            g2.init();
            const result = g2.importSave(json);
            assert(result.ok, `Import fehlgeschlagen: ${result.reason}`);
            assert(g2.economy.bits > 0, 'Bits übernommen');
            assertEquals(g2.automation.getOwned('script_kiddie'), 1);
            assertEquals(g2.prestige.totalPrestiges, 0);
        },
    },
    {
        name: 'update: compareVersions semantisch korrekt',
        fn() {
            const u = new UpdateManager(new EventBus());
            assertEquals(u.compareVersions('0.3.0', '0.3.1'), -1);
            assertEquals(u.compareVersions('0.4.0', '0.3.9'), 1);
            assertEquals(u.compareVersions('1.0', '1.0.0'), 0);
            assertEquals(u.compareVersions('0.10.0', '0.9.0'), 1); // numerisch, nicht lexikalisch
            assertEquals(u.compareVersions('2.0.0', '10.0.0'), -1);
        },
    },
    {
        name: 'formatter: Bits/Zeit-Formatierung stabil',
        fn() {
            assertEquals(Formatter.formatBits(999), '999');
            assertEquals(Formatter.formatBits(1500), '1.50K');
            assertEquals(Formatter.formatBits(2_000_000), '2M');
            assertEquals(Formatter.formatTime(59), '00:59');
            assertEquals(Formatter.formatTime(3661), '01:01:01');
        },
    },
];
