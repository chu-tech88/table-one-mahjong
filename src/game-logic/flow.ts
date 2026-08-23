import { Game, HouseRule, Rules, Tile } from "./types";
import {
  structuredCloneGame,
  sortTiles,
  withoutTiles,
  tableNarration,
  appendAction,
  playerVerb,
} from "./helpers";
import {
  isWinningHand,
  possibleChiOptions,
  canPong,
  canExposedKong,
  concealedKongOptions,
  addedKongOptions,
  waitCodesForHand,
} from "./validation";
import { chooseDiscard, shouldCall } from "./ai";
import {
  finishExhaustedHand,
  scoreMultipleWinners,
  scoreRound,
  settleAllEightFlowers,
} from "./scoring";
import { DEAD_WALL_TILES, drawNonFlower } from "./deck";

const HUMAN = 0;
type HumanSeatCheck = (index: number) => boolean;
const defaultIsHumanSeat: HumanSeatCheck = (index) => index === HUMAN;

export function advanceAfterDiscard(
  game: Game,
  discardedBy: number,
  rules: Rules,
  houseRules: HouseRule[],
  isHumanSeat: HumanSeatCheck = defaultIsHumanSeat,
) {
  let next = structuredCloneGame(game);
  const discard = next.lastDiscard;
  if (!discard) return next;

  const order = [1, 2, 3].map((offset) => (discardedBy + offset) % 4);
  const passed = new Set(next.claimPasses ?? []);
  const eligibleOrder = order.filter((index) => !passed.has(index));
  const huCandidates = eligibleOrder.filter((index) =>
    isWinningHand(
      [...next.players[index].hand, discard.tile],
      next.players[index].melds.length,
    ),
  );
  if (huCandidates.length > 0) {
    const accepted = huCandidates.filter((index) => !isHumanSeat(index));
    const pendingHumans = huCandidates.filter((index) => isHumanSeat(index));
    if (pendingHumans.length === 0) {
      return scoreMultipleWinners(
        next,
        accepted,
        "discard",
        rules,
        houseRules,
      );
    }
    next.pendingHuClaims = {
      tile: discard.tile,
      by: discardedBy,
      candidates: huCandidates,
      accepted,
      passed: [],
    };
    const firstPending = pendingHumans[0];
    next.pendingClaim = {
      tile: discard.tile,
      by: discardedBy,
      claimer: firstPending,
      canHu: true,
      canPong: false,
      canKong: false,
      canChi: false,
    };
    next.phase = "claim";
    next.message = `Waiting for responses to ${next.players[discardedBy].name}'s discard.`;
    next.activity = {
      player: discardedBy,
      text: next.message,
      tile: discard.tile,
    };
    return next;
  }

  for (const playerIndex of eligibleOrder) {
    if (next.declaredReady?.includes(playerIndex)) continue;
    const playerCanKong = canExposedKong(
      next.players[playerIndex].hand,
      discard.tile,
    );
    const playerCanPong = canPong(next.players[playerIndex].hand, discard.tile);
    if (!playerCanKong && !playerCanPong) continue;
    if (isHumanSeat(playerIndex)) {
      next.pendingClaim = {
        tile: discard.tile,
        by: discardedBy,
        claimer: playerIndex,
        canHu: false,
        canPong: playerCanPong,
        canKong: playerCanKong,
        canChi:
          (discardedBy + 1) % 4 === playerIndex &&
          possibleChiOptions(next.players[playerIndex].hand, discard.tile)
            .length > 0,
      };
      next.phase = "claim";
      const discardMessage = tableNarration(
        "discard",
        next.players[discardedBy].name,
        discard.tile.label,
      );
      next.message = `${discardMessage} ${next.players[playerIndex].name}, choose an action or pass.`;
      next.activity = {
        player: discardedBy,
        text: discardMessage,
        tile: discard.tile,
      };
      return next;
    }
    if (playerCanKong && shouldCall(next.players[playerIndex], "kong"))
      return applyClaim(
        next,
        playerIndex,
        "kong",
        undefined,
        rules,
        houseRules,
      );
    if (playerCanPong && shouldCall(next.players[playerIndex], "pong"))
      return applyClaim(
        next,
        playerIndex,
        "pong",
        undefined,
        rules,
        houseRules,
      );
  }

  const chiSeat = (discardedBy + 1) % 4;
  if (
    isHumanSeat(chiSeat) &&
    !passed.has(chiSeat) &&
    !next.declaredReady?.includes(chiSeat) &&
    possibleChiOptions(next.players[chiSeat].hand, discard.tile).length > 0
  ) {
    next.pendingClaim = {
      tile: discard.tile,
      by: discardedBy,
      claimer: chiSeat,
      canHu: false,
      canPong: false,
      canKong: false,
      canChi: true,
    };
    next.phase = "claim";
    const discardMessage = tableNarration(
      "discard",
      next.players[discardedBy].name,
      discard.tile.label,
    );
    next.message = `${discardMessage} ${next.players[chiSeat].name}, choose Chi or pass.`;
    next.activity = {
      player: discardedBy,
      text: discardMessage,
      tile: discard.tile,
    };
    return next;
  }

  const chiPlayer = (discardedBy + 1) % 4;
  if (
    !isHumanSeat(chiPlayer) &&
    !passed.has(chiPlayer) &&
    !next.declaredReady?.includes(chiPlayer) &&
    possibleChiOptions(next.players[chiPlayer].hand, discard.tile).length > 0 &&
    shouldCall(next.players[chiPlayer], "chi")
  ) {
    return applyClaim(next, chiPlayer, "chi", undefined, rules, houseRules);
  }

  return startTurn(next, (discardedBy + 1) % 4, rules, houseRules, isHumanSeat);
}

export function applyClaim(
  game: Game,
  playerIndex: number,
  type: "chi" | "pong" | "kong",
  chosenTiles?: any,
  rules?: Rules,
  houseRules?: HouseRule[],
) {
  const next = structuredCloneGame(game);
  const discard = next.lastDiscard;
  if (!discard) return next;
  if (next.pendingClaim?.canHu || next.pendingHuClaims) return next;
  const player = next.players[playerIndex];

  if (type === "pong") {
    const claimed = player.hand
      .filter((tile) => tile.code === discard.tile.code)
      .slice(0, 2);
    player.hand = sortTiles(withoutTiles(player.hand, claimed));
    player.melds.push({
      type: "pong",
      tiles: [...claimed, discard.tile],
      from: discard.by,
    });
  } else if (type === "kong") {
    const claimed = player.hand
      .filter((tile) => tile.code === discard.tile.code)
      .slice(0, 3);
    if (claimed.length !== 3) return next;
    player.hand = sortTiles(withoutTiles(player.hand, claimed));
    player.melds.push({
      type: "kong",
      tiles: [...claimed, discard.tile],
      from: discard.by,
      concealed: false,
    });
  } else {
    const chiTiles =
      chosenTiles ?? possibleChiOptions(player.hand, discard.tile)[0];
    if (!chiTiles) return next;
    player.hand = sortTiles(
      withoutTiles(
        player.hand,
        chiTiles.filter((tile: Tile) => tile.id !== discard.tile.id),
      ),
    );
    player.melds.push({
      type: "chi",
      tiles: sortTiles(chiTiles),
      from: discard.by,
    });
  }

  next.players[discard.by].discards = next.players[discard.by].discards.filter(
    (tile) => tile.id !== discard.tile.id,
  );
  next.turn = playerIndex;
  next.phase = "discard";
  next.pendingClaim = undefined;
  next.pendingHuClaims = undefined;
  next.claimPasses = undefined;
  next.lastDiscard = undefined;
  next.drawnTileId = undefined;
  const actionName =
    type === "kong" ? "Gong" : type.charAt(0).toUpperCase() + type.slice(1);
  next.message = `${player.name} ${playerVerb(player.name, "calls", "call")} ${actionName} on ${discard.tile.label}.`;
  if (player.name.trim().toLowerCase() === "you") {
    next.message += " Choose a tile to discard.";
  }
  next.activity = {
    player: playerIndex,
    text: next.message,
    tile: discard.tile,
  };
  appendAction(next, "claim", playerIndex, next.message);

  if (type === "kong") {
    if (next.wall.length <= DEAD_WALL_TILES) return finishExhaustedHand(next);
    let afterDraw = drawNonFlower(next, playerIndex);
    if (!afterDraw.drawnTileId) return finishExhaustedHand(afterDraw);
    afterDraw.drawContext = "gong-replacement";
    const settledBefore = afterDraw.settledBonuses?.length ?? 0;
    afterDraw = settleAllEightFlowers(afterDraw, playerIndex, houseRules ?? afterDraw.houseRules);
    afterDraw.turn = playerIndex;
    afterDraw.phase = "discard";
    afterDraw.pendingClaim = undefined;
    afterDraw.lastDiscard = undefined;
    if ((afterDraw.settledBonuses?.length ?? 0) === settledBefore) {
      afterDraw.message = `${player.name} ${playerVerb(player.name, "calls", "call")} Gong on ${discard.tile.label} and draws a replacement tile.`;
      afterDraw.activity = {
        player: playerIndex,
        text: afterDraw.message,
        tile: discard.tile,
      };
      appendAction(afterDraw, "kong", playerIndex, afterDraw.message);
    }
    if (
      rules &&
      houseRules &&
      isWinningHand(
        afterDraw.players[playerIndex].hand,
        afterDraw.players[playerIndex].melds.length,
      )
    ) {
      return scoreRound(afterDraw, playerIndex, "self-draw", rules, houseRules);
    }
    return afterDraw;
  }

  return next;
}

export function startTurn(
  game: Game,
  playerIndex: number,
  rules: Rules,
  houseRules: HouseRule[],
  isHumanSeat: HumanSeatCheck = defaultIsHumanSeat,
) {
  if (game.wall.length <= DEAD_WALL_TILES) return finishExhaustedHand(game);

  let next = drawNonFlower(game, playerIndex);
  if (!next.drawnTileId) return finishExhaustedHand(next);
  const settledBefore = next.settledBonuses?.length ?? 0;
  next = settleAllEightFlowers(next, playerIndex, houseRules);
  next.turn = playerIndex;
  next.lastDiscard = undefined;
  next.pendingClaim = undefined;
  next.pendingHuClaims = undefined;
  next.claimPasses = undefined;

  const player = next.players[playerIndex];
  if (isWinningHand(player.hand, player.melds.length)) {
    return scoreRound(next, playerIndex, "self-draw", rules, houseRules);
  }

  const kongCode = concealedKongOptions(player.hand)[0];
  const addedKongCode = addedKongOptions(player)[0];
  if (
    kongCode &&
    !isHumanSeat(playerIndex) &&
    Math.random() < (player.difficulty === "sharp" ? 0.75 : 0.35)
  ) {
    return applyConcealedKong(next, playerIndex, kongCode, rules, houseRules);
  } else if (
    addedKongCode &&
    !isHumanSeat(playerIndex) &&
    Math.random() < (player.difficulty === "sharp" ? 0.75 : 0.35)
  ) {
    return applyKong(next, playerIndex, addedKongCode, false, rules, houseRules, isHumanSeat);
  }

  next.phase = "discard";
  if ((next.settledBonuses?.length ?? 0) === settledBefore) {
    next.message = tableNarration("turn", player.name);
    next.activity = { player: playerIndex, text: next.message };
    appendAction(next, "draw", playerIndex, next.message);
  }
  return next;
}

export function applyKong(
  game: Game,
  playerIndex: number,
  code: string,
  concealed: boolean,
  rules: Rules,
  houseRules: HouseRule[],
  isHumanSeat: HumanSeatCheck = defaultIsHumanSeat,
) {
  if (!concealed && addedKongOptions(game.players[playerIndex]).includes(code)) {
    return beginAddedGong(game, playerIndex, code, rules, houseRules, isHumanSeat);
  }
  let next = structuredCloneGame(game);
  const player = next.players[playerIndex];
  const kongTiles = player.hand
    .filter((tile) => tile.code === code)
    .slice(0, 4);
  if (kongTiles.length !== 4) return next;
  player.hand = sortTiles(withoutTiles(player.hand, kongTiles));
  player.melds.push({ type: "kong", tiles: kongTiles, concealed });
  next.message = tableNarration(
    "kong",
    player.name,
    concealed ? "Silent Gong" : "Reveal Gong",
  );
  next.activity = { player: playerIndex, text: next.message };
  appendAction(next, "kong", playerIndex, next.message);
  next = drawNonFlower(next, playerIndex);
  if (!next.drawnTileId) return finishExhaustedHand(next);
  next.drawContext = "gong-replacement";
  next = settleAllEightFlowers(next, playerIndex, houseRules);
  if (
    isWinningHand(
      next.players[playerIndex].hand,
      next.players[playerIndex].melds.length,
    )
  ) {
    return scoreRound(next, playerIndex, "self-draw", rules, houseRules);
  }
  return next;
}

export function applyConcealedKong(
  game: Game,
  playerIndex: number,
  code: string,
  rules: Rules,
  houseRules: HouseRule[],
) {
  return applyKong(game, playerIndex, code, true, rules, houseRules);
}

export function discardTile(
  game: Game,
  playerIndex: number,
  tileId: string,
  rules: Rules,
  houseRules: HouseRule[],
  isHumanSeat: HumanSeatCheck = defaultIsHumanSeat,
) {
  const next = structuredCloneGame(game);
  const player = next.players[playerIndex];
  if (
    next.declaredReady?.includes(playerIndex) &&
    player.discards.length > 0 &&
    tileId !== next.drawnTileId
  ) {
    return next;
  }
  const tile = player.hand.find((candidate) => candidate.id === tileId);
  if (!tile) return next;
  player.hand = player.hand.filter((candidate) => candidate.id !== tileId);
  player.discards.push(tile);
  next.lastDiscard = { tile, by: playerIndex };
  next.claimPasses = undefined;
  next.pendingHuClaims = undefined;
  next.selectedId = undefined;
  next.drawnTileId = undefined;
  next.drawContext = undefined;
  next.message = tableNarration("discard", player.name, tile.label);
  next.activity = { player: playerIndex, text: next.message, tile };
  appendAction(next, "discard", playerIndex, next.message);
  const discardMessage = next.message;
  const advanced = advanceAfterDiscard(
    next,
    playerIndex,
    rules,
    houseRules,
    isHumanSeat,
  );

  // Keep the concrete discard visible during the next player's thinking time.
  // Claims, wins, flower bonuses, and other meaningful events retain priority.
  if (
    advanced.phase === "discard" &&
    advanced.turn !== playerIndex &&
    /is taking a turn\.?$/i.test(advanced.activity?.text ?? "")
  ) {
    advanced.message = discardMessage;
    advanced.activity = { player: playerIndex, text: discardMessage, tile };
  }
  return advanced;
}

export function canDeclareReady(game: Game, playerIndex: number, tileId: string) {
  const player = game.players[playerIndex];
  if (
    game.phase !== "discard" ||
    game.turn !== playerIndex ||
    game.declaredReady?.includes(playerIndex) ||
    player.melds.length > 0 ||
    player.discards.length > 0 ||
    game.actionLog.some((action) => action.type === "discard" && action.actor === playerIndex)
  ) {
    return false;
  }
  const remaining = player.hand.filter((tile) => tile.id !== tileId);
  return remaining.length !== player.hand.length && waitCodesForHand(remaining, 0).length > 0;
}

export function declareReadyAndDiscard(
  game: Game,
  playerIndex: number,
  tileId: string,
  rules: Rules,
  houseRules: HouseRule[],
  isHumanSeat: HumanSeatCheck = defaultIsHumanSeat,
) {
  if (!canDeclareReady(game, playerIndex, tileId)) return game;
  const next = structuredCloneGame(game);
  next.declaredReady = [...(next.declaredReady ?? []), playerIndex];
  const message = `${next.players[playerIndex].name} declared a ready hand.`;
  next.message = message;
  next.activity = { player: playerIndex, text: message };
  appendAction(next, "declare-ready", playerIndex, message);
  return discardTile(next, playerIndex, tileId, rules, houseRules, isHumanSeat);
}

function finishAddedGong(
  game: Game,
  rules: Rules,
  houseRules: HouseRule[],
) {
  const pending = game.pendingAddedGong;
  if (!pending) return game;
  let next = structuredCloneGame(game);
  const player = next.players[pending.player];
  const tile = player.hand.find((candidate) => candidate.id === pending.tile.id);
  const meld = player.melds[pending.meldIndex];
  if (!tile || meld?.type !== "pong") return next;
  player.hand = player.hand.filter((candidate) => candidate.id !== tile.id);
  player.melds[pending.meldIndex] = {
    ...meld,
    type: "kong",
    tiles: [...meld.tiles, tile],
    concealed: false,
  };
  next.pendingAddedGong = undefined;
  next.pendingClaim = undefined;
  next.lastDiscard = undefined;
  next.robbingGong = undefined;
  next.phase = "discard";
  next.turn = pending.player;
  next.message = tableNarration("kong", player.name, "Added Gong");
  next.activity = { player: pending.player, text: next.message };
  appendAction(next, "kong", pending.player, next.message);
  next = drawNonFlower(next, pending.player);
  if (!next.drawnTileId) return finishExhaustedHand(next);
  next.drawContext = "gong-replacement";
  next = settleAllEightFlowers(next, pending.player, houseRules);
  if (isWinningHand(next.players[pending.player].hand, next.players[pending.player].melds.length)) {
    return scoreRound(next, pending.player, "self-draw", rules, houseRules);
  }
  return next;
}

function resolveAddedGong(
  game: Game,
  rules: Rules,
  houseRules: HouseRule[],
  isHumanSeat: HumanSeatCheck,
) {
  const pending = game.pendingAddedGong;
  if (!pending || pending.candidates.length === 0) {
    return finishAddedGong(game, rules, houseRules);
  }
  const claimer = pending.candidates[0];
  if (!isHumanSeat(claimer)) {
    return scoreRound(game, claimer, "discard", rules, houseRules);
  }
  const next = structuredCloneGame(game);
  next.pendingClaim = {
    tile: pending.tile,
    by: pending.player,
    claimer,
    canHu: true,
    canPong: false,
    canKong: false,
    canChi: false,
  };
  next.phase = "claim";
  next.message = `${next.players[claimer].name} can rob the Gong and Hu.`;
  next.activity = { player: pending.player, text: next.message, tile: pending.tile };
  return next;
}

export function beginAddedGong(
  game: Game,
  playerIndex: number,
  code: string,
  rules: Rules,
  houseRules: HouseRule[],
  isHumanSeat: HumanSeatCheck = defaultIsHumanSeat,
) {
  const next = structuredCloneGame(game);
  const player = next.players[playerIndex];
  const tile = player.hand.find((candidate) => candidate.code === code);
  const meldIndex = player.melds.findIndex(
    (meld) => meld.type === "pong" && meld.tiles[0]?.code === code,
  );
  if (!tile || meldIndex < 0 || next.phase !== "discard" || next.turn !== playerIndex) return next;
  const candidates = [1, 2, 3]
    .map((offset) => (playerIndex + offset) % 4)
    .filter((index) =>
      isWinningHand([...next.players[index].hand, tile], next.players[index].melds.length),
    );
  next.pendingAddedGong = { player: playerIndex, tile, meldIndex, candidates };
  next.lastDiscard = { tile, by: playerIndex };
  next.robbingGong = true;
  return resolveAddedGong(next, rules, houseRules, isHumanSeat);
}

export function passClaim(
  game: Game,
  playerIndex: number,
  rules: Rules,
  houseRules: HouseRule[],
  isHumanSeat: HumanSeatCheck = defaultIsHumanSeat,
) {
  if (game.pendingAddedGong) {
    const next = structuredCloneGame(game);
    next.pendingAddedGong!.candidates = next.pendingAddedGong!.candidates.filter(
      (candidate) => candidate !== playerIndex,
    );
    next.pendingClaim = undefined;
    return resolveAddedGong(next, rules, houseRules, isHumanSeat);
  }
  if (game.pendingHuClaims) {
    return respondToHuClaim(
      game,
      playerIndex,
      false,
      rules,
      houseRules,
      isHumanSeat,
    );
  }
  if (game.phase !== "claim" || !game.lastDiscard) return game;
  const discardedBy = game.lastDiscard.by;
  const next = structuredCloneGame(game);
  next.claimPasses = Array.from(
    new Set([...(next.claimPasses ?? []), playerIndex]),
  );
  next.pendingClaim = undefined;
  return advanceAfterDiscard(
    next,
    discardedBy,
    rules,
    houseRules,
    isHumanSeat,
  );
}

export function respondToHuClaim(
  game: Game,
  playerIndex: number,
  accept: boolean,
  rules: Rules,
  houseRules: HouseRule[],
  isHumanSeat: HumanSeatCheck = defaultIsHumanSeat,
) {
  const pending = game.pendingHuClaims;
  if (
    !pending ||
    !pending.candidates.includes(playerIndex) ||
    pending.accepted.includes(playerIndex) ||
    pending.passed.includes(playerIndex)
  ) {
    return game;
  }

  const next = structuredCloneGame(game);
  const nextPending = next.pendingHuClaims!;
  if (accept) {
    nextPending.accepted = [...nextPending.accepted, playerIndex];
  } else {
    nextPending.passed = [...nextPending.passed, playerIndex];
  }

  const unresolved = nextPending.candidates.filter(
    (candidate) =>
      !nextPending.accepted.includes(candidate) &&
      !nextPending.passed.includes(candidate),
  );
  if (unresolved.length > 0) {
    const nextHuman = unresolved.find((candidate) => isHumanSeat(candidate));
    next.pendingClaim =
      nextHuman === undefined
        ? undefined
        : {
            tile: nextPending.tile,
            by: nextPending.by,
            claimer: nextHuman,
            canHu: true,
            canPong: false,
            canKong: false,
            canChi: false,
          };
    next.phase = "claim";
    next.message = `Waiting for responses to ${next.players[nextPending.by].name}'s discard.`;
    next.activity = {
      player: nextPending.by,
      text: next.message,
      tile: nextPending.tile,
    };
    return next;
  }

  const winners = [...nextPending.accepted];
  const discardedBy = nextPending.by;
  const allHuCandidates = [...nextPending.candidates];
  next.pendingHuClaims = undefined;
  next.pendingClaim = undefined;
  if (winners.length > 0) {
    return scoreMultipleWinners(
      next,
      winners,
      "discard",
      rules,
      houseRules,
    );
  }

  next.claimPasses = Array.from(
    new Set([...(next.claimPasses ?? []), ...allHuCandidates]),
  );
  return advanceAfterDiscard(
    next,
    discardedBy,
    rules,
    houseRules,
    isHumanSeat,
  );
}

export { HUMAN };
