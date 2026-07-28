import { Game, HouseRule, Rules, Tile } from "./types";
import {
  structuredCloneGame,
  sortTiles,
  withoutTiles,
  tableNarration,
  appendAction,
} from "./helpers";
import {
  isWinningHand,
  possibleChiOptions,
  canPong,
  canExposedKong,
  concealedKongOptions,
} from "./validation";
import { chooseDiscard, shouldCall } from "./ai";
import { scoreRound } from "./scoring";
import { drawNonFlower } from "./deck";

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
  const hu = order.find((index) =>
    isWinningHand(
      [...next.players[index].hand, discard.tile],
      next.players[index].melds.length,
    ),
  );
  if (hu !== undefined) {
    if (isHumanSeat(hu)) {
      next.pendingClaim = {
        tile: discard.tile,
        by: discardedBy,
        claimer: hu,
        canHu: true,
        canPong: canPong(next.players[hu].hand, discard.tile),
        canKong: canExposedKong(next.players[hu].hand, discard.tile),
        canChi:
          (discardedBy + 1) % 4 === hu &&
          possibleChiOptions(next.players[hu].hand, discard.tile).length > 0,
      };
      next.phase = "claim";
      next.message = `${next.players[discardedBy].name} discarded ${discard.tile.label}. ${next.players[hu].name} can win on this discard.`;
      next.activity = {
        player: discardedBy,
        text: `${next.players[hu].name} can win on this discard.`,
        tile: discard.tile,
      };
      return next;
    }
    return scoreRound(next, hu, "discard", rules, houseRules);
  }

  for (const playerIndex of order) {
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
      next.message = `${next.players[discardedBy].name} discarded ${discard.tile.label}. ${next.players[playerIndex].name}, choose an action or pass.`;
      next.activity = {
        player: discardedBy,
        text: `${next.players[playerIndex].name} can claim or pass.`,
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
    next.message = `${next.players[discardedBy].name} discarded ${discard.tile.label}. ${next.players[chiSeat].name}, choose Chi or pass.`;
    next.activity = {
      player: discardedBy,
      text: `${next.players[chiSeat].name} can Chi or pass.`,
      tile: discard.tile,
    };
    return next;
  }

  const chiPlayer = (discardedBy + 1) % 4;
  if (
    !isHumanSeat(chiPlayer) &&
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
  next.lastDiscard = undefined;
  next.drawnTileId = undefined;
  next.message = tableNarration(
    "claim",
    player.name,
    type === "kong" ? "Kong" : type.charAt(0).toUpperCase() + type.slice(1),
  );
  next.activity = { player: playerIndex, text: next.message };
  appendAction(next, "claim", playerIndex, next.message);

  if (type === "kong") {
    if (next.wall.length === 0) {
      return {
        ...next,
        phase: "round-over" as any,
        message: tableNarration("draw", ""),
      };
    }
    const afterDraw = drawNonFlower(next, playerIndex);
    afterDraw.turn = playerIndex;
    afterDraw.phase = "discard";
    afterDraw.pendingClaim = undefined;
    afterDraw.lastDiscard = undefined;
    afterDraw.message = tableNarration("kong", player.name, "Kong");
    afterDraw.activity = { player: playerIndex, text: afterDraw.message };
    appendAction(afterDraw, "kong", playerIndex, afterDraw.message);
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
  if (game.wall.length === 0) {
    return {
      ...game,
      phase: "round-over" as any,
      message: tableNarration("draw", ""),
    };
  }

  let next = drawNonFlower(game, playerIndex);
  next.turn = playerIndex;
  next.lastDiscard = undefined;
  next.pendingClaim = undefined;

  const player = next.players[playerIndex];
  if (isWinningHand(player.hand, player.melds.length)) {
    return scoreRound(next, playerIndex, "self-draw", rules, houseRules);
  }

  const kongCode = concealedKongOptions(player.hand)[0];
  if (
    kongCode &&
    !isHumanSeat(playerIndex) &&
    Math.random() < (player.difficulty === "sharp" ? 0.75 : 0.35)
  ) {
    next = applyConcealedKong(next, playerIndex, kongCode, rules, houseRules);
  }

  next.phase = "discard";
  next.message = tableNarration("turn", player.name);
  next.activity = { player: playerIndex, text: next.message };
  appendAction(next, "draw", playerIndex, next.message);
  return next;
}

export function applyKong(
  game: Game,
  playerIndex: number,
  code: string,
  concealed: boolean,
  rules: Rules,
  houseRules: HouseRule[],
) {
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
    concealed ? "Silent Kong" : "Reveal Kong",
  );
  next.activity = { player: playerIndex, text: next.message };
  appendAction(next, "kong", playerIndex, next.message);
  next = drawNonFlower(next, playerIndex);
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
  const tile = player.hand.find((candidate) => candidate.id === tileId);
  if (!tile) return next;
  player.hand = player.hand.filter((candidate) => candidate.id !== tileId);
  player.discards.push(tile);
  next.lastDiscard = { tile, by: playerIndex };
  next.selectedId = undefined;
  next.drawnTileId = undefined;
  next.message = tableNarration("discard", player.name, tile.label);
  next.activity = { player: playerIndex, text: next.message, tile };
  appendAction(next, "discard", playerIndex, next.message);
  return advanceAfterDiscard(next, playerIndex, rules, houseRules, isHumanSeat);
}

export { HUMAN };
