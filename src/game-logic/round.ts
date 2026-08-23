import { dealRound } from "./deck";
import {
  nextDealerForRound,
  nextDealerStreak,
  nextRoundNumber,
  structuredCloneGame,
} from "./helpers";
import type { Game } from "./types";

function uniqueSeats(seats: number[]) {
  return [...new Set(seats)].filter((seat) => seat >= 0 && seat < 4);
}

export function prepareNextHandReadiness(game: Game, requiredSeats: number[]) {
  const next = structuredCloneGame(game);
  next.nextHandReady = [];
  next.nextHandRequired = uniqueSeats(requiredSeats);
  return next;
}

export function dealNextHand(game: Game) {
  return dealRound(
    nextDealerForRound(game),
    game.players.map((player) => player.score),
    nextRoundNumber(game),
    game.players,
    game.tableId,
    game.rules,
    game.houseRules,
    nextDealerStreak(game),
  );
}

export function markReadyForNextHand(game: Game, readyPlayer: number) {
  if (game.phase !== "round-over") return game;

  const required = uniqueSeats(game.nextHandRequired ?? []);
  if (!required.includes(readyPlayer)) return game;

  const ready = uniqueSeats([...(game.nextHandReady ?? []), readyPlayer]).filter(
    (seat) => required.includes(seat),
  );
  if (required.length > 0 && required.every((seat) => ready.includes(seat))) {
    return dealNextHand(game);
  }

  const next = structuredCloneGame(game);
  next.nextHandReady = ready;
  next.nextHandRequired = required;
  next.message = "Waiting for all active players to continue.";
  next.activity = {
    player: readyPlayer,
    text: "Waiting for all active players to continue.",
  };
  return next;
}

export function removeRequiredSeat(game: Game, seat: number) {
  if (game.phase !== "round-over") return game;
  const next = structuredCloneGame(game);
  next.nextHandRequired = (next.nextHandRequired ?? []).filter(
    (requiredSeat) => requiredSeat !== seat,
  );
  next.nextHandReady = (next.nextHandReady ?? []).filter(
    (readySeat) => readySeat !== seat,
  );
  const required = next.nextHandRequired;
  if (
    required.length > 0 &&
    required.every((requiredSeat) => next.nextHandReady?.includes(requiredSeat))
  ) {
    return dealNextHand(next);
  }
  return next;
}

// A human seat that reconnects mid round-over (e.g. after a refresh) may
// have already been dropped from nextHandRequired by the disconnect grace
// timeout. Without re-adding them, their "ready" clicks silently no-op
// forever because markReadyForNextHand only honors seats still marked
// required.
export function ensureRequiredSeat(game: Game, seat: number) {
  if (game.phase !== "round-over") return game;
  const required = uniqueSeats(game.nextHandRequired ?? []);
  if (required.includes(seat)) return game;
  const next = structuredCloneGame(game);
  next.nextHandRequired = uniqueSeats([...required, seat]);
  next.nextHandReady = uniqueSeats(next.nextHandReady ?? []).filter(
    (readySeat) => readySeat !== seat,
  );
  return next;
}
