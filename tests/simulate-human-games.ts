import assert from "node:assert/strict";
import { chooseDiscard, shouldCall } from "../src/game-logic/ai";
import { DEAD_WALL_TILES, dealRound } from "../src/game-logic/deck";
import {
  applyClaim,
  applyKong,
  discardTile,
  passClaim,
} from "../src/game-logic/flow";
import { scoreRound } from "../src/game-logic/scoring";
import type { Game, Player } from "../src/game-logic/types";
import {
  addedKongOptions,
  canExposedKong,
  canPong,
  concealedKongOptions,
  isWinningHand,
  possibleChiOptions,
} from "../src/game-logic/validation";

const ALL_HUMAN = () => true;
const STARTING_SCORE_TOTAL = 1_000;

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

function physicalTiles(game: Game) {
  return [
    ...game.wall,
    ...game.players.flatMap((player) => [
      ...player.hand,
      ...player.flowers,
      ...player.discards,
      ...player.melds.flatMap((meld) => meld.tiles),
    ]),
  ];
}

function auditState(game: Game) {
  const tiles = physicalTiles(game);
  assert.equal(tiles.length, 144, "Every physical tile must be accounted for");
  assert.equal(new Set(tiles.map((tile) => tile.id)).size, 144, "Tile IDs must be unique");

  const counts = new Map<string, number>();
  for (const tile of tiles) counts.set(tile.code, (counts.get(tile.code) ?? 0) + 1);
  for (const [code, count] of counts) {
    assert.equal(count, code.startsWith("F") ? 1 : 4, `${code} has an invalid copy count`);
  }

  const scoreTotal = game.players.reduce((sum, player) => sum + player.score, 0);
  assert.equal(scoreTotal, STARTING_SCORE_TOTAL, "Score transfers must remain zero-sum");

  if (game.phase === "discard") {
    const player = game.players[game.turn];
    assert.equal(
      player.hand.length,
      17 - player.melds.length * 3,
      `Seat ${game.turn} has an invalid discard-turn hand size`,
    );
  }
}

function otherClaimExists(game: Game) {
  const pending = game.pendingClaim;
  const discard = game.lastDiscard;
  if (!pending || !discard || pending.canHu) return false;

  return [1, 2, 3]
    .map((offset) => (discard.by + offset) % 4)
    .filter((seat) => seat !== pending.claimer)
    .some((seat) => {
      const player = game.players[seat];
      return (
        isWinningHand([...player.hand, discard.tile], player.melds.length) ||
        canExposedKong(player.hand, discard.tile) ||
        canPong(player.hand, discard.tile) ||
        (seat === (discard.by + 1) % 4 &&
          possibleChiOptions(player.hand, discard.tile).length > 0)
      );
    });
}

type HandResult = {
  winner?: number;
  source: "self-draw" | "discard" | "wall-draw";
  decisions: number;
  discards: number;
  claims: Record<"chi" | "pong" | "gong", number>;
  concealedGongs: number;
  revealedGongs: number;
  claimPasses: number;
  skippedClaimRisks: number;
  flowers: number;
  points: number;
  wallRemaining: number;
  dealer: number;
  errors: string[];
};

function profiles(): Pick<Player, "name" | "difficulty" | "controller">[] {
  return ["Human A", "Human B", "Human C", "Human D"].map((name, index) => ({
    name,
    controller: "human",
    difficulty: (["balanced", "calm", "sharp", "balanced"] as const)[index],
  }));
}

function playHumanHand(index: number): HandResult {
  const originalRandom = Math.random;
  Math.random = seededRandom(0x20260805 + index * 997);
  let game = dealRound(index % 4, undefined, index + 1, profiles(), `human-sim-${index}`);
  let decisions = 0;
  let discards = 0;
  const claims = { chi: 0, pong: 0, gong: 0 };
  let concealedGongs = 0;
  let revealedGongs = 0;
  let claimPasses = 0;
  let skippedClaimRisks = 0;
  const errors: string[] = [];

  try {
    auditState(game);
    while (game.phase !== "round-over" && decisions < 600) {
      decisions += 1;
      const before = game;

      if (game.phase === "discard") {
        const seat = game.turn;
        const player = game.players[seat];
        if (isWinningHand(player.hand, player.melds.length)) {
          game = scoreRound(game, seat, "self-draw", game.rules, game.houseRules);
        } else {
          const concealed = concealedKongOptions(player.hand);
          const added = addedKongOptions(player);
          const gongCode = concealed[0] ?? added[0];
          if (gongCode && Math.random() < 0.62) {
            const isConcealed = concealed.includes(gongCode) && Math.random() < 0.5;
            game = applyKong(
              game,
              seat,
              gongCode,
              isConcealed,
              game.rules,
              game.houseRules,
              ALL_HUMAN,
            );
            if (isConcealed) concealedGongs += 1;
            else revealedGongs += 1;
          } else {
            const tile = chooseDiscard(player.hand, player.difficulty, player.melds.length);
            assert.ok(tile, `Seat ${seat} must have a discard`);
            game = discardTile(
              game,
              seat,
              tile.id,
              game.rules,
              game.houseRules,
              ALL_HUMAN,
            );
            discards += 1;
          }
        }
      } else if (game.phase === "claim" && game.pendingClaim) {
        const pending = game.pendingClaim;
        const seat = pending.claimer;
        const player = game.players[seat];
        if (pending.canHu) {
          game = scoreRound(game, seat, "discard", game.rules, game.houseRules);
        } else {
          const call = pending.canKong && shouldCall(player, "kong")
            ? "kong"
            : pending.canPong && shouldCall(player, "pong")
              ? "pong"
              : pending.canChi && shouldCall(player, "chi")
                ? "chi"
                : undefined;
          if (call) {
            const chiTiles = call === "chi"
              ? possibleChiOptions(player.hand, pending.tile)[0]
              : undefined;
            game = applyClaim(
              game,
              seat,
              call,
              chiTiles,
              game.rules,
              game.houseRules,
            );
            claims[call === "kong" ? "gong" : call] += 1;
          } else {
            if (otherClaimExists(game)) skippedClaimRisks += 1;
            game = passClaim(game, seat, game.rules, game.houseRules, ALL_HUMAN);
            claimPasses += 1;
          }
        }
      }

      auditState(game);
      assert.notStrictEqual(game, before, "A decision must produce a new game state");
    }

    assert.equal(game.phase, "round-over", "Hand must terminate");
    assert.ok(game.wall.length >= DEAD_WALL_TILES, "The dead wall must remain intact");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    Math.random = originalRandom;
  }

  const source = game.handResult === "draw"
    ? "wall-draw"
    : game.activity?.text.includes("self draw")
      ? "self-draw"
      : "discard";
  return {
    winner: game.winner,
    source,
    decisions,
    discards,
    claims,
    concealedGongs,
    revealedGongs,
    claimPasses,
    skippedClaimRisks,
    flowers: game.players.reduce((sum, player) => sum + player.flowers.length, 0),
    points: game.winSummary?.total ?? 0,
    wallRemaining: game.wall.length,
    dealer: game.dealer,
    errors,
  };
}

const requestedGames = Number(
  process.argv.find((argument) => argument.startsWith("--games="))?.split("=")[1] ?? 25,
);
const gameCount = Number.isFinite(requestedGames) && requestedGames > 0
  ? Math.floor(requestedGames)
  : 25;
const results = Array.from({ length: gameCount }, (_, index) => playHumanHand(index));
const sum = (select: (result: HandResult) => number) =>
  results.reduce((total, result) => total + select(result), 0);
const wins = results.filter((result) => result.winner !== undefined);
const summary = {
  games: gameCount,
  completedWithoutInvariantError: results.filter((result) => result.errors.length === 0).length,
  wins: wins.length,
  wallDraws: results.filter((result) => result.source === "wall-draw").length,
  selfDraws: results.filter((result) => result.source === "self-draw").length,
  discardWins: results.filter((result) => result.source === "discard").length,
  winsBySeat: [0, 1, 2, 3].map(
    (seat) => results.filter((result) => result.winner === seat).length,
  ),
  winsByDealer: results.filter((result) => result.winner === result.dealer).length,
  averageDecisions: Number((sum((result) => result.decisions) / gameCount).toFixed(1)),
  averageDiscards: Number((sum((result) => result.discards) / gameCount).toFixed(1)),
  averageWallRemaining: Number((sum((result) => result.wallRemaining) / gameCount).toFixed(1)),
  averageWinningPayment: wins.length
    ? Number((sum((result) => result.points) / wins.length).toFixed(1))
    : 0,
  claims: {
    chi: sum((result) => result.claims.chi),
    pong: sum((result) => result.claims.pong),
    gong: sum((result) => result.claims.gong),
    concealedGong: sum((result) => result.concealedGongs),
    revealedOrAddedGong: sum((result) => result.revealedGongs),
    passes: sum((result) => result.claimPasses),
  },
  flowersCollected: sum((result) => result.flowers),
  skippedClaimRisks: sum((result) => result.skippedClaimRisks),
  errors: results.flatMap((result, hand) =>
    result.errors.map((error) => ({ hand: hand + 1, error })),
  ),
};

console.log(JSON.stringify(summary, null, 2));
assert.equal(summary.completedWithoutInvariantError, gameCount);
