import { setupMocks } from './helpers.js';
setupMocks();

import { GameConfig } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { EconomySystem } from '../js/systems/EconomySystem.js';
import { AutomationSystem } from '../js/systems/AutomationSystem.js';
import { UpgradeSystem } from '../js/systems/UpgradeSystem.js';
import { PrestigeSystem } from '../js/systems/PrestigeSystem.js';
import { assert, assertEquals, assertClose } from './helpers.js';

function freshSystems() {
    const bus = new EventBus();
    const economy = new EconomySystem(bus);
    const automation = new AutomationSystem(bus, economy);
    const upgrades = new UpgradeSystem(bus, economy, automation);
    const prestige = new PrestigeSystem(bus, economy);
    return { bus, economy, automation, upgrades, prestige };
}

export const tests = [
    {
        name: 'automation: Kostenformel baseCost * mult^owned',
        fn() {
            const { automation } = freshSystems();
            const g = GameConfig.generators[0];
            assertClose(automation.getCost(g.id), Math.floor(g.baseCost * Math.pow(g.costMultiplier, 0)));
            // simuliere Käufe
            for (let i = 1; i <= 3; i++) {
                automation.owned.set(g.id, i);
                assertClose(automation.getCost(g.id), Math.floor(g.baseCost * Math.pow(g.costMultiplier, i)), 1e-6);
            }
        },
    },
    {
        name: 'automation: buy braucht Bits und erhöht Output linear',
        fn() {
            const { bus, economy, automation } = freshSystems();
            const g = GameConfig.generators[0]; // 0.5/s für 15 Bits
            assert(!automation.buy(g.id), 'ohne Bits kein Kauf');
            economy.addBits(100);
            assert(automation.buy(g.id));
            assertEquals(automation.getOwned(g.id), 1);
            assertClose(automation.getTotalPerSec(), 0.5, 1e-9);
            assertEquals(economy.bits, 85);
            assert(automation.buy(g.id));
            assertClose(automation.getTotalPerSec(), 1.0, 1e-9);
        },
    },
    {
        name: 'automation: generator_mult + global_mult + prestige stapeln multiplikativ',
        fn() {
            const { bus, economy, automation } = freshSystems();
            const g = GameConfig.generators[0];
            economy.addBits(1000);
            automation.buy(g.id); // 0.5/s
            bus.emit('upgrade:applied', { effect: { type: 'generator_mult', target: g.id, value: 2 } });
            bus.emit('upgrade:applied', { effect: { type: 'global_mult', value: 1.5 } });
            bus.emit('prestige:changed', { multiplier: 1.2, totalPrestiges: 0 });
            assertClose(automation.getTotalPerSec(), 0.5 * 2 * 1.5 * 1.2, 1e-9);
            // Meilenstein-Multiplikator kommt obendrauf
            bus.emit('prestige:changed', { multiplier: 1.2, totalPrestiges: 5 }); // Legende ×2
            assertClose(automation.getTotalPerSec(), 0.5 * 2 * 1.5 * 1.2 * 2, 1e-9);
        },
    },
    {
        name: 'automation: serialize/load rundetript',
        fn() {
            const { bus, economy, automation } = freshSystems();
            economy.addBits(100000);
            automation.buy('botnet');
            automation.buy('botnet');
            const data = JSON.parse(JSON.stringify(automation.serialize()));
            const { automation: a2 } = freshSystems();
            a2.load(data);
            assertEquals(a2.getOwned('botnet'), 2);
            assertClose(a2.getTotalPerSec(), 8, 1e-9);
        },
    },
    {
        name: 'upgrades: kaufen wendet Effekt an und sperrt gegen Doppelkauf',
        fn() {
            const { bus, economy, automation, upgrades } = freshSystems();
            economy.addBits(1000);
            assert(upgrades.buy('better_keyboard'), 'kaufbar mit genug Bits');
            assert(!upgrades.canBuy('better_keyboard'), 'gekauft => nicht mehr kaufbar');
            const before = upgrades.purchased.size;
            assert(!upgrades.buy('better_keyboard'), 'Doppelkauf verweigert');
            assertEquals(upgrades.purchased.size, before);
        },
    },
    {
        name: 'upgrades: locked Upgrade nicht kaufbar',
        fn() {
            const { economy, upgrades } = freshSystems();
            economy.addBits(Number.MAX_SAFE_INTEGER);
            assert(!upgrades.buy('energy_drink'), 'requires better_keyboard');
            assert(upgrades.buy('better_keyboard'));
            assert(upgrades.buy('energy_drink'), 'nach Vorgänger kaufbar');
        },
    },
    {
        name: 'prestige: threshold, pendingGain, commit',
        fn() {
            const { economy, prestige } = freshSystems();
            economy.totalEarned = 900_000;
            assert(!prestige.canPrestige());
            assertEquals(prestige.getPendingGain(), 0);
            economy.totalEarned = 2_500_000;
            assert(prestige.canPrestige());
            assertEquals(prestige.getPendingGain(), 2);
            const result = prestige.commit();
            assertEquals(result.gain, 2);
            assertEquals(prestige.points, 2);
            assertClose(prestige.getMultiplier(), 1.1, 1e-9);
        },
    },
    {
        name: 'prestige: Meilenstein-Boni bei 1/3/5 Prestiges',
        fn() {
            const { prestige } = freshSystems();
            prestige.totalPrestiges = 0;
            assertEquals(prestige.getStartBonus(), 0);
            assertEquals(prestige.getActiveMilestones().length, 0);
            prestige.totalPrestiges = 1;
            assertEquals(prestige.getStartBonus(), 500);
            prestige.totalPrestiges = 3;
            assertEquals(prestige.getStartBonus(), 25_500);
            prestige.totalPrestiges = 5;
            assertEquals(prestige.getStartBonus(), 25_500); // global_mult zählt hier nicht rein
            assertEquals(prestige.getActiveMilestones().length, 3);
            assertEquals(prestige.getNextMilestone(), null);
        },
    },
];
