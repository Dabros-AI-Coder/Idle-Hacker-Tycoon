/**
 * AchievementSystem — simple unlocks based on Game state.
 */
import { GameConfig } from '../config/GameConfig.js';

const ACHIEVEMENTS = [
  { id: 'first_hack', name: 'Erster Hack', desc: '5 Hacks', icon: '👆', check: (g) => g.economy.totalClicks >= 5 },
  { id: 'k1', name: '1K Bits', desc: '1.000 total Bits', icon: '💰', check: (g) => g.economy.totalEarned >= 1_000 },
  { id: 'k100', name: '100K Bits', desc: '100.000 total Bits', icon: '💎', check: (g) => g.economy.totalEarned >= 100_000 },
  { id: 'first_server', name: 'Netz online', desc: '1 Script Kiddie', icon: '💻', check: (g) => g.automation.getOwned('script_kiddie') >= 1 },
  { id: 'farm', name: 'Server-Farm', desc: '1 Server Farm', icon: '🖥️', check: (g) => g.automation.getOwned('server_farm') >= 1 },
  { id: 'upgrades3', name: 'Upgrader', desc: '3 Upgrades', icon: '⚡', check: (g) => g.upgrades.purchased.size >= 3 },
  { id: 'prestige_ready', name: 'Root bereit', desc: '1M total erreicht', icon: '🔓', check: (g) => g.economy.totalEarned >= GameConfig.prestige.threshold },
  { id: 'first_prestige', name: 'Root-Zugriff', desc: '1× prestiget', icon: '👑', check: (g) => g.prestige.totalPrestiges >= 1 },
  { id: 'collection', name: 'Sammler', desc: 'Je 1 von 5 Generatoren', icon: '🧩', check: (g) => ['script_kiddie','botnet','server_farm','quantum_rig','ai_swarm'].every(id=>g.automation.getOwned(id)>=1) },
  { id: 'collection_full', name: 'Netzwerk komplett', desc: 'Je 1 von jedem Generator', icon: '🌐', check: (g) => GameConfig.generators.every(def=>g.automation.getOwned(def.id)>=1) },
  { id: 'daily3', name: 'Stammgast', desc: '3 Tage Streak', icon: '📅', check: (g) => (g.daily?.streak||0) >= 3 },
];

export class AchievementSystem {
  constructor(bus, game) {
    this.bus = bus;
    this.game = game;
    this.unlocked = new Set();
    this._lastCheck = 0;
  }

  check() {
    for (const a of ACHIEVEMENTS) {
      if (!this.unlocked.has(a.id) && a.check(this.game)) {
        this.unlocked.add(a.id);
        this.bus.emit('achievement:unlocked', { id: a.id, def: a });
      }
    }
  }

  getAll() {
    return ACHIEVEMENTS.map(a => ({ ...a, unlocked: this.unlocked.has(a.id) }));
  }

  serialize() { return { unlocked: [...this.unlocked] }; }
  load(data) {
    if (!data) return;
    this.unlocked = new Set(data.unlocked || []);
  }
  reset() { this.unlocked.clear(); }
}
