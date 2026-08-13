import assert from "node:assert/strict";
import { DEAD_WALL_TILES, dealRound, makeDeck } from "../src/game-logic/deck";
import {
  advanceAfterDiscard,
  applyKong,
  beginAddedGong,
  canDeclareReady,
  declareReadyAndDiscard,
  passClaim,
  startTurn,
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
import {
  nextDealerForRound,
  nextDealerStreak,
  tilePrototypeFromCode,
} from "../src/game-logic/helpers";
import { StandardRuleKey } from "../src/game-logic/types";
import { chooseDiscard, highValueHandPotential } from "../src/game-logic/ai";
import { waitingSupportTileIds } from "../src/game-logic/validation";
import {
  markReadyForNextHand,
  prepareNextHandReadiness,
} from "../src/game-logic/round";

let fixtureTileId = 0;
assert.equal(DEAD_WALL_TILES, 16, "A hand must end with 16 wall tiles remaining");
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
assert.equal(scoring.length, 68);
assert.ok(scoring.every((rule) => rule.enabled));
assert.equal(
  scoring.find((rule) => rule.detector === "big-four-winds")?.points,
  40,
);
assert.equal(scoring.find((rule) => rule.detector === "two-gongs-two-concealed-triplets")?.points, 1);
assert.equal(scoring.some((rule) => rule.name === "Four Consecutive Sets"), false);
assert.equal(scoring.some((rule) => rule.name === "Thirteen Orphans"), false);
assert.equal(scoring.some((rule) => rule.name === "Four in Two"), false);

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
readyGame.players.slice(1).forEach((player) => {
  player.hand = [];
});
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
assert.equal(
  robbedWin.winSummary?.scoreItems.find((item) => item.name === "Robbing the Gong")?.description,
  robRule.description,
);
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

const priorityGame = dealRound();
priorityGame.players[0].hand = tiles([
  "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9",
  "B1", "B2", "B3", "C1", "C2", "C3", "W1",
]);
priorityGame.lastDiscard = { tile: tiles(["W1"])[0], by: 3 };
const huPriority = advanceAfterDiscard(
  priorityGame,
  3,
  priorityGame.rules,
  priorityGame.houseRules,
  (index) => index === 0,
);
assert.equal(huPriority.pendingClaim?.canHu, true);
assert.equal(huPriority.pendingClaim?.canPong, false);
assert.equal(huPriority.pendingClaim?.canChi, false);
assert.equal(huPriority.pendingClaim?.canKong, false);

const sequentialHuGame = dealRound();
const huDiscard = tiles(["W1"])[0];
const huWait = [
  "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9",
  "B1", "B2", "B3", "C1", "C2", "C3", "W1",
];
sequentialHuGame.players[1].hand = tiles(huWait);
sequentialHuGame.players[2].hand = tiles(huWait);
sequentialHuGame.players[3].hand = [];
sequentialHuGame.lastDiscard = { tile: huDiscard, by: 0 };
const firstHuOffer = advanceAfterDiscard(
  sequentialHuGame,
  0,
  sequentialHuGame.rules,
  sequentialHuGame.houseRules,
  () => true,
);
assert.equal(firstHuOffer.pendingClaim?.claimer, 1);
assert.equal(firstHuOffer.pendingClaim?.canHu, true);
const secondHuOffer = passClaim(
  firstHuOffer,
  1,
  firstHuOffer.rules,
  firstHuOffer.houseRules,
  () => true,
);
assert.equal(secondHuOffer.pendingClaim?.claimer, 2);
assert.equal(secondHuOffer.pendingClaim?.canHu, true);

const huOverPongGame = dealRound();
const huOverPongDiscard = tiles(["D5"])[0];
huOverPongGame.players[1].hand = tiles(["D5", "D5"]);
huOverPongGame.players[2].hand = tiles([
  "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9",
  "B1", "B2", "B3", "C1", "C2", "C3", "D5",
]);
huOverPongGame.players[3].hand = [];
huOverPongGame.lastDiscard = { tile: huOverPongDiscard, by: 0 };
const huOverPong = advanceAfterDiscard(
  huOverPongGame,
  0,
  huOverPongGame.rules,
  huOverPongGame.houseRules,
  () => true,
);
assert.equal(huOverPong.pendingClaim?.claimer, 2);
assert.equal(huOverPong.pendingClaim?.canHu, true);
assert.equal(huOverPong.pendingClaim?.canPong, false);

const pongQueueGame = dealRound();
const pongDiscard = tiles(["D5"])[0];
pongQueueGame.players[1].hand = tiles(["D5", "D5"]);
pongQueueGame.players[2].hand = tiles(["D5", "D5", "D5"]);
pongQueueGame.players[3].hand = [];
pongQueueGame.lastDiscard = { tile: pongDiscard, by: 0 };
const firstPongOffer = advanceAfterDiscard(
  pongQueueGame,
  0,
  pongQueueGame.rules,
  pongQueueGame.houseRules,
  () => true,
);
assert.equal(firstPongOffer.pendingClaim?.claimer, 1);
assert.equal(firstPongOffer.pendingClaim?.canPong, true);
const secondPongOffer = passClaim(
  firstPongOffer,
  1,
  firstPongOffer.rules,
  firstPongOffer.houseRules,
  () => true,
);
assert.equal(secondPongOffer.pendingClaim?.claimer, 2);
assert.equal(secondPongOffer.pendingClaim?.canKong, true);

const pongBeforeChiGame = dealRound();
const chiDiscard = tiles(["D5"])[0];
pongBeforeChiGame.players[1].hand = tiles(["D4", "D6"]);
pongBeforeChiGame.players[2].hand = tiles(["D5", "D5"]);
pongBeforeChiGame.players[3].hand = [];
pongBeforeChiGame.lastDiscard = { tile: chiDiscard, by: 0 };
const pongBeforeChi = advanceAfterDiscard(
  pongBeforeChiGame,
  0,
  pongBeforeChiGame.rules,
  pongBeforeChiGame.houseRules,
  () => true,
);
assert.equal(pongBeforeChi.pendingClaim?.claimer, 2);
assert.equal(pongBeforeChi.pendingClaim?.canPong, true);
const chiAfterPongPass = passClaim(
  pongBeforeChi,
  2,
  pongBeforeChi.rules,
  pongBeforeChi.houseRules,
  () => true,
);
assert.equal(chiAfterPongPass.pendingClaim?.claimer, 1);
assert.equal(chiAfterPongPass.pendingClaim?.canChi, true);
assert.equal(chiAfterPongPass.pendingClaim?.canPong, false);

const invalidChiDirectionGame = dealRound();
const invalidChiDiscard = tiles(["D5"])[0];
invalidChiDirectionGame.players[1].hand = [];
invalidChiDirectionGame.players[2].hand = tiles(["D4", "D6"]);
invalidChiDirectionGame.players[3].hand = [];
invalidChiDirectionGame.lastDiscard = { tile: invalidChiDiscard, by: 0 };
const invalidChiDirection = advanceAfterDiscard(
  invalidChiDirectionGame,
  0,
  invalidChiDirectionGame.rules,
  invalidChiDirectionGame.houseRules,
  () => true,
);
assert.equal(invalidChiDirection.pendingClaim, undefined);
assert.equal(invalidChiDirection.turn, 1);

const waitHand = tiles([
  "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9",
  "B1", "B2", "B3", "C1", "C2", "C3", "W1",
]);
const highlighted = waitingSupportTileIds(waitHand, 0);
assert.deepEqual(
  waitHand.filter((tile) => highlighted.has(tile.id)).map((tile) => tile.code),
  ["W1"],
  "Only tiles that participate in a valid wait should be highlighted",
);

const exhausted = dealRound();
exhausted.wall = exhausted.wall.slice(0, DEAD_WALL_TILES);
const drawnHand = startTurn(
  exhausted,
  1,
  exhausted.rules,
  exhausted.houseRules,
);
assert.equal(drawnHand.phase, "round-over");
assert.equal(drawnHand.handResult, "draw");
assert.equal(drawnHand.winSummary?.title, "No tiles remaining");
assert.equal(nextDealerForRound(drawnHand), drawnHand.dealer);
assert.equal(nextDealerStreak(drawnHand), drawnHand.dealerStreak + 1);

const dealerWinResult = dealRound();
dealerWinResult.winner = dealerWinResult.dealer;
dealerWinResult.handResult = "win";
assert.equal(nextDealerForRound(dealerWinResult), dealerWinResult.dealer);
assert.equal(nextDealerStreak(dealerWinResult), 1);

const dealerLossResult = dealRound();
dealerLossResult.winner = (dealerLossResult.dealer + 1) % 4;
dealerLossResult.handResult = "win";
dealerLossResult.dealerStreak = 3;
assert.equal(
  nextDealerForRound(dealerLossResult),
  (dealerLossResult.dealer + 1) % 4,
);
assert.equal(nextDealerStreak(dealerLossResult), 0);

const multiplayerRound = dealRound();
multiplayerRound.players[0].score = 225;
multiplayerRound.players[1].score = 275;
multiplayerRound.winner = 1;
multiplayerRound.handResult = "win";
multiplayerRound.phase = "round-over";
const waitingForFour = prepareNextHandReadiness(multiplayerRound, [0, 1, 2, 3]);
const afterThreeReady = [0, 1, 2].reduce(
  (current, seat) => markReadyForNextHand(current, seat),
  waitingForFour,
);
assert.equal(afterThreeReady.phase, "round-over");
assert.deepEqual(afterThreeReady.nextHandReady, [0, 1, 2]);
const advancedMultiplayerRound = markReadyForNextHand(afterThreeReady, 3);
assert.equal(advancedMultiplayerRound.phase, "discard");
assert.equal(advancedMultiplayerRound.dealer, 1);
assert.equal(advancedMultiplayerRound.round, multiplayerRound.round + 1);
assert.deepEqual(
  advancedMultiplayerRound.players.map((player) => player.score),
  [225, 275, 250, 250],
  "Scores must carry into the next multiplayer hand",
);

const dealerLoss = dealRound();
dealerLoss.dealer = 0;
dealerLoss.dealerStreak = 2;
dealerLoss.players[1].hand = tiles(allChiHand);
dealerLoss.drawnTileId = dealerLoss.players[1].hand.at(-1)?.id;
const dealerRule = scoring.find((rule) => rule.detector === "dealer");
assert.ok(dealerRule);
const dealerPaid = scoreRound(
  dealerLoss,
  1,
  "self-draw",
  dealerLoss.rules,
  [dealerRule],
);
assert.deepEqual(
  dealerPaid.players.map((player) => player.score),
  [241, 267, 246, 246],
);
assert.equal(
  dealerPaid.winSummary?.scoreItems.find((item) => item.name === "Dealer loss")?.points,
  5,
);
assert.equal(
  dealerPaid.winSummary?.winningTileId,
  dealerLoss.drawnTileId,
  "A self-drawn winning tile must be recorded for the hand summary",
);

const patternHand = tiles([
  "D1", "D1", "D2", "D2", "D3", "D3", "D4", "D5", "D6",
  "D7", "D8", "D9", "W1", "W1", "W1", "B9", "D5",
]);
const offSuit = patternHand.find((tile) => tile.code === "B9")!;
const keptSuit = patternHand.find((tile) => tile.code === "D5")!;
assert.ok(
  highValueHandPotential(patternHand.filter((tile) => tile.id !== offSuit.id)) >
    highValueHandPotential(patternHand.filter((tile) => tile.id !== keptSuit.id)),
);
assert.equal(chooseDiscard(patternHand, "sharp").code, "B9");

console.log("Game logic smoke test passed");
