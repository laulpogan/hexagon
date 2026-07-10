// Greedy agent — wraps the shipped bot heuristic behind the arena interface.
// Interface contract (all agents): takeTurn(game, player, rand) performs ONE
// full turn action through Game methods and returns {kind, ...}.
import { botTakeTurn } from '../bot.js';

export function makeGreedy() {
  return {
    name: 'greedy',
    takeTurn(game, player, rand) {
      return botTakeTurn(game, player, rand);
    },
  };
}
