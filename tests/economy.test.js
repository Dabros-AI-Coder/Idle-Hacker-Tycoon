import { setupMocks } from './helpers.js';
setupMocks();

import { GameConfig } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { EconomySystem } from '../js/systems/EconomySystem.js';
import { assert, assertEquals, assertClose } from './helpers.js';

export const tests = [
    {
        name: 'economy: addBits erhöht bits und totalEarned',
        fn() {
            const e = new EconomySystem(new EventBus());
            e.addBits(100);
            assertEquals(e.bits, 100);
            assertEquals(e.totalEarned, 100);
            e.addBits(50);
            assertEquals(e.bits, 150);
            assertEquals(e.totalEarned, 150);
        },
    },
    {
        name: 'economy: spendBits verweigert bei zu wenig Bits',
        fn() {
            const e = new EconomySystem(new EventBus());
            e.addBits(10);
            assert(!e.spendBits(11), 'sollte verweigern');
            assertEquals(e.bits, 10);
            assert(e.spendBits(10));
            assertEquals(e.bits, 0);
        },
    },
    {
        name: 'economy: reset akzeptiert Start-Bits (Prestige-Meilenstein)',
        fn() {
            const e = new EconomySystem(new EventBus());
            e.addBits(9999);
            e.reset();
            assertEquals(e.bits, GameConfig.startingBits, 'default start');
            assertEquals(e.totalEarned, 0);
            e.reset(25_000);
            assertEquals(e.bits, 25_000, 'milestone start');
            assertEquals(e.totalEarned, 0);
        },
    },
    {
        name: 'config: Generatoren haben konsistente Felder',
        fn() {
            for (const g of GameConfig.generators) {
                assert(g.id && g.name && g.icon, `id/name/icon fehlen bei ${g.id}`);
                assert(g.baseCost > 0, `baseCost bei ${g.id}`);
                assert(g.costMultiplier > 1, `costMultiplier bei ${g.id}`);
                assert(g.basePerSec > 0, `basePerSec bei ${g.id}`);
            }
            // Kostenkurve: jedes Tier teurer als das vorherige
            for (let i = 1; i < GameConfig.generators.length; i++) {
                assert(GameConfig.generators[i].baseCost > GameConfig.generators[i - 1].baseCost,
                    `${GameConfig.generators[i].id} muss teurer sein als ${GameConfig.generators[i - 1].id}`);
            }
        },
    },
    {
        name: 'config: Upgrade requires zeigen auf existierende Upgrades',
        fn() {
            const ids = new Set(GameConfig.upgrades.map(u => u.id));
            for (const u of GameConfig.upgrades) {
                if (u.requires) {
                    assert(ids.has(u.requires), `requires '${u.requires}' von ${u.id} existiert nicht`);
                }
            }
        },
    },
    {
        name: 'config: Prestige-Meilensteine sortiert & Typen valide',
        fn() {
            const ms = GameConfig.prestige.milestones;
            for (let i = 1; i < ms.length; i++) {
                assert(ms[i].prestiges > ms[i - 1].prestiges, 'Meilensteine müssen aufsteigend sortiert sein');
            }
            for (const m of ms) {
                assert(m.effect.type === 'start_bits' || m.effect.type === 'global_mult', `unbekannter Effekttyp ${m.effect.type}`);
                assert(m.effect.value > 0, `value bei ${m.name}`);
            }
        },
    },
    {
        name: 'economy: addBits ignoriert negative/zero Beträge',
        fn() {
            const e = new EconomySystem(new EventBus());
            e.addBits(0);
            e.addBits(-5);
            assertEquals(e.bits, 0);
        },
    },
    {
        name: 'economy: Kostenformel skaliert mit costMultiplier',
        fn() {
            assertClose(Math.pow(GameConfig.generators[0].costMultiplier, 3), Math.pow(1.15, 3), 1e-9);
        },
    },
];
