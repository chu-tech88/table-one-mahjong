import { Tile } from "./types";
import { countCodes, tileSortFromCode } from "./helpers";
import { handProgressScore, highValueHandPotential } from "./ai";

export type GuidanceMode = "off" | "strategy";

export type CoachTarget =
  | "drawn-tile"
  | "suggested-tile"
  | "chi"
  | "pong"
  | "gong"
  | "hu";

export type HandShapeGroup = {
  kind: "set" | "pair" | "connected" | "single";
  label: string;
  tiles: Tile[];
};

export type HandShapeBreakdown = {
  revealedSets: number;
  groups: HandShapeGroup[];
};

export type CoachLesson = {
  id: string;
  eyebrow: "Rules guide" | "Strategy coach";
  title: string;
  body: string;
  target?: CoachTarget;
  tileId?: string;
  details?: Array<{ label: string; text: string }>;
  handShape?: HandShapeBreakdown;
  alternatives?: Array<{ tileId: string; label: string; reason: string }>;
  learnTopic?: "objective" | "turn" | "chi" | "pong" | "gong" | "hu" | "scoring";
};

type ShapeCodeGroup = {
  kind: HandShapeGroup["kind"];
  codes: string[];
};

const shapeGroupScore: Record<HandShapeGroup["kind"], number> = {
  set: 100,
  pair: 25,
  connected: 12,
  single: -1,
};

function removeCodes(counts: Record<string, number>, codes: string[]) {
  const next = { ...counts };
  codes.forEach((code) => {
    next[code] -= 1;
  });
  return next;
}

function bestShapeCodeGroups(tiles: Tile[]) {
  const initialCounts = countCodes(tiles.filter((tile) => !tile.flower));
  const memo = new Map<string, { score: number; groups: ShapeCodeGroup[] }>();

  const solve = (
    counts: Record<string, number>,
  ): { score: number; groups: ShapeCodeGroup[] } => {
    const remainingCodes = Object.keys(counts)
      .filter((code) => counts[code] > 0)
      .sort((a, b) => tileSortFromCode(a) - tileSortFromCode(b));
    if (remainingCodes.length === 0) return { score: 0, groups: [] };

    const key = remainingCodes.map((code) => `${code}:${counts[code]}`).join("|");
    const cached = memo.get(key);
    if (cached) return cached;

    const code = remainingCodes[0];
    const suit = code[0];
    const rank = Number(code.slice(1));
    const options: ShapeCodeGroup[] = [];

    if (counts[code] >= 3) {
      options.push({ kind: "set", codes: [code, code, code] });
    }
    if (suit === "D" || suit === "B" || suit === "C") {
      const second = `${suit}${rank + 1}`;
      const third = `${suit}${rank + 2}`;
      if (rank <= 7 && (counts[second] ?? 0) > 0 && (counts[third] ?? 0) > 0) {
        options.push({ kind: "set", codes: [code, second, third] });
      }
    }
    if (counts[code] >= 2) {
      options.push({ kind: "pair", codes: [code, code] });
    }
    if (suit === "D" || suit === "B" || suit === "C") {
      for (const distance of [1, 2]) {
        const neighbor = `${suit}${rank + distance}`;
        if ((counts[neighbor] ?? 0) > 0) {
          options.push({ kind: "connected", codes: [code, neighbor] });
        }
      }
    }
    options.push({ kind: "single", codes: [code] });

    const best = options
      .map((group) => {
        const remainder = solve(removeCodes(counts, group.codes));
        const connectionBonus =
          group.kind === "connected" &&
          Number(group.codes[1].slice(1)) - Number(group.codes[0].slice(1)) === 1
            ? 2
            : 0;
        return {
          score: shapeGroupScore[group.kind] + connectionBonus + remainder.score,
          groups: [group, ...remainder.groups],
        };
      })
      .sort((a, b) => b.score - a.score)[0];

    memo.set(key, best);
    return best;
  };

  return solve(initialCounts).groups;
}

export function explainHandShape(
  hand: Tile[],
  revealedSets = 0,
): HandShapeBreakdown {
  const tilesByCode = new Map<string, Tile[]>();
  hand
    .filter((tile) => !tile.flower)
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
    .forEach((tile) => {
      tilesByCode.set(tile.code, [...(tilesByCode.get(tile.code) ?? []), tile]);
    });

  const groups = bestShapeCodeGroups(hand).map((group) => {
    const tiles = group.codes.map((code) => tilesByCode.get(code)!.shift()!);
    const isPong = group.kind === "set" && new Set(group.codes).size === 1;
    return {
      kind: group.kind,
      label:
        group.kind === "set"
          ? isPong
            ? "Completed Pong"
            : "Completed Chi"
          : group.kind === "pair"
            ? "Pair"
            : group.kind === "connected"
              ? "Connected"
              : "Single",
      tiles,
    } satisfies HandShapeGroup;
  });

  const singles = groups.filter((group) => group.kind === "single");
  const usefulGroups = groups.filter((group) => group.kind !== "single");
  if (singles.length > 0) {
    usefulGroups.push({
      kind: "single",
      label: singles.length === 1 ? "Single" : "Singles",
      tiles: singles.flatMap((group) => group.tiles),
    });
  }

  const order: Record<HandShapeGroup["kind"], number> = {
    set: 0,
    pair: 1,
    connected: 2,
    single: 3,
  };
  usefulGroups.sort((a, b) => order[a.kind] - order[b.kind]);
  return { revealedSets, groups: usefulGroups };
}

function discardUtility(hand: Tile[], tile: Tile, meldCount: number) {
  const remaining = hand.filter((candidate) => candidate.id !== tile.id);
  const counts = countCodes(hand);
  const copies = (counts[tile.code] ?? 1) - 1;
  const isSuited = ["dots", "bamboo", "characters"].includes(tile.suit);
  const closeNeighbors = isSuited
    ? remaining.filter(
        (candidate) =>
          candidate.suit === tile.suit &&
          Math.abs(candidate.rank - tile.rank) === 1,
      ).length
    : 0;
  const wideNeighbors = isSuited
    ? remaining.filter(
        (candidate) =>
          candidate.suit === tile.suit &&
          Math.abs(candidate.rank - tile.rank) === 2,
      ).length
    : 0;

  return (
    handProgressScore(remaining, meldCount) * 3 +
    highValueHandPotential(remaining) -
    copies * 7 -
    closeNeighbors * 3 -
    wideNeighbors
  );
}

function handShapeSummary(hand: Tile[], meldCount: number) {
  const counts = countCodes(hand);
  const pairs = Object.values(counts).filter((count) => count >= 2).length;
  const triplets = Object.values(counts).filter((count) => count >= 3).length;
  const connected = hand.filter((tile, index) =>
    hand.some(
      (candidate, candidateIndex) =>
        candidateIndex !== index &&
        candidate.suit === tile.suit &&
        [1, 2].includes(Math.abs(candidate.rank - tile.rank)),
    ),
  ).length;
  const suitCounts = ["dots", "bamboo", "characters"].map((suit) => ({
    suit,
    count: hand.filter((tile) => tile.suit === suit).length,
  }));
  const dominant = suitCounts.sort((a, b) => b.count - a.count)[0];
  const plan =
    dominant.count >= Math.ceil(hand.length * 0.55)
      ? `Your strongest direction is ${dominant.suit}; keep its connected tiles flexible.`
      : triplets + meldCount >= 3
        ? "Your hand is triplet-heavy; protect pairs that can become Pongs."
        : "Your hand is mixed; prioritize pairs and connected numbered tiles over isolated tiles.";
  return { pairs, triplets, connected, plan };
}

export function recommendDiscard(
  hand: Tile[],
  meldCount: number,
  publicTiles: Tile[] = [],
) {
  if (hand.length === 0) return undefined;

  const ranked = [...hand]
    .map((tile) => ({ tile, utility: discardUtility(hand, tile, meldCount) }))
    .sort(
      (a, b) =>
        b.utility - a.utility ||
        b.tile.sort - a.tile.sort ||
        b.tile.id.localeCompare(a.tile.id),
    );
  const uniqueRanked = ranked.filter(
    (option, index) =>
      ranked.findIndex((candidate) => candidate.tile.code === option.tile.code) ===
      index,
  );
  const tile = uniqueRanked[0].tile;
  const counts = countCodes(hand);
  const publicCounts = countCodes(publicTiles);
  const copies = counts[tile.code] ?? 1;
  const neighbors = hand.filter(
    (candidate) =>
      candidate.id !== tile.id &&
      candidate.suit === tile.suit &&
      Math.abs(candidate.rank - tile.rank) <= 2,
  ).length;

  const reason =
    tile.suit === "winds" || tile.suit === "dragons"
      ? copies === 1
        ? "It is a single honor tile, so it cannot join a sequence and currently has no matching partner."
        : "This keeps more connected groups available while preserving your strongest pairs."
      : copies === 1 && neighbors === 0
        ? "It is isolated from matching and nearby tiles, so removing it preserves more useful combinations."
        : "This choice preserves the hand's strongest pairs and connected sequences."

  const remainingHand = hand.filter((candidate) => candidate.id !== tile.id);
  const remainingShape = handShapeSummary(remainingHand, meldCount);
  const visibleCopies = publicCounts[tile.code] ?? 0;
  const impact = `Keeps ${remainingShape.pairs} pair${remainingShape.pairs === 1 ? "" : "s"} and ${remainingShape.connected} connected numbered tile${remainingShape.connected === 1 ? "" : "s"}.`;
  const visibilityNote =
    visibleCopies >= 2
      ? `${visibleCopies} copies are already visible, so this tile has less remaining potential.`
      : "Few copies are visible, so keep watching opponents' revealed sets and recent discards.";

  return {
    tile,
    reason,
    plan: handShapeSummary(hand, meldCount).plan,
    impact,
    visibilityNote,
    handShape: explainHandShape(remainingHand, meldCount),
    alternatives: uniqueRanked.slice(1, 3).map((option) => ({
      tile: option.tile,
      reason:
        option.tile.suit === "winds" || option.tile.suit === "dragons"
          ? "A reasonable honor discard if you prefer to preserve numbered-tile flexibility."
          : "A close alternative that keeps most of the same pairs and sequence shapes.",
    })),
  };
}
