import { describe, expect, it } from "vitest";
import {
  explainHandShape,
  recommendDiscard,
} from "../src/game-logic/learning";
import { Tile } from "../src/game-logic/types";

let tileId = 0;

function tile(
  code: string,
  suit: Tile["suit"],
  rank: number,
  sort: number,
): Tile {
  return {
    id: `${code}-${sort}-${tileId++}`,
    code,
    suit,
    rank,
    sort,
    label: code,
    short: code,
  };
}

describe("learning coach", () => {
  it("recommends an isolated honor before breaking a connected suit", () => {
    const hand = [
      tile("dot-2", "dots", 2, 2),
      tile("dot-3", "dots", 3, 3),
      tile("dot-4", "dots", 4, 4),
      tile("east", "winds", 1, 31),
    ];

    const recommendation = recommendDiscard(hand, 0);

    expect(recommendation?.tile.code).toBe("east");
    expect(recommendation?.reason).toContain("single honor tile");
  });

  it("groups the actual hand into novice-friendly shapes without reusing tiles", () => {
    const hand = [
      tile("D1", "dots", 1, 1),
      tile("D2", "dots", 2, 2),
      tile("D3", "dots", 3, 3),
      tile("W1", "winds", 1, 31),
      tile("W1", "winds", 1, 31),
      tile("B4", "bamboo", 4, 13),
      tile("B5", "bamboo", 5, 14),
      tile("C9", "characters", 9, 29),
    ];

    const breakdown = explainHandShape(hand, 1);
    const groupedTiles = breakdown.groups.flatMap((group) => group.tiles);

    expect(breakdown.revealedSets).toBe(1);
    expect(breakdown.groups.map((group) => group.kind)).toEqual([
      "set",
      "pair",
      "connected",
      "single",
    ]);
    expect(new Set(groupedTiles.map((candidate) => candidate.id)).size).toBe(
      hand.length,
    );
  });
});
