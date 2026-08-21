import { Game, GameActionType, Tile, MeldType } from "./types";

export function appendAction(
  game: Game,
  type: GameActionType,
  actor: number,
  description: string,
) {
  const seq = game.actionSeq + 1;
  game.actionSeq = seq;
  game.actionLog = [
    ...game.actionLog.slice(-23),
    { seq, type, actor, description, at: Date.now() },
  ];
}

export function actionName(type: MeldType) {
  return type === "kong"
    ? "Gong"
    : type.charAt(0).toUpperCase() + type.slice(1);
}

export function playerVerb(
  playerName: string,
  singular: string,
  secondPerson: string,
) {
  return playerName.trim().toLowerCase() === "you" ? secondPerson : singular;
}

export function possessiveName(playerName: string) {
  const name = playerName.trim();
  if (name.toLowerCase() === "you") return "your";
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

export function tableNarration(
  kind: "deal" | "turn" | "discard" | "claim" | "kong" | "win" | "draw",
  playerName: string,
  detail?: string,
) {
  if (kind === "deal") return `${playerName}. The hand begins.`;
  if (kind === "turn")
    return playerName === "You"
      ? "Your turn. Choose a tile to discard."
      : `${playerName} is taking a turn.`;
  if (kind === "discard") return `${playerName} discarded ${detail}.`;
  if (kind === "claim")
    return `${playerName} called ${detail}. Choose a discard.`;
  if (kind === "kong")
    return `${playerName} declared ${detail}. Draw again, then discard.`;
  if (kind === "win")
    return `${playerName} ${playerVerb(playerName, "wins", "win")} by ${detail}.`;
  return "The wall is empty. This hand is a draw.";
}

export function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function sortTiles(tiles: Tile[]) {
  return [...tiles].sort(
    (a, b) => a.sort - b.sort || a.code.localeCompare(b.code),
  );
}

export function countCodes(tiles: Tile[]) {
  return tiles.reduce<Record<string, number>>((counts, tile) => {
    counts[tile.code] = (counts[tile.code] ?? 0) + 1;
    return counts;
  }, {});
}

export function withoutTiles(hand: Tile[], remove: Tile[]) {
  const removeIds = new Set(remove.map((tile) => tile.id));
  return hand.filter((tile) => !removeIds.has(tile.id));
}

export function structuredCloneGame(game: Game): Game {
  return {
    ...game,
    players: game.players.map((player) => ({
      ...player,
      hand: [...player.hand],
      flowers: [...player.flowers],
      melds: player.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
      discards: [...player.discards],
    })),
    wall: [...game.wall],
    lastDiscard: game.lastDiscard ? { ...game.lastDiscard } : undefined,
    pendingClaim: game.pendingClaim ? { ...game.pendingClaim } : undefined,
    pendingHuClaims: game.pendingHuClaims
      ? {
          ...game.pendingHuClaims,
          candidates: [...game.pendingHuClaims.candidates],
          accepted: [...game.pendingHuClaims.accepted],
          passed: [...game.pendingHuClaims.passed],
        }
      : undefined,
    claimPasses: game.claimPasses ? [...game.claimPasses] : undefined,
    pendingAddedGong: game.pendingAddedGong
      ? {
          ...game.pendingAddedGong,
          candidates: [...game.pendingAddedGong.candidates],
        }
      : undefined,
    activity: game.activity ? { ...game.activity } : undefined,
    declaredReady: game.declaredReady ? [...game.declaredReady] : undefined,
    settledBonuses: game.settledBonuses ? [...game.settledBonuses] : undefined,
    nextHandReady: game.nextHandReady ? [...game.nextHandReady] : undefined,
    nextHandRequired: game.nextHandRequired
      ? [...game.nextHandRequired]
      : undefined,
    actionLog: [...game.actionLog],
    rules: { ...game.rules },
    houseRules: game.houseRules.map((rule) => ({ ...rule })),
    winSummary: game.winSummary
      ? {
          ...game.winSummary,
          lineItems: [...game.winSummary.lineItems],
          scoreItems: game.winSummary.scoreItems.map((item) => ({ ...item })),
        }
      : undefined,
    winners: game.winners ? [...game.winners] : undefined,
    winSummaries: game.winSummaries
      ? game.winSummaries.map((summary) => ({
          ...summary,
          lineItems: [...summary.lineItems],
          scoreItems: summary.scoreItems.map((item) => ({ ...item })),
        }))
      : undefined,
  };
}

export function tileSortFromCode(code: string) {
  const prefix = code[0];
  const rank = Number(code.slice(1));
  if (prefix === "D") return rank;
  if (prefix === "B") return 20 + rank;
  if (prefix === "C") return 40 + rank;
  if (prefix === "W") return 60 + rank;
  if (prefix === "G") return 70 + rank;
  return 90 + rank;
}

export function tilePrototypeFromCode(code: string): Tile {
  const prefix = code[0];
  const rank = Number(code.slice(1));
  const suit =
    prefix === "D"
      ? "dots"
      : prefix === "B"
        ? "bamboo"
        : prefix === "C"
          ? "characters"
          : prefix === "W"
            ? "winds"
            : "dragons";
  const suitName =
    suit === "dots"
      ? "Dot"
      : suit === "bamboo"
        ? "Bamboo"
        : suit === "characters"
          ? "Character"
          : suit === "winds"
            ? "Wind"
            : "Dragon";
  return {
    id: `wait-${code}`,
    code,
    suit,
    rank,
    label: `${rank} ${suitName}`,
    short: code,
    sort: tileSortFromCode(code),
  };
}

export function kongLabel(code: string) {
  return tilePrototypeFromCode(code).label;
}

export function nextDealerForRound(game: Game) {
  return dealerContinues(game) ? game.dealer : (game.dealer + 1) % 4;
}

export function nextRoundNumber(game: Game) {
  return dealerContinues(game) ? game.round : game.round + 1;
}

export function dealerContinues(game: Game) {
  return (
    game.handResult === "draw" ||
    (game.winners?.includes(game.dealer) ?? game.winner === game.dealer)
  );
}

export function nextDealerStreak(game: Game) {
  return dealerContinues(game) ? game.dealerStreak + 1 : 0;
}
