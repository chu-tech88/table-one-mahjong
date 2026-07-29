import assert from "node:assert/strict";
import { dealRound, makeDeck } from "../src/game-logic/deck";
import { applyKong } from "../src/game-logic/flow";
import {
  createDefaultHouseRules,
  DEFAULT_RULES,
} from "../src/game-logic/rules";

const game = dealRound();
const kongTiles = makeDeck().filter((tile) => tile.code === "D1").slice(0, 4);
game.players[0].hand = kongTiles;
game.wall = game.wall.filter(
  (tile) => !kongTiles.some((kongTile) => kongTile.id === tile.id),
);
game.turn = 0;
game.phase = "discard";

const silent = applyKong(
  game,
  0,
  "D1",
  true,
  game.rules,
  game.houseRules,
);

assert.equal(silent.players[0].melds.length, 1);
assert.equal(silent.players[0].melds[0].type, "kong");
assert.equal(silent.players[0].melds[0].concealed, true);
assert.equal(silent.players[0].melds[0].tiles.length, 4);
assert.equal(silent.turn, 0);
assert.equal(silent.phase, "discard");
assert.ok(silent.drawnTileId);

const scoring = createDefaultHouseRules();
assert.equal(DEFAULT_RULES.baseWin, 5);
assert.equal(scoring.length, 24);
assert.ok(scoring.every((rule) => rule.enabled));
assert.equal(
  scoring.find((rule) => rule.detector === "big-four-winds")?.points,
  16,
);

console.log("Game logic smoke test passed");
