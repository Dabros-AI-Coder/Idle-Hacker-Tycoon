import { setupMocks } from './helpers.js';
setupMocks();

import { GameConfig } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { EconomySystem } from '../js/systems/EconomySystem.js';
import { AutomationSystem } from '../js/systems/AutomationSystem.js';
import { UpgradeSystem } from '../js/systems/UpgradeSystem.js';
import { PrestigeSystem } from '../js/systems/PrestigeSystem.js';
import { PrestigeShopSystem } from '../js/systems/PrestigeShopSystem.js';
import { ClickSystem } from '../js/systems/ClickSystem.js';
import { assert, assertEquals, assertClose } from './helpers.js';

function freshSystems() {
    const bus = new EventBus();
    const economy = new EconomySystem(bus);
    const automation = new AutomationSystem(bus, economy);
    const upgrades = new UpgradeSystem(bus, economy, automation);
    const prestige = new PrestigeSystem(bus, economy);
    const prestigeShop = new PrestigeShopSystem(bus, prestige);
    const click = new ClickSystem(bus, economy);
    return { bus, economy, automation, upgrades, prestige, prestigeShop, click };
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
            bus.emit('prestige:changed', { multiplier: 1.2, milestoneMultiplier: 1, totalPrestiges: 0 });
            assertClose(automation.getTotalPerSec(), 0.5 * 2 * 1.5 * 1.2, 1e-9);
            // Meilenstein-Multiplikator kommt obendrauf (zentral in PrestigeSystem.getMilestoneMultiplier() berechnet)
            bus.emit('prestige:changed', { multiplier: 1.2, milestoneMultiplier: 2, totalPrestiges: 5 }); // Legende ×2
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
            assertEquals(prestige.getNextMilestone().prestiges, 10); // nächste Stufe der erweiterten Reihe
            prestige.totalPrestiges = 50;
            assertEquals(prestige.getActiveMilestones().length, 12);
            assertEquals(prestige.getNextMilestone(), null); // letzte Stufe erreicht
        },
    },
    {
        name: 'prestige: getMilestoneMultiplier multipliziert alle aktiven global_mult-Meilensteine',
        fn() {
            const { prestige } = freshSystems();
            prestige.totalPrestiges = 0;
            assertClose(prestige.getMilestoneMultiplier(), 1, 1e-9);
            prestige.totalPrestiges = 5;
            assertClose(prestige.getMilestoneMultiplier(), 2, 1e-9); // nur "Legende des Netzes"
            prestige.totalPrestiges = 15;
            assertClose(prestige.getMilestoneMultiplier(), 2 * 1.15, 1e-9); // + "System-Architekt"
            prestige.totalPrestiges = 50;
            assertClose(prestige.getMilestoneMultiplier(), 2 * 1.15 * 1.15 * 1.2 * 1.2 * 1.3, 1e-9); // alle 6 global_mult-Stufen
        },
    },
    {
        name: 'prestige: getThreshold wächst mit totalPrestiges (Basis unverändert bei 0)',
        fn() {
            const { prestige } = freshSystems();
            assertEquals(prestige.getThreshold(), 1_000_000);
            prestige.totalPrestiges = 10;
            assertEquals(prestige.getThreshold(), Math.floor(1_000_000 * Math.pow(GameConfig.prestige.thresholdGrowth, 10)));
        },
    },
    {
        name: 'click: milestoneMultiplier aus prestige:changed wirkt auf getClickValue (Regressionstest für vorbestehenden Bug)',
        fn() {
            const { bus, click } = freshSystems();
            assertClose(click.getClickValue(), 1, 1e-9);
            bus.emit('prestige:changed', { multiplier: 1, milestoneMultiplier: 2, totalPrestiges: 5 });
            assertClose(click.getClickValue(), 2, 1e-9);
        },
    },
    {
        name: 'prestige: commit schreibt Root-Keys UND CPU-Chips gleichermaßen gut',
        fn() {
            const { economy, prestige } = freshSystems();
            economy.totalEarned = 3_000_000;
            const result = prestige.commit();
            assertEquals(result.gain, 3);
            assertEquals(prestige.points, 3);
            assertEquals(prestige.chips, 3);
            assertEquals(prestige.totalChipsEarned, 3);
        },
    },
    {
        name: 'prestigeShop: Kauf kostet Chips und sperrt bei fehlendem Guthaben',
        fn() {
            const { prestige, prestigeShop } = freshSystems();
            prestige.chips = 1;
            assert(!prestigeShop.canBuy('sp_gain'), 'sp_gain kostet 5, nur 1 Chip vorhanden');
            assert(prestigeShop.canBuy('sp_click'), 'sp_click kostet 1');
            assert(prestigeShop.buy('sp_click'));
            assertEquals(prestige.chips, 0);
            assertEquals(prestigeShop.getLevel('sp_click'), 1);
            assert(!prestigeShop.buy('sp_click'), 'kein Guthaben mehr');
        },
    },
    {
        name: 'prestigeShop: click_mult_add wirkt additiv in ClickSystem und überlebt keinen Wipe außer resetHard',
        fn() {
            const { prestige, prestigeShop, click } = freshSystems();
            prestige.chips = 100;
            assertClose(click.getClickValue(), 1, 1e-9);
            prestigeShop.buy('sp_click'); // +10%
            assertClose(click.getClickValue(), 1.1, 1e-9);
            prestigeShop.buy('sp_click'); // +10% weiteres Level, additiv gestapelt
            assertClose(click.getClickValue(), 1.2, 1e-9);
        },
    },
    {
        name: 'prestigeShop: global_mult_add + cost_reduction_add wirken in AutomationSystem und überleben reset()',
        fn() {
            const { economy, automation, prestige, prestigeShop } = freshSystems();
            economy.addBits(1_000_000);
            automation.buy('script_kiddie');
            const baseCost = automation.getCost('script_kiddie');
            const basePerSec = automation.getTotalPerSec();

            prestige.chips = 100;
            prestigeShop.buy('sp_global'); // +5% global
            prestigeShop.buy('sp_cost'); // -2% Kosten
            assertClose(automation.getTotalPerSec(), basePerSec * 1.05, 1e-6);
            assert(automation.getCost('script_kiddie') < baseCost, 'Kosten sollten sinken');

            // Normaler Prestige-Reset (Automation.reset()) darf Shop-Boni NICHT löschen
            automation.reset();
            assertClose(automation.shopGlobalBonus, 0.05, 1e-9);
            assertClose(automation.shopCostReductionBonus, 0.02, 1e-9);
        },
    },
    {
        name: 'prestigeShop: start_bits_add / offline_cap_add werden on-demand aus Leveln berechnet',
        fn() {
            const { prestige, prestigeShop } = freshSystems();
            prestige.chips = 1000;
            assertEquals(prestigeShop.getStartBitsBonus(), 0);
            prestigeShop.buy('sp_start');
            prestigeShop.buy('sp_start');
            assertEquals(prestigeShop.getStartBitsBonus(), 100_000);
            prestigeShop.buy('sp_offline');
            assertClose(prestigeShop.getOfflineCapBonus(), 0.25, 1e-9);
        },
    },
    {
        name: 'prestigeShop: serialize/load stellt Level UND Effekte wieder her',
        fn() {
            const { prestige, prestigeShop } = freshSystems();
            prestige.chips = 1000;
            prestigeShop.buy('sp_global');
            prestigeShop.buy('sp_global');
            const data = JSON.parse(JSON.stringify(prestigeShop.serialize()));

            const { prestige: p2, prestigeShop: s2, automation: a2 } = freshSystems();
            s2.load(data);
            assertEquals(s2.getLevel('sp_global'), 2);
            assertClose(a2.shopGlobalBonus, 0.10, 1e-9);
        },
    },
    {
        name: 'prestigeShop: prestige_gain_mult erhöht getPendingGain für Root-Keys UND Chips',
        fn() {
            const { economy, prestige, prestigeShop } = freshSystems();
            economy.totalEarned = 10_000_000;
            assertEquals(prestige.getPendingGain(), 10);
            prestige.chips = 1000;
            prestigeShop.buy('sp_gain'); // +10%
            assertEquals(prestige.getPendingGain(), 11);
            const result = prestige.commit();
            assertEquals(result.gain, 11);
            assertEquals(prestige.chips, 1000 - 5 /* Kaufpreis sp_gain */ + 11);
        },
    },
];
