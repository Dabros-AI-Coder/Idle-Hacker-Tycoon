/**
 * ClickSystem — aktives Hacken per Tap/Klick.
 */
import { GameConfig } from '../config/GameConfig.js';

export class ClickSystem {
    /**
     * @param {import('../core/EventBus.js').EventBus} bus
     * @param {import('./EconomySystem.js').EconomySystem} economy
     */
    constructor(bus, economy) {
        this.bus = bus;
        this.economy = economy;
        this.clickMultiplier = 1;
        this.prestigeMultiplier = 1;
        /** Additiver Bonus aus Prestige-Shop 'click_mult_add' — überlebt Prestige-Reset. */
        this.shopClickBonus = 0;

        bus.on('upgrade:applied', ({ effect }) => {
            if (effect.type === 'click_mult') {
                this.clickMultiplier *= effect.value;
                this.bus.emit('click:changed', { value: this.getClickValue() });
            }
        });
        bus.on('prestigeshop:applied', ({ effect, delta }) => {
            if (effect.type === 'click_mult_add') {
                this.shopClickBonus += delta;
                this.bus.emit('click:changed', { value: this.getClickValue() });
            }
        });
        bus.on('prestige:changed', ({ multiplier }) => {
            this.prestigeMultiplier = multiplier || 1;
            this.bus.emit('click:changed', { value: this.getClickValue() });
        });
        bus.on('prestige:committed', ({ multiplier }) => {
            this.prestigeMultiplier = multiplier || 1;
        });
    }

    getClickValue() {
        return GameConfig.baseClickValue * this.clickMultiplier * this.prestigeMultiplier * (1 + this.shopClickBonus);
    }

    hack() {
        const value = this.getClickValue();
        this.economy.registerClick(value);
        this.bus.emit('click:hacked', { value });
        return value;
    }
}
