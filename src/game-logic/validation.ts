import { Player, Tile } from "./types";
import { countCodes, tileSortFromCode, tilePrototypeFromCode } from "./helpers";

export function canFormSets(codes: string[]) {
  if (codes.length === 0) return true;
  const counts = codes.reduce<Record<string, number>>((map, code) => {
    map[code] = (map[code] ?? 0) + 1;
    return map;
  }, {});
  return canFormSetsFromCounts(counts);
}

export function canFormSetsFromCounts(counts: Record<string, number>): boolean {
  const code = Object.keys(counts)
    .filter((key) => counts[key] > 0)
    .sort((a, b) => tileSortFromCode(a) - tileSortFromCode(b))[0];
  if (!code) return true;

  if (counts[code] >= 3) {
    counts[code] -= 3;
    if (canFormSetsFromCounts(counts)) return true;
    counts[code] += 3;
  }

  const suit = code[0];
  const rank = Number(code.slice(1));
  if ((suit === "D" || suit === "B" || suit === "C") && rank <= 7) {
    const second = `${suit}${rank + 1}`;
    const third = `${suit}${rank + 2}`;
    if ((counts[second] ?? 0) > 0 && (counts[third] ?? 0) > 0) {
      counts[code] -= 1;
      counts[second] -= 1;
      counts[third] -= 1;
      if (canFormSetsFromCounts(counts)) return true;
      counts[code] += 1;
      counts[second] += 1;
      counts[third] += 1;
    }
  }

  return false;
}

export function isWinningHand(hand: Tile[], meldCount: number) {
  const normalTiles = hand.filter((tile) => !tile.flower);
  const neededTiles = 2 + (5 - meldCount) * 3;
  if (normalTiles.length !== neededTiles) return false;
  const counts = countCodes(normalTiles);
  return Object.keys(counts).some((code) => {
    if (counts[code] < 2) return false;
    const nextCounts = { ...counts, [code]: counts[code] - 2 };
    return canFormSetsFromCounts(nextCounts);
  });
}

export function candidateWinTiles() {
  return [
    ...Array.from({ length: 9 }, (_, index) => `D${index + 1}`),
    ...Array.from({ length: 9 }, (_, index) => `B${index + 1}`),
    ...Array.from({ length: 9 }, (_, index) => `C${index + 1}`),
    ...Array.from({ length: 4 }, (_, index) => `W${index + 1}`),
    ...Array.from({ length: 3 }, (_, index) => `G${index + 1}`),
  ].map(tilePrototypeFromCode);
}

export function waitCodesForHand(hand: Tile[], meldCount: number) {
  const normalTiles = hand.filter((tile) => !tile.flower);
  const waitingTileCount = 1 + (5 - meldCount) * 3;
  if (normalTiles.length !== waitingTileCount) return [];
  return candidateWinTiles()
    .filter((tile) => isWinningHand([...normalTiles, tile], meldCount))
    .map((tile) => tile.code);
}

export function supportIdsForWait(hand: Tile[], waitCode: string) {
  const ids = new Set<string>();
  const prefix = waitCode[0];
  const rank = Number(waitCode.slice(1));
  hand
    .filter((tile) => tile.code === waitCode)
    .forEach((tile) => ids.add(tile.id));

  if (!(prefix === "D" || prefix === "B" || prefix === "C")) return ids;

  const sequencePairs = [
    [rank - 2, rank - 1],
    [rank - 1, rank + 1],
    [rank + 1, rank + 2],
  ];

  sequencePairs.forEach(([firstRank, secondRank]) => {
    if (firstRank < 1 || secondRank > 9) return;
    const first = hand.find((tile) => tile.code === `${prefix}${firstRank}`);
    const second = hand.find(
      (tile) => tile.code === `${prefix}${secondRank}` && tile.id !== first?.id,
    );
    if (first && second) {
      ids.add(first.id);
      ids.add(second.id);
    }
  });

  return ids;
}

export function waitingSupportTileIds(hand: Tile[], meldCount: number) {
  const ids = new Set<string>();
  const currentWaits = waitCodesForHand(hand, meldCount);
  currentWaits.forEach((code) =>
    supportIdsForWait(hand, code).forEach((id) => ids.add(id)),
  );

  const winningTileCount = 2 + (5 - meldCount) * 3;
  if (hand.filter((tile) => !tile.flower).length === winningTileCount) {
    hand.forEach((discard) => {
      const remaining = hand.filter((tile) => tile.id !== discard.id);
      waitCodesForHand(remaining, meldCount).forEach((code) =>
        supportIdsForWait(remaining, code).forEach((id) => ids.add(id)),
      );
    });
  }

  return ids;
}

export function possibleChi(hand: Tile[], tile: Tile) {
  return possibleChiOptions(hand, tile)[0];
}

export function possibleChiOptions(hand: Tile[], tile: Tile) {
  if (
    !(
      tile.suit === "dots" ||
      tile.suit === "bamboo" ||
      tile.suit === "characters"
    )
  )
    return [];
  const chiOptions: Tile[][] = [];
  const options = [
    [tile.rank - 2, tile.rank - 1],
    [tile.rank - 1, tile.rank + 1],
    [tile.rank + 1, tile.rank + 2],
  ];
  for (const ranks of options) {
    if (ranks.some((rank) => rank < 1 || rank > 9)) continue;
    const first = hand.find(
      (candidate) =>
        candidate.suit === tile.suit && candidate.rank === ranks[0],
    );
    const second = hand.find(
      (candidate) =>
        candidate.suit === tile.suit &&
        candidate.rank === ranks[1] &&
        candidate.id !== first?.id,
    );
    if (first && second) chiOptions.push(sortTiles([first, second, tile]));
  }
  return chiOptions;
}

export function canPong(hand: Tile[], tile: Tile) {
  return hand.filter((candidate) => candidate.code === tile.code).length >= 2;
}

export function canExposedKong(hand: Tile[], tile: Tile) {
  return hand.filter((candidate) => candidate.code === tile.code).length >= 3;
}

export function concealedKongOptions(hand: Tile[]) {
  const counts = countCodes(hand);
  return Object.keys(counts).filter((code) => counts[code] === 4);
}

export function addedKongOptions(player: Player) {
  return player.melds.flatMap((meld) => {
    if (meld.type !== "pong") return [];
    const code = meld.tiles[0]?.code;
    return code && player.hand.some((tile) => tile.code === code) ? [code] : [];
  });
}

// Import sortTiles from helpers to avoid circular dependency
import { sortTiles } from "./helpers";
