import { Tile } from "./types";
import { countCodes } from "./helpers";
import { handProgressScore, highValueHandPotential } from "./ai";

export type GuidanceMode = "off" | "rules" | "strategy";

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

export function recommendDiscard(hand: Tile[], meldCount: number) {
  if (hand.length === 0) return undefined;

  const tile = [...hand].sort((a, b) => {
    const scoreDifference =
      discardUtility(hand, b, meldCount) - discardUtility(hand, a, meldCount);
    return scoreDifference || b.sort - a.sort || b.id.localeCompare(a.id);
  })[0];
  const counts = countCodes(hand);
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

  return { tile, reason };
}
