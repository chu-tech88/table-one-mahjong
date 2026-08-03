import { Game, HouseRule, Rules, StandardRuleKey, Tile } from "./types";
import {
  appendAction,
  countCodes,
  sortTiles,
  structuredCloneGame,
  tableNarration,
  tileSortFromCode,
} from "./helpers";
import { waitCodesForHand } from "./validation";

export type ScoringGroup = {
  type: "chi" | "pong";
  code: string;
  concealed: boolean;
};

export type WinningDecomposition = {
  pair: string;
  groups: ScoringGroup[];
};

function groupCodes(group: ScoringGroup) {
  if (group.type === "pong") return [group.code, group.code, group.code];
  const prefix = group.code[0];
  const rank = Number(group.code.slice(1));
  return [group.code, `${prefix}${rank + 1}`, `${prefix}${rank + 2}`];
}

export function decomposeAllWinningTiles(tiles: Tile[]) {
  const counts = countCodes(tiles.filter((tile) => !tile.flower));
  const codes = Object.keys(counts).sort(
    (a, b) => tileSortFromCode(a) - tileSortFromCode(b),
  );
  const results: WinningDecomposition[] = [];

  const takeSets = (
    remaining: Record<string, number>,
    groups: ScoringGroup[],
    pair: string,
  ) => {
    const code = Object.keys(remaining)
      .filter((key) => remaining[key] > 0)
      .sort((a, b) => tileSortFromCode(a) - tileSortFromCode(b))[0];
    if (!code) {
      results.push({ pair, groups });
      return;
    }

    if (remaining[code] >= 3) {
      remaining[code] -= 3;
      takeSets(remaining, [...groups, { type: "pong", code, concealed: true }], pair);
      remaining[code] += 3;
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
        takeSets(remaining, [...groups, { type: "chi", code, concealed: true }], pair);
        remaining[code] += 1;
        remaining[second] += 1;
        remaining[third] += 1;
      }
    }
  };

  for (const pair of codes) {
    if (counts[pair] < 2) continue;
    takeSets({ ...counts, [pair]: counts[pair] - 2 }, [], pair);
  }

  const seen = new Set<string>();
  return results.filter((result) => {
    const signature = `${result.pair}|${result.groups
      .map((group) => `${group.type}:${group.code}`)
      .sort()
      .join("|")}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

export function decomposeWinningTiles(tiles: Tile[]) {
  return decomposeAllWinningTiles(tiles)[0];
}

function maxSequentialRun(codes: string[]) {
  let longest = 0;
  for (const prefix of ["D", "B", "C"]) {
    const ranks = new Set(
      codes.filter((code) => code.startsWith(prefix)).map((code) => Number(code.slice(1))),
    );
    for (const rank of ranks) {
      let length = 0;
      while (ranks.has(rank + length)) length += 1;
      longest = Math.max(longest, length);
    }
  }
  return longest;
}

function includesEveryFamily(tiles: Tile[]) {
  return ["dots", "bamboo", "characters", "winds", "dragons"].every((suit) =>
    tiles.some((tile) => tile.suit === suit),
  );
}

function evaluateDecomposition(
  game: Game,
  winner: number,
  source: "self-draw" | "discard",
  decomposition: WinningDecomposition | undefined,
) {
  const player = game.players[winner];
  const winningTile =
    source === "discard"
      ? game.lastDiscard?.tile
      : player.hand.find((tile) => tile.id === game.drawnTileId);
  const winningCode = winningTile?.code;
  const concealedGroups = (decomposition?.groups ?? []).map((group) => ({ ...group }));
  if (source === "discard" && winningCode && decomposition?.pair !== winningCode) {
    const completedPong = concealedGroups.find(
      (group) => group.type === "pong" && group.code === winningCode,
    );
    if (completedPong) completedPong.concealed = false;
  }
  const exposedGroups: ScoringGroup[] = player.melds.map((meld) => ({
    type: meld.type === "chi" ? "chi" : "pong",
    code: meld.tiles[0]?.code ?? "",
    concealed: meld.concealed === true,
  }));
  const groups = [...concealedGroups, ...exposedGroups];
  const pair = decomposition?.pair;
  const allTiles = [...player.hand, ...player.melds.flatMap((meld) => meld.tiles)];
  const pongCodes = groups.filter((group) => group.type === "pong").map((group) => group.code);
  const chiCodes = groups.filter((group) => group.type === "chi").map((group) => group.code);
  const concealedTriplets = groups.filter((group) => group.type === "pong" && group.concealed).length;
  const revealedGongs = player.melds.filter((meld) => meld.type === "kong" && !meld.concealed).length;
  const concealedGongs = player.melds.filter((meld) => meld.type === "kong" && meld.concealed).length;
  const gongCount = revealedGongs + concealedGongs;
  const windSets = pongCodes.filter((code) => code.startsWith("W")).length;
  const dragonSets = pongCodes.filter((code) => code.startsWith("G")).length;
  const numberedSuits = new Set(
    allTiles.filter((tile) => ["dots", "bamboo", "characters"].includes(tile.suit)).map((tile) => tile.suit),
  );
  const hasHonors = allTiles.some((tile) => tile.suit === "winds" || tile.suit === "dragons");
  const hasOpenMeld = player.melds.some((meld) => meld.concealed !== true);

  const beforeWin = winningTile
    ? player.hand.filter((tile) => tile.id !== winningTile.id)
    : player.hand;
  const waits = winningCode ? waitCodesForHand(beforeWin, player.melds.length) : [];
  const winningDecompositions = decomposeAllWinningTiles(player.hand);
  const pairWaits = waits.filter(
    (code) => beforeWin.filter((tile) => tile.code === code).length === 1,
  );
  const allGameTiles = game.players.flatMap((candidate) => [
    ...candidate.hand,
    ...candidate.melds.flatMap((meld) => meld.tiles),
    ...candidate.discards,
  ]);
  const copiesBeforeWin = (code: string) =>
    allGameTiles.filter((tile) => tile.code === code && tile.id !== winningTile?.id).length;

  const chiFrequency = new Map<string, number>();
  chiCodes.forEach((code) => chiFrequency.set(code, (chiFrequency.get(code) ?? 0) + 1));
  const maximumMatchingChi = Math.max(0, ...chiFrequency.values());
  const hasSisterChi = Array.from({ length: 7 }, (_, index) => index + 1).some((rank) =>
    ["D", "B", "C"].every((prefix) => chiCodes.includes(`${prefix}${rank}`)),
  );
  const pongRun = maxSequentialRun(pongCodes);
  const sameRankPongs = Array.from({ length: 9 }, (_, index) => index + 1).some((rank) =>
    ["D", "B", "C"].every((prefix) => pongCodes.includes(`${prefix}${rank}`)),
  );
  const hasLongDragon = ["D", "B", "C"].some((prefix) =>
    [`${prefix}1`, `${prefix}4`, `${prefix}7`].every((code) => chiCodes.includes(code)),
  );
  const hasBigSmallChi = ["D", "B", "C"].some(
    (prefix) => chiCodes.includes(`${prefix}1`) && chiCodes.includes(`${prefix}7`),
  );
  const hasTerminalPongs = ["D", "B", "C"].some(
    (prefix) => pongCodes.includes(`${prefix}1`) && pongCodes.includes(`${prefix}9`),
  );
  const hasThreeConsecutivePairs = ["D", "B", "C"].some((prefix) =>
    Array.from({ length: 7 }, (_, index) => index + 1).some((rank) => {
      const run = [rank, rank + 1, rank + 2].map((value) => `${prefix}${value}`);
      return Boolean(pair && run.includes(pair) && run.filter((code) => pongCodes.includes(code)).length === 2);
    }),
  );
  const hasLittleThreeWinds = windSets === 2 && Boolean(pair?.startsWith("W"));
  const hasLittleThreeDragons = dragonSets === 2 && Boolean(pair?.startsWith("G"));
  const allChi = groups.length === 5 && groups.every((group) => group.type === "chi");
  const allPongs = groups.length === 5 && groups.every((group) => group.type === "pong");
  const tileCounts = countCodes(allTiles);
  const groupLocations = (code: string) =>
    groups.filter((group) => groupCodes(group).includes(code)).length + Number(pair === code);
  const fourCopyCodes = Object.keys(tileCounts).filter(
    (code) => tileCounts[code] === 4 && !player.melds.some((meld) => meld.type === "kong" && meld.tiles[0]?.code === code),
  );
  const ranks = new Set(
    allTiles.filter((tile) => ["dots", "bamboo", "characters"].includes(tile.suit)).map((tile) => tile.rank),
  );
  const allTerminalOrHonor = allTiles.every(
    (tile) => tile.suit === "winds" || tile.suit === "dragons" || tile.rank === 1 || tile.rank === 9,
  );
  const allSimple = allTiles.every(
    (tile) => ["dots", "bamboo", "characters"].includes(tile.suit) && tile.rank >= 2 && tile.rank <= 8,
  );
  const terminalOrHonorSet = (group: ScoringGroup) =>
    group.code.startsWith("W") || group.code.startsWith("G") ||
    (group.type === "pong" && /[19]$/.test(group.code)) ||
    (group.type === "chi" && /[17]$/.test(group.code));
  const everySetHasTerminalOrHonor =
    groups.length === 5 && groups.every(terminalOrHonorSet) && Boolean(pair && (/^[WG]/.test(pair) || /[19]$/.test(pair)));
  const firstDiscardWin =
    source === "discard" &&
    game.lastDiscard?.by === game.dealer &&
    game.actionLog.filter((action) => action.type === "discard").length === 1;
  const dealerInitialWin =
    source === "self-draw" && winner === game.dealer &&
    game.actionLog.every((action) => action.type === "deal-hand");
  const doubleTerminalChi =
    ["D", "B", "C"].some((prefix) => (chiFrequency.get(`${prefix}1`) ?? 0) >= 2) &&
    ["D", "B", "C"].some((prefix) => (chiFrequency.get(`${prefix}7`) ?? 0) >= 2);
  const doubleTerminalPongs =
    pongCodes.filter((code) => /^[DBC]1$/.test(code)).length >= 2 &&
    pongCodes.filter((code) => /^[DBC]9$/.test(code)).length >= 2;
  const twinDragons = [...chiFrequency.values()].filter((count) => count >= 2).length >= 2;

  const values: Partial<Record<StandardRuleKey, number>> = {
    dealer: Number(winner === game.dealer),
    flower: player.flowers.length,
    "no-flowers": Number(player.flowers.length === 0),
    "wind-or-dragon": windSets + dragonSets,
    "no-wind-or-dragon": Number(windSets + dragonSets === 0 && !pair?.startsWith("W") && !pair?.startsWith("G")),
    "waiting-one-with-option": Number(waits.length === 1 && winningDecompositions.length > 1),
    "self-draw": Number(source === "self-draw"),
    "dual-wait": Number(waits.length === 2 && pairWaits.length === 2),
    "revealed-gong": revealedGongs,
    "flower-replacement-win": Number(game.drawContext === "flower-replacement"),
    "pair-win": Number(Boolean(winningCode && pair === winningCode)),
    "concealed-hand": Number(!hasOpenMeld),
    "pure-single-wait": Number(waits.length === 1 && winningDecompositions.length === 1),
    "concealed-gong": concealedGongs,
    "two-concealed-pongs": Number(concealedTriplets === 2),
    "pure-double-chi": Number(maximumMatchingChi === 2),
    "big-small-chi": Number(hasBigSmallChi),
    "terminal-pongs": Number(hasTerminalPongs),
    "four-in-one": fourCopyCodes.length,
    "missing-two-suits": Number(numberedSuits.size === 1),
    "all-simple": Number(allSimple),
    "small-chi": Number(allChi && hasHonors),
    "robbing-gong": Number(game.robbingGong === true),
    "last-tile-draw": Number(source === "self-draw" && game.wall.length <= 8),
    "gong-replacement-win": Number(game.drawContext === "gong-replacement"),
    "two-four-in-ones": Number(fourCopyCodes.length >= 2),
    "two-gongs-two-concealed-triplets": Number(gongCount === 2 && concealedTriplets >= 2),
    "single-wait-last-tile": Number(waits.length === 1 && waits.every((code) => copiesBeforeWin(code) === 3)),
    "three-consecutive-pairs": Number(hasThreeConsecutivePairs),
    "five-families": Number(includesEveryFamily(allTiles)),
    "three-sister-chi": Number(hasSisterChi),
    "three-concealed-triplets": Number(concealedTriplets === 3),
    "mixed-terminals-honors": Number(allTerminalOrHonor && hasHonors),
    "eight-exhausted-tiles": Number(waits.length === 2 && waits.every((code) => copiesBeforeWin(code) === 3)),
    "big-chi": Number(allChi && !hasHonors),
    "same-number-pongs": Number(sameRankPongs),
    "three-shifted-pongs": Number(pongRun === 3),
    "pure-triple-chi": Number(maximumMatchingChi === 3),
    "one-long-dragon": Number(hasLongDragon),
    "little-three-winds": Number(hasLittleThreeWinds),
    "all-pongs": Number(allPongs),
    "one-mixed-suit": Number(numberedSuits.size === 1 && hasHonors),
    "pure-terminals": Number(allTerminalOrHonor && !hasHonors),
    "double-terminal-sequence": Number(doubleTerminalChi),
    "double-terminal-triplets": Number(doubleTerminalPongs),
    "five-consecutive-pongs": Number(pongRun === 5),
    "three-gongs-three-triplets": Number(gongCount === 3 && pongCodes.length >= 3),
    "big-three-winds": Number(windSets === 3),
    "little-three-dragons": Number(hasLittleThreeDragons),
    "four-concealed-triplets": Number(concealedTriplets === 4),
    "four-shifted-triplets": Number(pongRun === 4),
    "declaration-win": Number(game.declaredReady?.includes(winner)),
    "twin-dragons": Number(twinDragons),
    "little-four-winds": Number(windSets === 3 && pair?.startsWith("W")),
    "big-three-dragons": Number(dragonSets === 3),
    "four-in-four": Number(fourCopyCodes.some((code) => groupLocations(code) === 4)),
    "three-digits": Number(!hasHonors && ranks.size === 3),
    "terminals-or-honors-every-set": Number(everySetHasTerminalOrHonor),
    "four-gongs-four-triplets": Number(gongCount === 4 && pongCodes.length >= 4),
    "big-four-winds": Number(windSets === 4),
    "pure-one-suit": Number(numberedSuits.size === 1 && !hasHonors),
    "all-eight-flowers": 0,
    "heavenly-win": Number(dealerInitialWin || firstDiscardWin),
    "five-concealed-triplets": Number(concealedTriplets === 5),
    "five-shifted-triplets": Number(pongRun === 5),
    "all-winds-dragons": Number(numberedSuits.size === 0 && hasHonors),
    "pure-quadruple-chi": Number(maximumMatchingChi === 4),
  };
  return values;
}

export function settleAllEightFlowers(
  game: Game,
  playerIndex: number,
  houseRules: HouseRule[] = game.houseRules,
) {
  const rule = houseRules.find(
    (candidate) => candidate.detector === "all-eight-flowers" && candidate.enabled,
  );
  const settlementId = `all-eight-flowers:${playerIndex}`;
  if (
    !rule ||
    game.players[playerIndex].flowers.length < 8 ||
    game.settledBonuses?.includes(settlementId)
  ) {
    return game;
  }

  const next = structuredCloneGame(game);
  const winner = next.players[playerIndex];
  next.players.forEach((player, index) => {
    if (index === playerIndex) return;
    player.score -= rule.points;
    winner.score += rule.points;
  });
  next.settledBonuses = [...(next.settledBonuses ?? []), settlementId];
  next.message = `${winner.name} collected all eight flowers. Each opponent pays ${rule.points} points; play continues.`;
  next.activity = { player: playerIndex, text: next.message };
  appendAction(next, "score-bonus", playerIndex, next.message);
  return next;
}

export function scoreStandardRules(
  game: Game,
  winner: number,
  source: "self-draw" | "discard",
  rules: HouseRule[],
) {
  const decompositions = decomposeAllWinningTiles(game.players[winner].hand);
  const candidates = decompositions.length > 0 ? decompositions : [undefined];
  const scoredCandidates = candidates.map((decomposition) => {
    const values = evaluateDecomposition(game, winner, source, decomposition);
    const scored = rules.flatMap((rule) => {
      if (!rule.enabled || !rule.detector || rule.detector === "little-win") return [];
      const multiplier = values[rule.detector] ?? 0;
      return multiplier > 0
        ? [{
            name: rule.name,
            description: rule.description,
            points:
              rule.detector === "dealer"
                ? rule.points + Math.max(0, game.dealerStreak) * 2
                : rule.points * multiplier,
            multiplier,
          }]
        : [];
    });
    return { scored, total: scored.reduce((sum, item) => sum + item.points, 0) };
  });
  const best = scoredCandidates.sort((a, b) => b.total - a.total)[0] ?? { scored: [], total: 0 };
  const littleWin = rules.find((rule) => rule.detector === "little-win" && rule.enabled);
  if (best.total === 1 && littleWin) {
    return [{
      name: littleWin.name,
      description: littleWin.description,
      points: littleWin.points,
      multiplier: 1,
    }];
  }
  return best.scored;
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
  if (source === "discard" && next.robbingGong && next.pendingAddedGong) {
    const robbed = next.pendingAddedGong;
    next.players[robbed.player].hand = next.players[robbed.player].hand.filter(
      (tile) => tile.id !== robbed.tile.id,
    );
  }
  if (source === "discard" && next.lastDiscard && winner !== next.lastDiscard.by) {
    const winningTile = next.lastDiscard.tile;
    if (!player.hand.some((tile) => tile.id === winningTile.id)) {
      player.hand = sortTiles([...player.hand, winningTile]);
    }
    next.players[next.lastDiscard.by].discards = next.players[next.lastDiscard.by].discards.filter(
      (tile) => tile.id !== winningTile.id,
    );
  }
  const scoredRules = scoreStandardRules(next, winner, source, houseRules);
  const bonusPoints = scoredRules.reduce((sum, item) => sum + item.points, 0);
  const points = rules.baseWin + bonusPoints;
  const dealerRule = houseRules.find(
    (rule) => rule.detector === "dealer" && rule.enabled,
  );
  const dealerLossBonus =
    winner !== next.dealer && dealerRule
      ? dealerRule.points + Math.max(0, next.dealerStreak) * 2
      : 0;
  let total = 0;
  let dealerBonusPaid = 0;
  const lineItems = [
    `Base win: ${rules.baseWin}`,
    ...scoredRules.map((item) =>
      `${item.name}${item.multiplier > 1 ? ` x${item.multiplier}` : ""}: +${item.points}`,
    ),
  ];

  if (source === "self-draw") {
    next.players.forEach((opponent, index) => {
      if (index !== winner) {
        const payment = points + (index === next.dealer ? dealerLossBonus : 0);
        opponent.score -= payment;
        player.score += payment;
        total += payment;
        if (index === next.dealer) dealerBonusPaid = dealerLossBonus;
      }
    });
  } else if (next.lastDiscard) {
    dealerBonusPaid =
      next.lastDiscard.by === next.dealer ? dealerLossBonus : 0;
    const payment = points + dealerBonusPaid;
    next.players[next.lastDiscard.by].score -= payment;
    player.score += payment;
    total = payment;
  }

  const scoreItems = [...scoredRules];
  if (dealerBonusPaid > 0) {
    const item = {
      name: "Dealer loss",
      description: `The dealer pays 1 point plus 2 for each consecutive deal (${next.dealerStreak} consecutive).`,
      points: dealerBonusPaid,
      multiplier: 1,
    };
    scoreItems.push(item);
    lineItems.push(`${item.name}: +${item.points}`);
  }

  next.phase = "round-over";
  next.pendingAddedGong = undefined;
  next.robbingGong = undefined;
  next.winner = winner;
  next.handResult = "win";
  next.drawnTileId = undefined;
  next.activity = {
    player: winner,
    text: tableNarration("win", player.name, source === "self-draw" ? "self draw" : "discard"),
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
    scoreItems,
  };
  next.message = `${player.name} wins by ${source === "self-draw" ? "self draw" : "discard"} for ${points} points${
    source === "self-draw" ? " from each player" : ""
  }.`;
  appendAction(next, "score-round", winner, next.message);
  return next;
}

export function finishExhaustedHand(game: Game) {
  const next = structuredCloneGame(game);
  const nextStreak = next.dealerStreak + 1;
  next.phase = "round-over";
  next.handResult = "draw";
  next.winner = undefined;
  next.pendingClaim = undefined;
  next.pendingAddedGong = undefined;
  next.lastDiscard = undefined;
  next.drawnTileId = undefined;
  next.robbingGong = undefined;
  next.message = "No tiles remaining. The dealer continues for the next hand.";
  next.activity = { player: next.dealer, text: next.message };
  next.winSummary = {
    title: "No tiles remaining",
    detail: `Eight dead-wall tiles remain. ${next.players[next.dealer].name} continues as dealer with a +${nextStreak * 2} consecutive-dealer bonus next hand.`,
    points: 0,
    total: 0,
    lineItems: ["Wall exhausted: no score payment"],
    scoreItems: [],
  };
  appendAction(next, "hand-draw", next.dealer, next.message);
  return next;
}
