import { Game, HouseRule, Rules, StandardRuleKey } from "./types";
import {
  countCodes,
  structuredCloneGame,
  sortTiles,
  appendAction,
  tableNarration,
} from "./helpers";

export type ScoringGroup = {
  type: "chi" | "pong";
  code: string;
  concealed: boolean;
};

export function decomposeWinningTiles(tiles: Tile[]) {
  const counts = countCodes(tiles);
  const codes = Object.keys(counts).sort(
    (a, b) => tileSortFromCode(a) - tileSortFromCode(b),
  );

  const takeSets = (
    remaining: Record<string, number>,
    groups: ScoringGroup[],
  ): ScoringGroup[] | undefined => {
    const code = Object.keys(remaining)
      .filter((key) => remaining[key] > 0)
      .sort((a, b) => tileSortFromCode(a) - tileSortFromCode(b))[0];
    if (!code) return groups;

    if (remaining[code] >= 3) {
      remaining[code] -= 3;
      const result = takeSets(remaining, [
        ...groups,
        { type: "pong", code, concealed: true },
      ]);
      remaining[code] += 3;
      if (result) return result;
    }

    const suit = code[0];
    const rank = Number(code.slice(1));
    if ((suit === "D" || suit === "B" || suit === "C") && rank <= 7) {
      const second = `${suit}${rank + 1}`;
      const third = `${suit}${rank + 2}`;
      if ((remaining[second] ?? 0) > 0 && (remaining[third] ?? 0) > 0) {
        remaining[code] -= 1;
        remaining[second] -= 1;
        remaining[third] -= 1;
        const result = takeSets(remaining, [
          ...groups,
          { type: "chi", code, concealed: true },
        ]);
        remaining[code] += 1;
        remaining[second] += 1;
        remaining[third] += 1;
        if (result) return result;
      }
    }
    return undefined;
  };

  for (const pair of codes) {
    if (counts[pair] < 2) continue;
    const remaining = { ...counts, [pair]: counts[pair] - 2 };
    const groups = takeSets(remaining, []);
    if (groups) return { pair, groups };
  }
  return undefined;
}

export function scoreStandardRules(
  game: Game,
  winner: number,
  source: "self-draw" | "discard",
  rules: HouseRule[],
) {
  const player = game.players[winner];
  const concealed = decomposeWinningTiles(player.hand);
  const concealedGroups = (concealed?.groups ?? []).map((group) => ({
    ...group,
  }));
  const winningCode =
    source === "discard" ? game.lastDiscard?.tile.code : undefined;
  if (winningCode && concealed?.pair !== winningCode) {
    const completedPung = concealedGroups.find(
      (group) => group.type === "pong" && group.code === winningCode,
    );
    if (completedPung) completedPung.concealed = false;
  }
  const exposedGroups: ScoringGroup[] = player.melds.map((meld) => ({
    type: meld.type === "chi" ? "chi" : "pong",
    code: meld.tiles[0]?.code ?? "",
    concealed: meld.concealed === true,
  }));
  const groups = [...concealedGroups, ...exposedGroups];
  const pair = concealed?.pair;
  const pongCodes = groups
    .filter((group) => group.type === "pong")
    .map((group) => group.code);
  const allTiles = [
    ...player.hand,
    ...player.melds.flatMap((meld) => meld.tiles),
  ];
  const numberedSuits = new Set(
    allTiles
      .filter((tile) => ["dots", "bamboo", "characters"].includes(tile.suit))
      .map((tile) => tile.suit),
  );
  const hasHonors = allTiles.some(
    (tile) => tile.suit === "winds" || tile.suit === "dragons",
  );
  const hasOpenMeld = player.melds.some((meld) => meld.concealed !== true);
  const dragonSets = pongCodes.filter((code) => code.startsWith("G")).length;
  const windSets = pongCodes.filter((code) => code.startsWith("W")).length;
  const concealedPungs = groups.filter(
    (group) => group.type === "pong" && group.concealed,
  ).length;
  const seatWindRank =
    ["East", "South", "West", "North"].indexOf(player.wind) + 1;
  const roundWindRank = (Math.floor((game.round - 1) / 4) % 4) + 1;
  const matchingFlowers = player.flowers.filter(
    (tile) => ((tile.rank - 1) % 4) + 1 === seatWindRank,
  ).length;
  const isConcealedSelfDraw = source === "self-draw" && !hasOpenMeld;
  const isBigThreeDragons = dragonSets === 3;
  const isBigFourWinds = windSets === 4;
  const isAllFlowers = player.flowers.length === 8;
  const values: Partial<Record<StandardRuleKey, number>> = {
    "matching-flower": isAllFlowers ? 0 : matchingFlowers,
    "dragon-pung": isBigThreeDragons ? 0 : dragonSets,
    "seat-wind": isBigFourWinds
      ? 0
      : Number(pongCodes.includes(`W${seatWindRank}`)),
    "round-wind": isBigFourWinds
      ? 0
      : Number(pongCodes.includes(`W${roundWindRank}`)),
    "self-draw": isConcealedSelfDraw ? 0 : Number(source === "self-draw"),
    dealer: Number(winner === game.dealer),
    "concealed-hand": Number(source === "discard" && !hasOpenMeld),
    "concealed-self-draw": Number(isConcealedSelfDraw),
    "last-tile": Number(game.wall.length === 0),
    "win-after-kong": Number(game.actionLog.at(-1)?.type === "kong"),
    "all-chows": Number(
      groups.length === 5 &&
        groups.every((group) => group.type === "chi") &&
        Boolean(pair && /^[DBC]/.test(pair)) &&
        source === "discard" &&
        player.flowers.length === 0 &&
        !hasHonors,
    ),
    "three-concealed-pungs": Number(concealedPungs === 3),
    "all-pungs": Number(
      groups.length === 5 && groups.every((group) => group.type === "pong"),
    ),
    "little-three-dragons": Number(
      !isBigThreeDragons && dragonSets === 2 && Boolean(pair?.startsWith("G")),
    ),
    "half-flush": Number(numberedSuits.size === 1 && hasHonors),
    "four-concealed-pungs": Number(concealedPungs === 4),
    "big-three-dragons": Number(isBigThreeDragons),
    "full-flush": Number(numberedSuits.size === 1 && !hasHonors),
    "all-honors": Number(numberedSuits.size === 0 && hasHonors),
    "five-concealed-pungs": Number(concealedPungs === 5),
    "little-four-winds": Number(
      !isBigFourWinds && windSets === 3 && Boolean(pair?.startsWith("W")),
    ),
    "big-four-winds": Number(isBigFourWinds),
    "seven-flowers": Number(player.flowers.length === 7),
    "all-flowers": Number(isAllFlowers),
  };

  if (concealedPungs === 5) {
    values["four-concealed-pungs"] = 0;
    values["three-concealed-pungs"] = 0;
  } else if (concealedPungs === 4) {
    values["three-concealed-pungs"] = 0;
  }

  return rules.flatMap((rule) => {
    if (!rule.enabled || !rule.detector) return [];
    const multiplier = values[rule.detector] ?? 0;
    return multiplier > 0
      ? [{ name: rule.name, points: rule.points * multiplier, multiplier }]
      : [];
  });
}

export function scoreRound(
  game: Game,
  winner: number,
  source: "self-draw" | "discard",
  rules: Rules,
  houseRules: HouseRule[],
) {
  const next = structuredCloneGame(game);
  const player = next.players[winner];
  if (
    source === "discard" &&
    next.lastDiscard &&
    winner !== next.lastDiscard.by
  ) {
    const winningTile = next.lastDiscard.tile;
    if (!player.hand.some((tile) => tile.id === winningTile.id)) {
      player.hand = sortTiles([...player.hand, winningTile]);
    }
    next.players[next.lastDiscard.by].discards = next.players[
      next.lastDiscard.by
    ].discards.filter((tile) => tile.id !== winningTile.id);
  }
  const scoredRules = scoreStandardRules(next, winner, source, houseRules);
  const tai = scoredRules.reduce((sum, item) => sum + item.points, 0);
  const points = rules.baseWin + tai;

  let total = 0;
  const lineItems = [
    `Base win: ${rules.baseWin}`,
    ...scoredRules.map(
      (item) =>
        `${item.name}${item.multiplier > 1 ? ` ×${item.multiplier}` : ""}: +${item.points}`,
    ),
  ];

  if (source === "self-draw") {
    next.players.forEach((opponent, index) => {
      if (index !== winner) {
        opponent.score -= points;
        player.score += points;
        total += points;
      }
    });
  } else if (next.lastDiscard) {
    next.players[next.lastDiscard.by].score -= points;
    player.score += points;
    total = points;
  }

  next.phase = "round-over";
  next.winner = winner;
  next.drawnTileId = undefined;
  next.activity = {
    player: winner,
    text: tableNarration(
      "win",
      player.name,
      source === "self-draw" ? "self draw" : "discard",
    ),
    tile: source === "discard" ? next.lastDiscard?.tile : undefined,
  };
  next.winSummary = {
    winner,
    title: winner === 0 ? "You win" : `${player.name} wins`,
    detail:
      source === "self-draw"
        ? `${player.name} wins by self draw for ${points} points from each player.`
        : `${player.name} wins on ${next.lastDiscard ? next.players[next.lastDiscard.by].name : "a"} discard for ${total} total points.`,
    points,
    total,
    lineItems,
  };
  next.message = `${player.name} wins by ${source === "self-draw" ? "self draw" : "discard"} for ${points} points${
    source === "self-draw" ? " from each player" : ""
  }.`;
  appendAction(next, "score-round", winner, next.message);
  return next;
}

// Import needed helpers
import { Tile } from "./types";
import { tileSortFromCode } from "./helpers";
