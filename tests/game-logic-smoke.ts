import assert from "node:assert/strict";
import { dealRound, makeDeck } from "../src/game-logic/deck";
import {
  applyKong,
  beginAddedGong,
  canDeclareReady,
  declareReadyAndDiscard,
  passClaim,
} from "../src/game-logic/flow";
import {
  createDefaultHouseRules,
  DEFAULT_RULES,
} from "../src/game-logic/rules";
import {
  scoreRound,
  scoreStandardRules,
  settleAllEightFlowers,
} from "../src/game-logic/scoring";
import { tilePrototypeFromCode } from "../src/game-logic/helpers";
import { StandardRuleKey } from "../src/game-logic/types";

let fixtureTileId = 0;
function tiles(codes: string[]) {
  return codes.map((code) => ({
    ...tilePrototypeFromCode(code),
    id: `fixture-${fixtureTileId++}`,
  }));
}

function scoreOnly(codes: string[], detector: StandardRuleKey) {
  const fixture = dealRound();
  fixture.players[0].hand = tiles(codes);
  fixture.players[0].melds = [];
  fixture.drawnTileId = fixture.players[0].hand.at(-1)?.id;
  fixture.actionLog.push({
    seq: 2,
    type: "draw",
    actor: 0,
    description: "Fixture draw",
    at: Date.now(),
  });
  const rule = createDefaultHouseRules().find((candidate) => candidate.detector === detector);
  assert.ok(rule, `Missing rule ${detector}`);
  return scoreStandardRules(fixture, 0, "self-draw", [rule]);
}

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
assert.equal(DEFAULT_RULES.baseWin, 4);
assert.equal(scoring.length, 69);
assert.ok(scoring.every((rule) => rule.enabled));
assert.equal(
  scoring.find((rule) => rule.detector === "big-four-winds")?.points,
  40,
);
assert.equal(scoring.find((rule) => rule.detector === "two-gongs-two-concealed-triplets")?.points, 1);
assert.equal(scoring.some((rule) => rule.name === "Four Consecutive Sets"), false);
assert.equal(scoring.some((rule) => rule.name === "Thirteen Orphans"), false);

const allChiHand = [
  "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9",
  "B1", "B2", "B3", "C1", "C2", "C3", "D5", "D5",
];
assert.equal(scoreOnly(allChiHand, "big-chi")[0]?.points, 10);
assert.equal(scoreOnly(allChiHand, "three-sister-chi")[0]?.points, 8);
assert.equal(scoreOnly(allChiHand, "one-long-dragon")[0]?.points, 10);

const fivePongHand = [
  "D1", "D1", "D1", "D2", "D2", "D2", "D3", "D3", "D3",
  "D4", "D4", "D4", "D5", "D5", "D5", "D6", "D6",
];
assert.equal(scoreOnly(fivePongHand, "all-pongs")[0]?.points, 15);
assert.equal(scoreOnly(fivePongHand, "five-consecutive-pongs")[0]?.points, 15);
assert.equal(scoreOnly(fivePongHand, "five-concealed-triplets")[0]?.points, 50);

const allHonorsHand = [
  "W1", "W1", "W1", "W2", "W2", "W2", "W3", "W3", "W3",
  "W4", "W4", "W4", "G1", "G1", "G1", "G2", "G2",
];
assert.equal(scoreOnly(allHonorsHand, "all-winds-dragons")[0]?.points, 50);
assert.equal(scoreOnly(allHonorsHand, "big-four-winds")[0]?.points, 40);

const flowerGame = dealRound();
flowerGame.players[0].flowers = makeDeck().filter((tile) => tile.flower);
flowerGame.settledBonuses = [];
const flowerRule = scoring.find((rule) => rule.detector === "all-eight-flowers");
assert.ok(flowerRule);
const flowerPaid = settleAllEightFlowers(flowerGame, 0, [flowerRule]);
assert.deepEqual(flowerPaid.players.map((player) => player.score), [370, 210, 210, 210]);
assert.equal(flowerPaid.phase, "discard", "Eight Flowers must not end the hand");
assert.deepEqual(
  settleAllEightFlowers(flowerPaid, 0, [flowerRule]).players.map((player) => player.score),
  [370, 210, 210, 210],
  "Eight Flowers must pay only once",
);

const readyGame = dealRound();
const readyTiles = tiles([
  "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9",
  "B1", "B2", "B3", "C1", "C2", "C3", "D5", "W1",
]);
readyGame.players[0].hand = readyTiles;
const readyDiscard = readyTiles.find((tile) => tile.code === "W1")!;
assert.equal(canDeclareReady(readyGame, 0, readyDiscard.id), true);
const declared = declareReadyAndDiscard(
  readyGame,
  0,
  readyDiscard.id,
  readyGame.rules,
  readyGame.houseRules,
);
assert.ok(declared.declaredReady?.includes(0));
assert.ok(declared.players[0].discards.some((tile) => tile.id === readyDiscard.id));

const robGame = dealRound();
const pongTiles = tiles(["D5", "D5", "D5"]);
const fourthD5 = tiles(["D5"])[0];
robGame.players[0].melds = [{ type: "pong", tiles: pongTiles, from: 1 }];
robGame.players[0].hand = [fourthD5, ...tiles(["D1", "D2", "D3", "B1", "B2", "B3", "C1", "C2", "C3", "W1", "W1", "G1", "G2"] )];
robGame.players[1].hand = tiles([
  "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9",
  "B1", "B2", "B3", "C1", "C2", "C3", "D5",
]);
robGame.players[2].hand = [];
robGame.players[3].hand = [];
robGame.turn = 0;
robGame.phase = "discard";
const robOpportunity = beginAddedGong(
  robGame,
  0,
  "D5",
  robGame.rules,
  robGame.houseRules,
  (index) => index === 1,
);
assert.equal(robOpportunity.phase, "claim");
assert.equal(robOpportunity.pendingClaim?.claimer, 1);
assert.equal(robOpportunity.pendingClaim?.canHu, true);
assert.equal(robOpportunity.robbingGong, true);
const robRule = scoring.find((rule) => rule.detector === "robbing-gong");
assert.ok(robRule);
assert.equal(scoreStandardRules(robOpportunity, 1, "discard", [robRule])[0]?.points, 3);
const robbedWin = scoreRound(
  robOpportunity,
  1,
  "discard",
  robOpportunity.rules,
  [robRule],
);
assert.equal(robbedWin.phase, "round-over");
assert.equal(robbedWin.players[0].hand.some((tile) => tile.id === fourthD5.id), false);
assert.equal(robbedWin.players[1].hand.some((tile) => tile.id === fourthD5.id), true);
assert.ok(robbedWin.winSummary?.lineItems.some((line) => line.includes("Robbing the Gong")));
const completedAddedGong = passClaim(
  robOpportunity,
  1,
  robOpportunity.rules,
  robOpportunity.houseRules,
  () => false,
);
assert.equal(completedAddedGong.players[0].melds[0].type, "kong");
assert.equal(completedAddedGong.players[0].melds[0].tiles.length, 4);
assert.equal(completedAddedGong.pendingAddedGong, undefined);
assert.equal(completedAddedGong.turn, 0);

console.log("Game logic smoke test passed");
