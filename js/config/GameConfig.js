/**
 * GameConfig — zentrale Balance-Werte.
 * Modular: jede Balance-Änderung nur hier.
 */
export const GameConfig = Object.freeze({
    saveKey: 'idle_hacker_tycoon_v02',
    saveIntervalMs: 5000,
    offlineCapHours: 12,
    tickRate: 10, // Ticks pro Sekunde für passive Income

    startingBits: 0,
    baseClickValue: 1,

    prestige: {
        // Ab 1M totalEarned kann prestiget werden
        threshold: 1_000_000,
        // 1 Punkt pro 1M (aufgerundet via gainDivisor)
        gainDivisor: 1_000_000,
        // +10% global auf Klick + Generatoren pro Punkt
        multiplierPerPoint: 0.10,
    },

    generators: [
        {
            id: 'script_kiddie',
            name: 'Script Kiddie',
            icon: '💻',
            description: 'Führt fertige Exploits aus',
            baseCost: 15,
            costMultiplier: 1.15,
            basePerSec: 0.5,
        },
        {
            id: 'botnet',
            name: 'Botnet',
            icon: '🤖',
            description: 'Netz aus Zombie-PCs',
            baseCost: 100,
            costMultiplier: 1.14,
            basePerSec: 4,
        },
        {
            id: 'server_farm',
            name: 'Server Farm',
            icon: '🖥️',
            description: 'Eigene Mining & Cracking Farm',
            baseCost: 1100,
            costMultiplier: 1.13,
            basePerSec: 30,
        },
        {
            id: 'quantum_rig',
            name: 'Quantum Rig',
            icon: '⚛️',
            description: 'Bricht Verschlüsselung in Sekunden',
            baseCost: 12000,
            costMultiplier: 1.14,
            basePerSec: 220,
        },
        {
            id: 'ai_swarm',
            name: 'KI-Schwarm',
            icon: '🧠',
            description: 'Autonome Hacker-KI',
            baseCost: 130000,
            costMultiplier: 1.15,
            basePerSec: 1600,
        },
    ],

    upgrades: [
        {
            id: 'better_keyboard',
            name: 'Mechanische Tastatur',
            icon: '⌨️',
            description: 'Doppelte Klick-Power',
            cost: 50,
            effect: { type: 'click_mult', value: 2 },
            requires: null,
        },
        {
            id: 'energy_drink',
            name: 'Energy Drink IV',
            icon: '🥤',
            description: 'Nochmals +100% pro Klick',
            cost: 500,
            effect: { type: 'click_mult', value: 2 },
            requires: 'better_keyboard',
        },
        {
            id: 'script_optimization',
            name: 'Script Optimierung',
            icon: '⚡',
            description: 'Script Kiddies +75% Output',
            cost: 300,
            effect: { type: 'generator_mult', target: 'script_kiddie', value: 1.75 },
            requires: null,
        },
        {
            id: 'botnet_upgrade',
            name: 'Botnet 2.0',
            icon: '🛰️',
            description: 'Botnets +100% Output',
            cost: 2500,
            effect: { type: 'generator_mult', target: 'botnet', value: 2 },
            requires: null,
        },
        {
            id: 'overclock',
            name: 'Übertaktung',
            icon: '🔥',
            description: 'Alle Server +50%',
            cost: 15000,
            effect: { type: 'global_mult', value: 1.5 },
            requires: null,
        },
    ],

    levelThresholds: [0, 100, 1000, 10000, 100000, 1000000],
    levelNames: ['Script Kiddie', 'Junior Hacker', 'Hacker', 'Elite Hacker', 'Cyber Ghost', 'Root God'],

    getGenerator(id) {
        return this.generators.find(g => g.id === id) ?? null;
    },
    getUpgrade(id) {
        return this.upgrades.find(u => u.id === id) ?? null;
    },
});
