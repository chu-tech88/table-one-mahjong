import { Tile } from "./types";
import { countCodes } from "./helpers";
import { handProgressScore, highValueHandPotential } from "./ai";

export type GuidanceMode = "off" | "strategy";

export type CoachTarget =
  | "drawn-tile"
  | "suggested-tile"
  | "chi"
  | "pong"
  | "gong"
  | "hu";

export type CoachLesson = {
  id: string;
  eyebrow: "Rules guide" | "Strategy coach";
  title: string;
  body: string;
  target?: CoachTarget;
  tileId?: string;
  details?: string[];
  alternatives?: Array<{ tileId: string; label: string; reason: string }>;
  learnTopic?: "objective" | "turn" | "chi" | "pong" | "gong" | "hu" | "scoring";
};

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

  const remainingShape = handShapeSummary(
    hand.filter((candidate) => candidate.id !== tile.id),
    meldCount,
  );
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
    alternatives: uniqueRanked.slice(1, 3).map((option) => ({
      tile: option.tile,
      reason:
        option.tile.suit === "winds" || option.tile.suit === "dragons"
          ? "A reasonable honor discard if you prefer to preserve numbered-tile flexibility."
          : "A close alternative that keeps most of the same pairs and sequence shapes.",
    })),
  };
}
