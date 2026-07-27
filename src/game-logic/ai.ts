import { Tile, Player, Difficulty } from "./types";
import { countCodes } from "./helpers";
import { waitCodesForHand } from "./validation";

export function evaluateDiscard(hand: Tile[], tile: Tile, difficulty: Difficulty) {
  const remaining = hand.filter((candidate) => candidate.id !== tile.id);
  const counts = countCodes(remaining);
  const sameCount = counts[tile.code] ?? 0;
  const isolatedSuitTile = tile.suit === "winds" || tile.suit === "dragons";
  const neighborCount = remaining.filter(
    (candidate) =>
      candidate.suit === tile.suit &&
      Math.abs(candidate.rank - tile.rank) <= 2 &&
      candidate.id !== tile.id,
  ).length;
  const random = difficulty === "calm" ? Math.random() * 5 : difficulty === "balanced" ? Math.random() * 3 : Math.random();
  return sameCount * 4 + neighborCount * 1.5 + (isolatedSuitTile ? -1 : 0) + random;
}

export function handProgressScore(hand: Tile[], meldCount: number) {
  const counts = countCodes(hand);
  const pairs = Object.values(counts).filter((count) => count >= 2).length;
  const triplets = Object.values(counts).filter((count) => count >= 3).length;
  const sequencePieces = hand.filter((tile) => {
    if (!(tile.suit === "dots" || tile.suit === "bamboo" || tile.suit === "characters")) return false;
    return hand.some(
      (candidate) =>
        candidate.id !== tile.id &&
        candidate.suit === tile.suit &&
        Math.abs(candidate.rank - tile.rank) <= 2,
    );
  }).length;
  const waits = waitCodesForHand(hand, meldCount).length;
  return pairs * 3 + triplets * 6 + sequencePieces + waits * 8;
}

export function chooseDiscard(hand: Tile[], difficulty: Difficulty, meldCount = 0) {
  return [...hand].sort((a, b) => {
    const remainingA = hand.filter((candidate) => candidate.id !== a.id);
    const remainingB = hand.filter((candidate) => candidate.id !== b.id);
    const baseA = evaluateDiscard(hand, a, difficulty);
    const baseB = evaluateDiscard(hand, b, difficulty);
    const progressA = handProgressScore(remainingA, meldCount);
    const progressB = handProgressScore(remainingB, meldCount);
    const difficultyWeight = difficulty === "sharp" ? 1.35 : difficulty === "balanced" ? 0.88 : 0.45;
    return baseA - progressA * difficultyWeight - (baseB - progressB * difficultyWeight);
  })[0];
}

export function shouldCall(player: Player, type: "chi" | "pong" | "kong") {
  if (type === "kong") {
    if (player.difficulty === "calm") return Math.random() < 0.48;
    if (player.difficulty === "balanced") return Math.random() < 0.66;
    return Math.random() < 0.82;
  }
  if (player.difficulty === "calm") return Math.random() < (type === "pong" ? 0.32 : 0.18);
  if (player.difficulty === "balanced") return Math.random() < (type === "pong" ? 0.46 : 0.28);
  return Math.random() < (type === "pong" ? 0.62 : 0.34);
}
