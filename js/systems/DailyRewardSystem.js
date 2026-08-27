/**
 * DailyReward — simple streak, claim once per calendar day.
 * Reward: 500 * streak * prestigeMultiplier, capped at 7 days.
 */
export class DailyRewardSystem {
  constructor(bus, game) {
    this.bus = bus;
    this.game = game;
    this.lastClaim = null; // YYYY-MM-DD
    this.streak = 0;
  }

  _today() { return new Date().toISOString().slice(0,10); }

  canClaim() {
    return this.lastClaim !== this._today();
  }

  getRewardAmount() {
    const mult = this.game.prestige?.getMultiplier?.() || 1;
    const next = this.canClaim() ? Math.min(this.streak + 1, 7) : this.streak;
    const effective = next === 0 ? 1 : next;
    return Math.floor(500 * effective * mult);
  }

  claim() {
    if (!this.canClaim()) return null;
    const today = this._today();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    if (this.lastClaim === yesterday) this.streak = Math.min(this.streak + 1, 7);
    else this.streak = 1;
    this.lastClaim = today;
    const mult = this.game.prestige.getMultiplier();
    const final = Math.floor(500 * this.streak * mult);
    this.game.economy.addBits(final);
    this.bus.emit('daily:claimed', { amount: final, streak: this.streak });
    return { amount: final, streak: this.streak };
  }

  serialize() { return { lastClaim: this.lastClaim, streak: this.streak }; }
  load(data) {
    if (!data) return;
    this.lastClaim = data.lastClaim || null;
    this.streak = Number(data.streak) || 0;
  }
  reset() { this.lastClaim = null; this.streak = 0; }
}
