import { describe, expect, it } from "vitest";
import { recommendDiscard } from "../src/game-logic/learning";
import { Tile } from "../src/game-logic/types";

function tile(
  code: string,
  suit: Tile["suit"],
  rank: number,
  sort: number,
): Tile {
  return {
    id: `${code}-${sort}`,
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
});
