import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

type Suit = "dots" | "bamboo" | "characters" | "winds" | "dragons" | "flowers";
type Difficulty = "calm" | "balanced" | "sharp";
type Phase = "discard" | "claim" | "round-over";
type MeldType = "chi" | "pong" | "kong";
type TableMode = "solo" | "online-ready";
type GameActionType = "deal-hand" | "draw" | "discard" | "claim" | "kong" | "score-round";

type Tile = {
  id: string;
  code: string;
  suit: Suit;
  rank: number;
  label: string;
  short: string;
  sort: number;
  flower?: boolean;
};

type Meld = {
  type: MeldType;
  tiles: Tile[];
  from?: number;
  concealed?: boolean;
};

type Player = {
  name: string;
  wind: string;
  difficulty: Difficulty;
  hand: Tile[];
  flowers: Tile[];
  melds: Meld[];
  discards: Tile[];
  score: number;
};

type LastDiscard = {
  tile: Tile;
  by: number;
};

type PendingClaim = {
  tile: Tile;
  by: number;
  canHu: boolean;
  canPong: boolean;
  canKong: boolean;
  canChi: boolean;
};

type Rules = {
  baseWin: number;
};

type StandardRuleKey =
  | "matching-flower"
  | "dragon-pung"
  | "seat-wind"
  | "round-wind"
  | "self-draw"
  | "dealer"
  | "concealed-hand"
  | "concealed-self-draw"
  | "last-tile"
  | "win-after-kong"
  | "all-chows"
  | "three-concealed-pungs"
  | "all-pungs"
  | "little-three-dragons"
  | "half-flush"
  | "four-concealed-pungs"
  | "big-three-dragons"
  | "full-flush"
  | "all-honors"
  | "five-concealed-pungs"
  | "little-four-winds"
  | "big-four-winds"
  | "seven-flowers"
  | "all-flowers";

type HouseRule = {
  id: string;
  name: string;
  description: string;
  points: number;
  enabled: boolean;
  detector?: StandardRuleKey;
  category?: "Everyday" | "Hand patterns" | "Limit hands" | "Custom";
};

type HouseRuleDraft = {
  name: string;
  description: string;
  points: number;
};

type WinSummary = {
  winner: number;
  title: string;
  detail: string;
  points: number;
  total: number;
  lineItems: string[];
};

type Activity = {
  player: number;
  text: string;
  tile?: Tile;
};

type Game = {
  tableId: string;
  mode: TableMode;
  actionSeq: number;
  actionLog: GameActionLog[];
  players: Player[];
  wall: Tile[];
  turn: number;
  dealer: number;
  round: number;
  phase: Phase;
  lastDiscard?: LastDiscard;
  pendingClaim?: PendingClaim;
  message: string;
  selectedId?: string;
  drawnTileId?: string;
  activity?: Activity;
  winner?: number;
  winSummary?: WinSummary;
};

type GameActionLog = {
  seq: number;
  type: GameActionType;
  actor: number;
  description: string;
  at: number;
};

function appendAction(game: Game, type: GameActionType, actor: number, description: string) {
  const seq = game.actionSeq + 1;
  game.actionSeq = seq;
  game.actionLog = [...game.actionLog.slice(-23), { seq, type, actor, description, at: Date.now() }];
}

function actionName(type: MeldType) {
  return type === "kong" ? "Kong" : type.charAt(0).toUpperCase() + type.slice(1);
}

function tableNarration(kind: "deal" | "turn" | "discard" | "claim" | "kong" | "win" | "draw", playerName: string, detail?: string) {
  if (kind === "deal") return `${playerName}. The hand begins.`;
  if (kind === "turn") return playerName === "You" ? "Your turn. Choose a tile to discard." : `${playerName} is taking a turn.`;
  if (kind === "discard") return `${playerName} discarded ${detail}.`;
  if (kind === "claim") return `${playerName} called ${detail}. Choose a discard.`;
  if (kind === "kong") return `${playerName} declared ${detail}. Draw again, then discard.`;
  if (kind === "win") return `${playerName} wins by ${detail}.`;
  return "The wall is empty. This hand is a draw.";
}

const HUMAN = 0;

const DEFAULT_RULES: Rules = {
  baseWin: 5,
};

const difficulties: Record<Difficulty, string> = {
  calm: "Calm",
  balanced: "Balanced",
  sharp: "Sharp",
};

const standardScoringRuleDefinitions: Array<Omit<HouseRule, "id" | "enabled">> = [
  { detector: "matching-flower", name: "Matching seat flower", description: "Each flower or season matching the winner's seat", points: 1, category: "Everyday" },
  { detector: "dragon-pung", name: "Dragon Pong or Kong", description: "Each completed Red, Green, or White Dragon set", points: 1, category: "Everyday" },
  { detector: "seat-wind", name: "Seat Wind Pong or Kong", description: "A set matching the winner's seat wind", points: 1, category: "Everyday" },
  { detector: "round-wind", name: "Round Wind Pong or Kong", description: "A set matching the prevailing wind", points: 1, category: "Everyday" },
  { detector: "self-draw", name: "Self draw", description: "Win using a tile drawn from the wall", points: 1, category: "Everyday" },
  { detector: "dealer", name: "Dealer", description: "The dealer wins the hand", points: 1, category: "Everyday" },
  { detector: "concealed-hand", name: "Concealed hand", description: "Win by discard without an exposed Chi, Pong, or Kong", points: 1, category: "Everyday" },
  { detector: "last-tile", name: "Last tile", description: "Win on the final playable wall tile", points: 1, category: "Everyday" },
  { detector: "win-after-kong", name: "Win after Kong", description: "Win on the replacement draw after declaring Kong", points: 1, category: "Everyday" },
  { detector: "all-chows", name: "All Chows", description: "Five sequences with a numbered pair and no flowers or honors", points: 2, category: "Hand patterns" },
  { detector: "three-concealed-pungs", name: "Three concealed Pungs", description: "Three concealed Pongs or Kongs", points: 2, category: "Hand patterns" },
  { detector: "concealed-self-draw", name: "Concealed self draw", description: "Self draw with no exposed Chi, Pong, or Kong", points: 3, category: "Hand patterns" },
  { detector: "all-pungs", name: "All Pungs", description: "Five Pongs or Kongs and one pair", points: 4, category: "Hand patterns" },
  { detector: "little-three-dragons", name: "Little Three Dragons", description: "Two Dragon sets and a pair of the third Dragon", points: 4, category: "Hand patterns" },
  { detector: "half-flush", name: "Half Flush", description: "One numbered suit together with honor tiles", points: 4, category: "Hand patterns" },
  { detector: "four-concealed-pungs", name: "Four concealed Pungs", description: "Four concealed Pongs or Kongs", points: 5, category: "Hand patterns" },
  { detector: "big-three-dragons", name: "Big Three Dragons", description: "Pongs or Kongs of all three Dragons", points: 8, category: "Limit hands" },
  { detector: "full-flush", name: "Full Flush", description: "Only one numbered suit, with no honors", points: 8, category: "Limit hands" },
  { detector: "all-honors", name: "All Honors", description: "The entire winning hand uses only Winds and Dragons", points: 8, category: "Limit hands" },
  { detector: "five-concealed-pungs", name: "Five concealed Pungs", description: "Five concealed Pongs or Kongs", points: 8, category: "Limit hands" },
  { detector: "little-four-winds", name: "Little Four Winds", description: "Three Wind sets and a pair of the fourth Wind", points: 8, category: "Limit hands" },
  { detector: "seven-flowers", name: "Seven Flowers", description: "Win while holding seven bonus flowers", points: 8, category: "Limit hands" },
  { detector: "all-flowers", name: "All Flowers", description: "Win while holding all eight bonus flowers", points: 8, category: "Limit hands" },
  { detector: "big-four-winds", name: "Big Four Winds", description: "Pongs or Kongs of all four Winds", points: 16, category: "Limit hands" },
];

const standardScoringRules: HouseRule[] = standardScoringRuleDefinitions.map((rule) => ({
  ...rule,
  id: `standard-${rule.detector}`,
  enabled: true,
}));

const defaultHouseRules: HouseRule[] = standardScoringRules;

const characterRanks = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const windCharacters: Record<string, string> = {
  W1: "東",
  W2: "南",
  W3: "西",
  W4: "北",
};
const dragonCharacters: Record<string, string> = {
  G1: "中",
  G2: "發",
  G3: "白",
};
const flowerCharacters: Record<string, string> = {
  F1: "梅",
  F2: "蘭",
  F3: "菊",
  F4: "竹",
  F5: "春",
  F6: "夏",
  F7: "秋",
  F8: "冬",
};

function TileFace({ tile }: { tile: Tile }) {
  if (tile.suit === "dots") {
    return (
      <span className={`tile-face dot-face dot-${tile.rank}`} aria-hidden="true">
        {Array.from({ length: tile.rank }, (_, index) => (
          <i className="dot-pip" key={index} />
        ))}
      </span>
    );
  }

  if (tile.suit === "bamboo") {
    if (tile.rank === 1) {
      return (
        <span className="tile-face bamboo-bird-face" aria-hidden="true">
          <i className="bird-perch" />
          <i className="bird-tail" />
          <i className="bird-wing bird-wing-left" />
          <i className="bird-body" />
          <i className="bird-head" />
          <i className="bird-eye" />
          <i className="bird-beak" />
          <i className="bird-crest" />
          <i className="bird-wing bird-wing-right" />
        </span>
      );
    }
    return (
      <span className={`tile-face bamboo-face bamboo-${tile.rank}`} aria-hidden="true">
        {Array.from({ length: tile.rank }, (_, index) => (
          <i className="bamboo-stick" key={index}>
            <b />
          </i>
        ))}
      </span>
    );
  }

  if (tile.suit === "characters") {
    return (
      <span className="tile-face character-face" aria-hidden="true">
        <b>{characterRanks[tile.rank]}</b>
        <em>萬</em>
      </span>
    );
  }

  if (tile.suit === "winds") {
    return (
      <span className="tile-face honor-face wind-face" aria-hidden="true">
        {windCharacters[tile.code] ?? tile.short}
      </span>
    );
  }

  if (tile.suit === "dragons") {
    return (
      <span className={`tile-face honor-face dragon-face dragon-${tile.rank}`} aria-hidden="true">
        {dragonCharacters[tile.code] ?? tile.short}
      </span>
    );
  }

  if (tile.suit === "flowers") {
    return (
      <span className="tile-face flower-face" aria-hidden="true">
        <b>{flowerCharacters[tile.code] ?? tile.short}</b>
        <em>{tile.rank}</em>
      </span>
    );
  }

  return (
    <span className="tile-face honor-face" aria-hidden="true">
      {tile.short}
    </span>
  );
}

function makeDeck() {
  const deck: Tile[] = [];
  const addTile = (
    code: string,
    suit: Suit,
    rank: number,
    label: string,
    short: string,
    sort: number,
    copies = 4,
    flower = false,
  ) => {
    for (let copy = 0; copy < copies; copy += 1) {
      deck.push({
        id: `${code}-${copy}-${Math.random().toString(36).slice(2)}`,
        code,
        suit,
        rank,
        label,
        short,
        sort,
        flower,
      });
    }
  };

  for (let rank = 1; rank <= 9; rank += 1) {
    addTile(`D${rank}`, "dots", rank, `${rank} Dot`, `${rank}D`, rank);
    addTile(`B${rank}`, "bamboo", rank, `${rank} Bamboo`, `${rank}B`, 20 + rank);
    addTile(`C${rank}`, "characters", rank, `${rank} Character`, `${rank}C`, 40 + rank);
  }

  ["East", "South", "West", "North"].forEach((wind, index) => {
    addTile(`W${index + 1}`, "winds", index + 1, `${wind} Wind`, wind[0], 60 + index);
  });

  ["Red", "Green", "White"].forEach((dragon, index) => {
    addTile(
      `G${index + 1}`,
      "dragons",
      index + 1,
      `${dragon} Dragon`,
      dragon === "White" ? "Wh" : dragon[0],
      70 + index,
    );
  });

  ["Plum", "Orchid", "Chrysanthemum", "Bamboo", "Spring", "Summer", "Autumn", "Winter"].forEach(
    (flower, index) => {
      addTile(`F${index + 1}`, "flowers", index + 1, flower, flower.slice(0, 2), 90 + index, 1, true);
    },
  );

  return shuffle(deck);
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function sortTiles(tiles: Tile[]) {
  return [...tiles].sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
}

function countCodes(tiles: Tile[]) {
  return tiles.reduce<Record<string, number>>((counts, tile) => {
    counts[tile.code] = (counts[tile.code] ?? 0) + 1;
    return counts;
  }, {});
}

function withoutTiles(hand: Tile[], remove: Tile[]) {
  const removeIds = new Set(remove.map((tile) => tile.id));
  return hand.filter((tile) => !removeIds.has(tile.id));
}

function drawNonFlower(game: Game, playerIndex: number) {
  const next = structuredCloneGame(game);
  const player = next.players[playerIndex];
  next.drawnTileId = undefined;
  while (next.wall.length > 0) {
    const tile = next.wall.shift();
    if (!tile) break;
    if (tile.flower) {
      player.flowers.push(tile);
    } else {
      player.hand.push(tile);
      player.hand = sortTiles(player.hand);
      next.drawnTileId = tile.id;
      break;
    }
  }
  return next;
}

function structuredCloneGame(game: Game): Game {
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
    activity: game.activity ? { ...game.activity } : undefined,
    actionLog: [...game.actionLog],
    winSummary: game.winSummary ? { ...game.winSummary, lineItems: [...game.winSummary.lineItems] } : undefined,
  };
}

function dealRound(
  dealer = 0,
  scores?: number[],
  round = 1,
  profiles?: Pick<Player, "name" | "difficulty">[],
  tableId = "local-table-one",
): Game {
  let wall = makeDeck();
  const defaultNames = ["You", "Mina", "Theo", "Grace"];
  const defaultDifficulties: Difficulty[] = ["balanced", "calm", "sharp", "balanced"];
  const players: Player[] = defaultNames.map((defaultName, index) => ({
    name: profiles?.[index]?.name.trim() || defaultName,
    wind: ["East", "South", "West", "North"][(index - dealer + 4) % 4],
    difficulty: profiles?.[index]?.difficulty ?? defaultDifficulties[index],
    hand: [],
    flowers: [],
    melds: [],
    discards: [],
    score: scores?.[index] ?? 250,
  }));

  const drawForDeal = (player: Player) => {
    while (wall.length > 0) {
      const tile = wall.shift();
      if (!tile) return;
      if (tile.flower) {
        player.flowers.push(tile);
      } else {
        player.hand.push(tile);
        return;
      }
    }
  };

  players.forEach((player, index) => {
    const target = index === dealer ? 17 : 16;
    while (player.hand.length < target) drawForDeal(player);
    player.hand = sortTiles(player.hand);
  });

  const dealerName = players[dealer].name;
  const dealerMessage = dealer === HUMAN ? "You are Dealer" : `${dealerName} is dealer`;

  const game: Game = {
    tableId,
    mode: "online-ready",
    actionSeq: 0,
    actionLog: [],
    players,
    wall,
    turn: dealer,
    dealer,
    round,
    phase: "discard",
    message: tableNarration("deal", dealerMessage),
    activity: { player: dealer, text: tableNarration("deal", dealerMessage) },
  };
  appendAction(game, "deal-hand", dealer, `${dealerMessage}. Hand ${round} begins.`);
  return game;
}

function canFormSets(codes: string[]) {
  if (codes.length === 0) return true;
  const counts = codes.reduce<Record<string, number>>((map, code) => {
    map[code] = (map[code] ?? 0) + 1;
    return map;
  }, {});
  return canFormSetsFromCounts(counts);
}

function canFormSetsFromCounts(counts: Record<string, number>): boolean {
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

function tileSortFromCode(code: string) {
  const prefix = code[0];
  const rank = Number(code.slice(1));
  if (prefix === "D") return rank;
  if (prefix === "B") return 20 + rank;
  if (prefix === "C") return 40 + rank;
  if (prefix === "W") return 60 + rank;
  if (prefix === "G") return 70 + rank;
  return 90 + rank;
}

function isWinningHand(hand: Tile[], meldCount: number) {
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

function tilePrototypeFromCode(code: string): Tile {
  const prefix = code[0];
  const rank = Number(code.slice(1));
  const suit: Suit =
    prefix === "D" ? "dots" : prefix === "B" ? "bamboo" : prefix === "C" ? "characters" : prefix === "W" ? "winds" : "dragons";
  const suitName = suit === "dots" ? "Dot" : suit === "bamboo" ? "Bamboo" : suit === "characters" ? "Character" : suit === "winds" ? "Wind" : "Dragon";
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

function candidateWinTiles() {
  return [
    ...Array.from({ length: 9 }, (_, index) => `D${index + 1}`),
    ...Array.from({ length: 9 }, (_, index) => `B${index + 1}`),
    ...Array.from({ length: 9 }, (_, index) => `C${index + 1}`),
    ...Array.from({ length: 4 }, (_, index) => `W${index + 1}`),
    ...Array.from({ length: 3 }, (_, index) => `G${index + 1}`),
  ].map(tilePrototypeFromCode);
}

function waitCodesForHand(hand: Tile[], meldCount: number) {
  const normalTiles = hand.filter((tile) => !tile.flower);
  const waitingTileCount = 1 + (5 - meldCount) * 3;
  if (normalTiles.length !== waitingTileCount) return [];
  return candidateWinTiles()
    .filter((tile) => isWinningHand([...normalTiles, tile], meldCount))
    .map((tile) => tile.code);
}

function supportIdsForWait(hand: Tile[], waitCode: string) {
  const ids = new Set<string>();
  const prefix = waitCode[0];
  const rank = Number(waitCode.slice(1));
  hand.filter((tile) => tile.code === waitCode).forEach((tile) => ids.add(tile.id));

  if (!(prefix === "D" || prefix === "B" || prefix === "C")) return ids;

  const sequencePairs = [
    [rank - 2, rank - 1],
    [rank - 1, rank + 1],
    [rank + 1, rank + 2],
  ];

  sequencePairs.forEach(([firstRank, secondRank]) => {
    if (firstRank < 1 || secondRank > 9) return;
    const first = hand.find((tile) => tile.code === `${prefix}${firstRank}`);
    const second = hand.find((tile) => tile.code === `${prefix}${secondRank}` && tile.id !== first?.id);
    if (first && second) {
      ids.add(first.id);
      ids.add(second.id);
    }
  });

  return ids;
}

function waitingSupportTileIds(hand: Tile[], meldCount: number) {
  const ids = new Set<string>();
  const currentWaits = waitCodesForHand(hand, meldCount);
  currentWaits.forEach((code) => supportIdsForWait(hand, code).forEach((id) => ids.add(id)));

  const winningTileCount = 2 + (5 - meldCount) * 3;
  if (hand.filter((tile) => !tile.flower).length === winningTileCount) {
    hand.forEach((discard) => {
      const remaining = hand.filter((tile) => tile.id !== discard.id);
      waitCodesForHand(remaining, meldCount).forEach((code) => supportIdsForWait(remaining, code).forEach((id) => ids.add(id)));
    });
  }

  return ids;
}

function possibleChi(hand: Tile[], tile: Tile) {
  return possibleChiOptions(hand, tile)[0];
}

function possibleChiOptions(hand: Tile[], tile: Tile) {
  if (!(tile.suit === "dots" || tile.suit === "bamboo" || tile.suit === "characters")) return [];
  const chiOptions: Tile[][] = [];
  const options = [
    [tile.rank - 2, tile.rank - 1],
    [tile.rank - 1, tile.rank + 1],
    [tile.rank + 1, tile.rank + 2],
  ];
  for (const ranks of options) {
    if (ranks.some((rank) => rank < 1 || rank > 9)) continue;
    const first = hand.find((candidate) => candidate.suit === tile.suit && candidate.rank === ranks[0]);
    const second = hand.find(
      (candidate) => candidate.suit === tile.suit && candidate.rank === ranks[1] && candidate.id !== first?.id,
    );
    if (first && second) chiOptions.push(sortTiles([first, second, tile]));
  }
  return chiOptions;
}

function canPong(hand: Tile[], tile: Tile) {
  return hand.filter((candidate) => candidate.code === tile.code).length >= 2;
}

function canExposedKong(hand: Tile[], tile: Tile) {
  return hand.filter((candidate) => candidate.code === tile.code).length >= 3;
}

function concealedKongOptions(hand: Tile[]) {
  const counts = countCodes(hand);
  return Object.keys(counts).filter((code) => counts[code] === 4);
}

function kongLabel(code: string) {
  return tilePrototypeFromCode(code).label;
}

function evaluateDiscard(hand: Tile[], tile: Tile, difficulty: Difficulty) {
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

function handProgressScore(hand: Tile[], meldCount: number) {
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

function chooseDiscard(hand: Tile[], difficulty: Difficulty, meldCount = 0) {
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

function shouldCall(player: Player, type: "chi" | "pong" | "kong") {
  if (type === "kong") {
    if (player.difficulty === "calm") return Math.random() < 0.48;
    if (player.difficulty === "balanced") return Math.random() < 0.66;
    return Math.random() < 0.82;
  }
  if (player.difficulty === "calm") return Math.random() < (type === "pong" ? 0.32 : 0.18);
  if (player.difficulty === "balanced") return Math.random() < (type === "pong" ? 0.46 : 0.28);
  return Math.random() < (type === "pong" ? 0.62 : 0.34);
}

type ScoringGroup = {
  type: "chi" | "pong";
  code: string;
  concealed: boolean;
};

function decomposeWinningTiles(tiles: Tile[]) {
  const counts = countCodes(tiles);
  const codes = Object.keys(counts).sort((a, b) => tileSortFromCode(a) - tileSortFromCode(b));

  const takeSets = (remaining: Record<string, number>, groups: ScoringGroup[]): ScoringGroup[] | undefined => {
    const code = Object.keys(remaining)
      .filter((key) => remaining[key] > 0)
      .sort((a, b) => tileSortFromCode(a) - tileSortFromCode(b))[0];
    if (!code) return groups;

    if (remaining[code] >= 3) {
      remaining[code] -= 3;
      const result = takeSets(remaining, [...groups, { type: "pong", code, concealed: true }]);
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
        const result = takeSets(remaining, [...groups, { type: "chi", code, concealed: true }]);
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

function scoreStandardRules(
  game: Game,
  winner: number,
  source: "self-draw" | "discard",
  rules: HouseRule[],
) {
  const player = game.players[winner];
  const concealed = decomposeWinningTiles(player.hand);
  const concealedGroups = (concealed?.groups ?? []).map((group) => ({ ...group }));
  const winningCode = source === "discard" ? game.lastDiscard?.tile.code : undefined;
  if (winningCode && concealed?.pair !== winningCode) {
    const completedPung = concealedGroups.find((group) => group.type === "pong" && group.code === winningCode);
    if (completedPung) completedPung.concealed = false;
  }
  const exposedGroups: ScoringGroup[] = player.melds.map((meld) => ({
    type: meld.type === "chi" ? "chi" : "pong",
    code: meld.tiles[0]?.code ?? "",
    concealed: meld.concealed === true,
  }));
  const groups = [...concealedGroups, ...exposedGroups];
  const pair = concealed?.pair;
  const pongCodes = groups.filter((group) => group.type === "pong").map((group) => group.code);
  const allTiles = [...player.hand, ...player.melds.flatMap((meld) => meld.tiles)];
  const numberedSuits = new Set(allTiles.filter((tile) => ["dots", "bamboo", "characters"].includes(tile.suit)).map((tile) => tile.suit));
  const hasHonors = allTiles.some((tile) => tile.suit === "winds" || tile.suit === "dragons");
  const hasOpenMeld = player.melds.some((meld) => meld.concealed !== true);
  const dragonSets = pongCodes.filter((code) => code.startsWith("G")).length;
  const windSets = pongCodes.filter((code) => code.startsWith("W")).length;
  const concealedPungs = groups.filter((group) => group.type === "pong" && group.concealed).length;
  const seatWindRank = ["East", "South", "West", "North"].indexOf(player.wind) + 1;
  const roundWindRank = Math.floor((game.round - 1) / 4) % 4 + 1;
  const matchingFlowers = player.flowers.filter((tile) => ((tile.rank - 1) % 4) + 1 === seatWindRank).length;
  const isConcealedSelfDraw = source === "self-draw" && !hasOpenMeld;
  const isBigThreeDragons = dragonSets === 3;
  const isBigFourWinds = windSets === 4;
  const isAllFlowers = player.flowers.length === 8;
  const values: Partial<Record<StandardRuleKey, number>> = {
    "matching-flower": isAllFlowers ? 0 : matchingFlowers,
    "dragon-pung": isBigThreeDragons ? 0 : dragonSets,
    "seat-wind": isBigFourWinds ? 0 : Number(pongCodes.includes(`W${seatWindRank}`)),
    "round-wind": isBigFourWinds ? 0 : Number(pongCodes.includes(`W${roundWindRank}`)),
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
    "all-pungs": Number(groups.length === 5 && groups.every((group) => group.type === "pong")),
    "little-three-dragons": Number(!isBigThreeDragons && dragonSets === 2 && Boolean(pair?.startsWith("G"))),
    "half-flush": Number(numberedSuits.size === 1 && hasHonors),
    "four-concealed-pungs": Number(concealedPungs === 4),
    "big-three-dragons": Number(isBigThreeDragons),
    "full-flush": Number(numberedSuits.size === 1 && !hasHonors),
    "all-honors": Number(numberedSuits.size === 0 && hasHonors),
    "five-concealed-pungs": Number(concealedPungs === 5),
    "little-four-winds": Number(!isBigFourWinds && windSets === 3 && Boolean(pair?.startsWith("W"))),
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

function scoreRound(game: Game, winner: number, source: "self-draw" | "discard", rules: Rules, houseRules: HouseRule[]) {
  const next = structuredCloneGame(game);
  const player = next.players[winner];
  if (source === "discard" && next.lastDiscard && winner !== next.lastDiscard.by) {
    const winningTile = next.lastDiscard.tile;
    if (!player.hand.some((tile) => tile.id === winningTile.id)) {
      player.hand = sortTiles([...player.hand, winningTile]);
    }
    next.players[next.lastDiscard.by].discards = next.players[next.lastDiscard.by].discards.filter((tile) => tile.id !== winningTile.id);
  }
  const scoredRules = scoreStandardRules(next, winner, source, houseRules);
  const tai = scoredRules.reduce((sum, item) => sum + item.points, 0);
  const points = rules.baseWin + tai;

  let total = 0;
  const lineItems = [
    `Base win: ${rules.baseWin}`,
    ...scoredRules.map((item) => `${item.name}${item.multiplier > 1 ? ` ×${item.multiplier}` : ""}: +${item.points}`),
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
    text: tableNarration("win", player.name, source === "self-draw" ? "self draw" : "discard"),
    tile: source === "discard" ? next.lastDiscard?.tile : undefined,
  };
  next.winSummary = {
    winner,
    title: winner === HUMAN ? "You win" : `${player.name} wins`,
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

function nextDealerForRound(game: Game) {
  return game.winner === game.dealer ? game.dealer : (game.dealer + 1) % 4;
}

function nextRoundNumber(game: Game) {
  return game.winner === game.dealer ? game.round : game.round + 1;
}

function advanceAfterDiscard(game: Game, discardedBy: number, rules: Rules, houseRules: HouseRule[]) {
  let next = structuredCloneGame(game);
  const discard = next.lastDiscard;
  if (!discard) return next;

  const order = [1, 2, 3].map((offset) => (discardedBy + offset) % 4);
  const hu = order.find((index) => isWinningHand([...next.players[index].hand, discard.tile], next.players[index].melds.length));
  if (hu !== undefined) {
    if (hu === HUMAN) {
      next.pendingClaim = {
        tile: discard.tile,
        by: discardedBy,
        canHu: true,
        canPong: canPong(next.players[HUMAN].hand, discard.tile),
        canKong: canExposedKong(next.players[HUMAN].hand, discard.tile),
        canChi: (discardedBy + 1) % 4 === HUMAN && possibleChiOptions(next.players[HUMAN].hand, discard.tile).length > 0,
      };
      next.phase = "claim";
      next.message = `${next.players[discardedBy].name} discarded ${discard.tile.label}. You can win on this discard.`;
      next.activity = { player: discardedBy, text: "You can win on this discard.", tile: discard.tile };
      return next;
    }
    return scoreRound(next, hu, "discard", rules, houseRules);
  }

  for (const playerIndex of order) {
    const playerCanKong = canExposedKong(next.players[playerIndex].hand, discard.tile);
    const playerCanPong = canPong(next.players[playerIndex].hand, discard.tile);
    if (!playerCanKong && !playerCanPong) continue;
    if (playerIndex === HUMAN) {
      next.pendingClaim = {
        tile: discard.tile,
        by: discardedBy,
        canHu: false,
        canPong: playerCanPong,
        canKong: playerCanKong,
        canChi: (discardedBy + 1) % 4 === HUMAN && possibleChiOptions(next.players[HUMAN].hand, discard.tile).length > 0,
      };
      next.phase = "claim";
      next.message = `${next.players[discardedBy].name} discarded ${discard.tile.label}. Choose an action or pass.`;
      next.activity = { player: discardedBy, text: "Choose an action or pass.", tile: discard.tile };
      return next;
    }
    if (playerCanKong && shouldCall(next.players[playerIndex], "kong")) return applyClaim(next, playerIndex, "kong", undefined, rules, houseRules);
    if (playerCanPong && shouldCall(next.players[playerIndex], "pong")) return applyClaim(next, playerIndex, "pong", undefined, rules, houseRules);
  }

  const humanClaim =
    discardedBy !== HUMAN
      ? {
          tile: discard.tile,
          by: discardedBy,
          canHu: false,
          canPong: canPong(next.players[HUMAN].hand, discard.tile),
          canKong: canExposedKong(next.players[HUMAN].hand, discard.tile),
          canChi: (discardedBy + 1) % 4 === HUMAN && possibleChiOptions(next.players[HUMAN].hand, discard.tile).length > 0,
        }
      : undefined;

  if (humanClaim && humanClaim.canChi) {
    next.pendingClaim = humanClaim;
    next.phase = "claim";
    next.message = `${next.players[discardedBy].name} discarded ${discard.tile.label}. Choose an action or pass.`;
    next.activity = { player: discardedBy, text: "Choose an action or pass.", tile: discard.tile };
    return next;
  }

  const chiPlayer = (discardedBy + 1) % 4;
  if (
    chiPlayer !== HUMAN &&
    possibleChiOptions(next.players[chiPlayer].hand, discard.tile).length > 0 &&
    shouldCall(next.players[chiPlayer], "chi")
  ) {
    return applyClaim(next, chiPlayer, "chi", undefined, rules, houseRules);
  }

  return startTurn(next, (discardedBy + 1) % 4, rules, houseRules);
}

function applyClaim(
  game: Game,
  playerIndex: number,
  type: "chi" | "pong" | "kong",
  chosenTiles?: Tile[],
  rules?: Rules,
  houseRules?: HouseRule[],
) {
  const next = structuredCloneGame(game);
  const discard = next.lastDiscard;
  if (!discard) return next;
  const player = next.players[playerIndex];

  if (type === "pong") {
    const claimed = player.hand.filter((tile) => tile.code === discard.tile.code).slice(0, 2);
    player.hand = sortTiles(withoutTiles(player.hand, claimed));
    player.melds.push({ type: "pong", tiles: [...claimed, discard.tile], from: discard.by });
  } else if (type === "kong") {
    const claimed = player.hand.filter((tile) => tile.code === discard.tile.code).slice(0, 3);
    if (claimed.length !== 3) return next;
    player.hand = sortTiles(withoutTiles(player.hand, claimed));
    player.melds.push({ type: "kong", tiles: [...claimed, discard.tile], from: discard.by, concealed: false });
  } else {
    const chiTiles = chosenTiles ?? possibleChi(player.hand, discard.tile);
    if (!chiTiles) return next;
    player.hand = sortTiles(withoutTiles(player.hand, chiTiles.filter((tile) => tile.id !== discard.tile.id)));
    player.melds.push({ type: "chi", tiles: sortTiles(chiTiles), from: discard.by });
  }

  next.players[discard.by].discards = next.players[discard.by].discards.filter((tile) => tile.id !== discard.tile.id);
  next.turn = playerIndex;
  next.phase = "discard";
  next.pendingClaim = undefined;
  next.lastDiscard = undefined;
  next.drawnTileId = undefined;
  next.message = tableNarration("claim", player.name, actionName(type));
  next.activity = { player: playerIndex, text: next.message };
  appendAction(next, "claim", playerIndex, next.message);

  if (type === "kong") {
    if (next.wall.length === 0) {
      return { ...next, phase: "round-over" as Phase, message: tableNarration("draw", "") };
    }
    const afterDraw = drawNonFlower(next, playerIndex);
    afterDraw.turn = playerIndex;
    afterDraw.phase = "discard";
    afterDraw.pendingClaim = undefined;
    afterDraw.lastDiscard = undefined;
    afterDraw.message = tableNarration("kong", player.name, "Kong");
    afterDraw.activity = { player: playerIndex, text: afterDraw.message };
    appendAction(afterDraw, "kong", playerIndex, afterDraw.message);
    if (rules && houseRules && isWinningHand(afterDraw.players[playerIndex].hand, afterDraw.players[playerIndex].melds.length)) {
      return scoreRound(afterDraw, playerIndex, "self-draw", rules, houseRules);
    }
    return afterDraw;
  }

  return next;
}

function startTurn(game: Game, playerIndex: number, rules: Rules, houseRules: HouseRule[]) {
  if (game.wall.length === 0) {
    return { ...game, phase: "round-over" as Phase, message: tableNarration("draw", "") };
  }

  let next = drawNonFlower(game, playerIndex);
  next.turn = playerIndex;
  next.lastDiscard = undefined;
  next.pendingClaim = undefined;

  const player = next.players[playerIndex];
  if (isWinningHand(player.hand, player.melds.length)) {
    return scoreRound(next, playerIndex, "self-draw", rules, houseRules);
  }

  const kongCode = concealedKongOptions(player.hand)[0];
  if (kongCode && playerIndex !== HUMAN && Math.random() < (player.difficulty === "sharp" ? 0.75 : 0.35)) {
    next = applyConcealedKong(next, playerIndex, kongCode, rules, houseRules);
  }

  next.phase = "discard";
  next.message = tableNarration("turn", playerIndex === HUMAN ? "You" : player.name);
  next.activity = { player: playerIndex, text: next.message };
  appendAction(next, "draw", playerIndex, next.message);
  return next;
}

function applyKong(game: Game, playerIndex: number, code: string, concealed: boolean, rules: Rules, houseRules: HouseRule[]) {
  let next = structuredCloneGame(game);
  const player = next.players[playerIndex];
  const kongTiles = player.hand.filter((tile) => tile.code === code).slice(0, 4);
  if (kongTiles.length !== 4) return next;
  player.hand = sortTiles(withoutTiles(player.hand, kongTiles));
  player.melds.push({ type: "kong", tiles: kongTiles, concealed });
  next.message = tableNarration("kong", player.name, concealed ? "Silent Kong" : "Reveal Kong");
  next.activity = { player: playerIndex, text: next.message };
  appendAction(next, "kong", playerIndex, next.message);
  next = drawNonFlower(next, playerIndex);
  if (isWinningHand(next.players[playerIndex].hand, next.players[playerIndex].melds.length)) {
    return scoreRound(next, playerIndex, "self-draw", rules, houseRules);
  }
  return next;
}

function applyConcealedKong(game: Game, playerIndex: number, code: string, rules: Rules, houseRules: HouseRule[]) {
  return applyKong(game, playerIndex, code, true, rules, houseRules);
}

function discardTile(game: Game, playerIndex: number, tileId: string, rules: Rules, houseRules: HouseRule[]) {
  const next = structuredCloneGame(game);
  const player = next.players[playerIndex];
  const tile = player.hand.find((candidate) => candidate.id === tileId);
  if (!tile) return next;
  player.hand = player.hand.filter((candidate) => candidate.id !== tileId);
  player.discards.push(tile);
  next.lastDiscard = { tile, by: playerIndex };
  next.selectedId = undefined;
  next.drawnTileId = undefined;
  next.message = tableNarration("discard", player.name, tile.label);
  next.activity = { player: playerIndex, text: next.message, tile };
  appendAction(next, "discard", playerIndex, next.message);
  return advanceAfterDiscard(next, playerIndex, rules, houseRules);
}

function TileView({
  tile,
  hidden,
  selected,
  drawn,
  waiting,
  large,
  disabled,
  onClick,
}: {
  tile?: Tile;
  hidden?: boolean;
  selected?: boolean;
  drawn?: boolean;
  waiting?: boolean;
  large?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  if (hidden || !tile) {
    return <div className={`tile tile-back ${large ? "large" : ""}`} aria-label="Hidden tile" />;
  }
  return (
    <button
      className={`tile ${tile.suit} ${selected ? "selected" : ""} ${drawn ? "drawn" : ""} ${waiting ? "waiting" : ""} ${large ? "large" : ""}`}
      aria-label={`${tile.label}${drawn ? ", newly drawn" : ""}${waiting ? ", part of a waiting set" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={tile.label}
      type="button"
    >
      <TileFace tile={tile} />
      {drawn ? <span className="drawn-badge">New</span> : null}
    </button>
  );
}

function formatChiOption(tiles: Tile[]) {
  return tiles.map((tile) => tile.short).join(" · ");
}

function MeldView({ meld }: { meld: Meld }) {
  return (
    <div className="meld" title={`${meld.concealed ? "Concealed " : ""}${meld.type}`}>
      <span>{meld.concealed ? "Silent Kong" : meld.type.toUpperCase()}</span>
      <div>
        {meld.tiles.map((tile) => (
          <TileView key={tile.id} tile={tile} hidden={meld.concealed} disabled />
        ))}
      </div>
    </div>
  );
}

function DiscardRiver({ player }: { player: Player }) {
  const discards = [...player.discards].reverse();
  return (
    <div className="discard-river" aria-label={`${player.name} discard pile`}>
      {discards.map((tile) => (
        <TileView key={tile.id} tile={tile} disabled />
      ))}
    </div>
  );
}

function TableDiscardGrid({ players }: { players: Player[] }) {
  return (
    <div className="table-discard-grid" aria-label="Center discard area">
      {players.map((player, index) => (
        <section className={`table-discard-lane discard-lane-${index}`} key={`${player.name}-${index}`}>
          <span>{index === HUMAN ? "You" : player.wind}</span>
          <DiscardRiver player={player} />
        </section>
      ))}
    </div>
  );
}

function SeatSets({ flowers, melds, actions }: { flowers: Tile[]; melds: Meld[]; actions?: ReactNode }) {
  return (
    <div className="seat-sets-row">
      {actions ? <div className="seat-actions-slot">{actions}</div> : null}
      {flowers.length > 0 ? (
        <div className="flower-row">
          {flowers.map((tile) => (
            <TileView key={tile.id} tile={tile} disabled />
          ))}
        </div>
      ) : null}
      <div className="meld-row">
        {melds.map((meld, index) => (
          <MeldView key={`${meld.type}-${index}`} meld={meld} />
        ))}
      </div>
    </div>
  );
}

function Opponent({
  player,
  active,
  dealer,
  reveal,
  position,
}: {
  player: Player;
  active: boolean;
  dealer: boolean;
  reveal: boolean;
  position: "left" | "top" | "right";
}) {
  return (
    <section className={`opponent opponent-${position} ${active ? "active" : ""} ${dealer ? "dealer-seat" : ""}`}>
      <div className="seat-heading">
        <strong>{player.name}</strong>
        <div className="seat-badges">
          {dealer ? <span className="dealer-badge">Dealer</span> : null}
          <span>{player.wind}</span>
        </div>
      </div>
      <div className="seat-meta">
        <span>{difficulties[player.difficulty]}</span>
        <span>{player.score} pts</span>
      </div>
      <SeatSets flowers={player.flowers} melds={player.melds} />
      {reveal ? (
        <div className="compact-hand revealed-hand" aria-label={`${player.name} revealed winning hand`}>
          {player.hand.slice(0, Math.min(player.hand.length, 18)).map((tile) => (
            <TileView key={tile.id} tile={tile} disabled />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MahjongApp() {
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [houseRules, setHouseRules] = useState<HouseRule[]>(defaultHouseRules);
  const [houseDraft, setHouseDraft] = useState<HouseRuleDraft>({ name: "", description: "", points: 1 });
  const [game, setGame] = useState<Game>(() => dealRound(0));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [choosingChi, setChoosingChi] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  const human = game.players[HUMAN];
  const selectedTile = human.hand.find((tile) => tile.id === game.selectedId);
  const humanKongs = concealedKongOptions(human.hand);
  const activeHumanKong = humanKongs[0];
  const canSelfHu = game.phase === "discard" && game.turn === HUMAN && isWinningHand(human.hand, human.melds.length);
  const waitingTileIds = useMemo(() => waitingSupportTileIds(human.hand, human.melds.length), [human.hand, human.melds.length]);
  const humanChiOptions = useMemo(() => {
    if (game.phase !== "claim" || !game.pendingClaim?.canChi || !game.pendingClaim.tile) return [];
    return possibleChiOptions(human.hand, game.pendingClaim.tile);
  }, [game.phase, game.pendingClaim, human.hand]);

  useEffect(() => {
    window.clearTimeout(timerRef.current);
    if (game.phase !== "discard" || game.turn === HUMAN || game.winner !== undefined) return;
    timerRef.current = window.setTimeout(() => {
      setGame((current) => {
        if (current.phase !== "discard" || current.turn === HUMAN) return current;
        const player = current.players[current.turn];
        const tile = chooseDiscard(player.hand, player.difficulty, player.melds.length);
        return discardTile(current, current.turn, tile.id, rules, houseRules);
      });
    }, game.players[game.turn].difficulty === "sharp" ? 1250 : 1700);
    return () => window.clearTimeout(timerRef.current);
  }, [game, rules, houseRules]);

  useEffect(() => {
    setChoosingChi(false);
  }, [game.phase, game.pendingClaim?.tile.id]);

  const nextDealer = nextDealerForRound(game);
  const nextRound = nextRoundNumber(game);
  const dealerStatus = game.dealer === HUMAN ? "You are Dealer" : `${game.players[game.dealer].name} deals`;
  const humanIsWaiting =
    game.phase === "discard" &&
    game.turn !== HUMAN &&
    waitCodesForHand(human.hand, human.melds.length).length > 0;
  const activity = game.activity ?? { player: game.turn, text: game.message };

  const ruleRows = useMemo(
    () => [
      ["Base win", "baseWin"],
    ] as const,
    [],
  );

  const updatePlayerName = (playerIndex: number, name: string) => {
    setGame((current) => {
      const next = structuredCloneGame(current);
      next.players[playerIndex].name = name;
      return next;
    });
  };

  const updateDifficulty = (playerIndex: number, difficulty: Difficulty) => {
    setGame((current) => {
      const next = structuredCloneGame(current);
      next.players[playerIndex].difficulty = difficulty;
      return next;
    });
  };

  const addHouseRule = () => {
    const name = houseDraft.name.trim();
    const description = houseDraft.description.trim();
    if (!name || !description) return;
    setHouseRules((current) => [
      ...current,
      {
        id: `house-${Date.now()}`,
        name,
        description,
        points: Math.max(0, Number(houseDraft.points)),
        enabled: true,
        category: "Custom",
      },
    ]);
    setHouseDraft({ name: "", description: "", points: 1 });
  };

  const claimActions =
    game.phase === "claim" ? (
      <>
        {game.pendingClaim?.canPong ? (
          <button
            onClick={() => {
              setChoosingChi(false);
              setGame((current) => applyClaim(current, HUMAN, "pong", undefined, rules, houseRules));
            }}
            type="button"
          >
            Pong
          </button>
        ) : null}
        {game.pendingClaim?.canChi ? (
          <button
            onClick={() => {
              if (humanChiOptions.length > 1) {
                setChoosingChi(true);
                setGame((current) => ({ ...current, message: "Choose which Chi sequence to call." }));
              } else if (humanChiOptions[0]) {
                setChoosingChi(false);
                setGame((current) => applyClaim(current, HUMAN, "chi", humanChiOptions[0], rules, houseRules));
              }
            }}
            type="button"
          >
            Chi
          </button>
        ) : null}
        {game.pendingClaim?.canHu ? (
          <button
            onClick={() => {
              setChoosingChi(false);
              setGame((current) => scoreRound(current, HUMAN, "discard", rules, houseRules));
            }}
            type="button"
          >
            Hu
          </button>
        ) : null}
        {game.pendingClaim?.canKong ? (
          <button
            onClick={() => {
              setChoosingChi(false);
              setGame((current) => applyClaim(current, HUMAN, "kong", undefined, rules, houseRules));
            }}
            type="button"
          >
            Gong
          </button>
        ) : null}
        <button
          className="secondary-action"
          onClick={() => {
            setChoosingChi(false);
            setGame((current) =>
              current.lastDiscard ? startTurn(current, (current.lastDiscard.by + 1) % 4, rules, houseRules) : current,
            );
          }}
          type="button"
        >
          Pass
        </button>
      </>
    ) : null;

  const defaultActions =
    game.phase !== "claim" ? (
      <>
        <button
          disabled
          type="button"
        >
          Pong
        </button>
        <button
          disabled
          type="button"
        >
          Chi
        </button>
        <button
          className="secondary-action"
          disabled={game.turn !== HUMAN || game.phase !== "discard" || !selectedTile}
          onClick={() => {
            if (!selectedTile) return;
            setGame((current) => discardTile(current, HUMAN, selectedTile.id, rules, houseRules));
          }}
          type="button"
        >
          Discard
        </button>
        {canSelfHu ? (
          <button onClick={() => setGame((current) => scoreRound(current, HUMAN, "self-draw", rules, houseRules))} type="button">
            Hu
          </button>
        ) : null}
        {game.turn === HUMAN && humanKongs.length > 0 && game.phase === "discard" ? (
          <button
            onClick={() => {
              if (!activeHumanKong) return;
              setGame((current) => ({ ...current, message: `Choose Silent Kong or Reveal Kong for ${kongLabel(activeHumanKong)}.` }));
            }}
            type="button"
          >
            Gong
          </button>
        ) : null}
      </>
    ) : null;

  const actionControls = game.phase === "claim" ? claimActions : defaultActions;

  const kongChoiceControls =
    game.phase === "discard" && game.turn === HUMAN && activeHumanKong ? (
      <div className="kong-choice-panel" aria-label="Choose Kong type">
        <span>{kongLabel(activeHumanKong)}</span>
        <button type="button" onClick={() => setGame((current) => applyKong(current, HUMAN, activeHumanKong, true, rules, houseRules))}>
          Silent Kong
        </button>
        <button type="button" onClick={() => setGame((current) => applyKong(current, HUMAN, activeHumanKong, false, rules, houseRules))}>
          Reveal Kong
        </button>
      </div>
    ) : null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>Table One Mahjong</h1>
        <div className="round-status">
          <span>Round {game.round}</span>
          <strong>{dealerStatus}</strong>
        </div>
      </header>

      <section className="game-layout">
        <section className="table" aria-label="Mahjong table">
          <div className="table-hand-label" aria-hidden="true">
            <span>East Wind</span>
            <strong>East Hand</strong>
          </div>
          <div className="board-toolbar">
            <div className="tiles-remaining">
              <span>Tiles remaining</span>
              <strong>{game.wall.length}</strong>
            </div>
            <div className="online-status" aria-label="Online readiness">
              <span>{game.mode === "online-ready" ? "Online ready" : "Solo"}</span>
              <strong>{game.tableId}</strong>
            </div>
            <button className="gear-button" type="button" aria-label="Open settings" onClick={() => setSettingsOpen(true)}>
              ⚙
            </button>
          </div>
          <div className="table-wall wall-top" aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <div className="table-wall wall-left" aria-hidden="true">
            {Array.from({ length: 13 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <div className="table-wall wall-right" aria-hidden="true">
            {Array.from({ length: 13 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <Opponent player={game.players[2]} active={game.turn === 2} dealer={game.dealer === 2} reveal={game.winner === 2} position="top" />
          <section className={`human-seat ${game.turn === HUMAN ? "active" : ""} ${game.dealer === HUMAN ? "dealer-seat" : ""}`}>
            <div className="seat-heading">
              <strong>{human.name || "You"}</strong>
              <div className="seat-badges">
                {game.dealer === HUMAN ? <span className="dealer-badge">Dealer</span> : null}
                <span>{human.wind}</span>
              </div>
            </div>
            <div className="seat-meta">
              <span>{human.score} pts</span>
              <span>{human.flowers.length} flowers</span>
              <span>{human.hand.length} in hand</span>
            </div>
            <SeatSets flowers={human.flowers} melds={human.melds} />
            {choosingChi && humanChiOptions.length > 1 ? (
              <div className="chi-choice-panel" aria-label="Choose Chi sequence">
                <span>Choose Chi</span>
                <div className="chi-choice-list">
                  {humanChiOptions.map((option) => (
                    <button
                      className="chi-choice"
                      key={option.map((tile) => tile.id).join("-")}
                      type="button"
                      onClick={() => {
                        setChoosingChi(false);
                        setGame((current) => applyClaim(current, HUMAN, "chi", option, rules, houseRules));
                      }}
                    >
                      <span>{formatChiOption(option)}</span>
                      <div className="chi-choice-tiles">
                        {option.map((tile) => (
                          <span className="tile chi-choice-tile" key={tile.id} title={tile.label}>
                            <TileFace tile={tile} />
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="human-hand">
              {human.hand.map((tile) => (
                <TileView
                  key={tile.id}
                  tile={tile}
                  selected={tile.id === selectedTile?.id}
                  drawn={tile.id === game.drawnTileId && game.turn === HUMAN && game.phase === "discard"}
                  waiting={humanIsWaiting && waitingTileIds.has(tile.id)}
                  disabled={game.phase !== "discard" || game.turn !== HUMAN}
                  onClick={() => {
                    if (game.phase !== "discard" || game.turn !== HUMAN) return;
                    if (game.selectedId === tile.id) {
                      setGame((current) => discardTile(current, HUMAN, tile.id, rules, houseRules));
                    } else {
                      setGame((current) => ({ ...current, selectedId: tile.id, message: `Tap ${tile.label} again to discard.` }));
                    }
                  }}
                />
              ))}
            </div>
            <div className="hand-actions">
              <div className="action-bar human-action-bar">{actionControls}</div>
              {kongChoiceControls}
            </div>
          </section>
          <Opponent player={game.players[1]} active={game.turn === 1} dealer={game.dealer === 1} reveal={game.winner === 1} position="left" />
          <div className="center-table">
            <TableDiscardGrid players={game.players} />
            <div className="table-center-core">
              <div className="center-activity">
                <span>
                  Round {game.round} · {dealerStatus}
                </span>
                <strong>{activity.text}</strong>
              </div>
              <div className="last-discard">
                <span>{activity.tile ? `${game.players[activity.player].name}'s discard` : "Table activity"}</span>
                {activity.tile ? <TileView tile={activity.tile} large disabled /> : <strong>Waiting</strong>}
              </div>
            </div>
          </div>
          <Opponent player={game.players[3]} active={game.turn === 3} dealer={game.dealer === 3} reveal={game.winner === 3} position="right" />
        </section>
      </section>

      {settingsOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Table controls</p>
                <h2 id="settings-title">Settings</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>
                ×
              </button>
            </div>

            <div className="settings-stack">
              <section className="panel-block settings-section">
                <h2>Players and style</h2>
                {game.players.map((player, index) => (
                  <div className="profile-row" key={index}>
                    <div className="profile-details">
                      <label>
                        <span>Name</span>
                        <input
                          aria-label={`${player.wind} player name`}
                          maxLength={18}
                          type="text"
                          value={player.name}
                          onChange={(event) => updatePlayerName(index, event.target.value)}
                        />
                      </label>
                      <span>
                        {player.wind} · {player.score} pts
                      </span>
                    </div>
                    {index === HUMAN ? (
                      <span className="profile-badge">You</span>
                    ) : (
                      <select value={player.difficulty} onChange={(event) => updateDifficulty(index, event.target.value as Difficulty)}>
                        <option value="calm">Calm</option>
                        <option value="balanced">Balanced</option>
                        <option value="sharp">Sharp</option>
                      </select>
                    )}
                  </div>
                ))}
              </section>

              <section className="panel-block settings-section rules-section">
                <h2>Rules</h2>
                <div className="scoring-rules-grid">
                  {ruleRows.map(([label, key]) => (
                    <label className="rule-row" key={key}>
                      <span>{label}</span>
                      <input
                        min="0"
                        type="number"
                        value={rules[key]}
                        onChange={(event) =>
                          setRules((current) => ({
                            ...current,
                            [key]: Math.max(0, Number(event.target.value)),
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <h3>Taiwanese scoring table</h3>
                <p className="settings-note">
                  Standard tai are detected from the winning hand and added to the 5-point base. Every standard rule starts on; switch off any item your table does not use.
                </p>
                <div className="house-rule-list">
                  {houseRules.map((rule) => (
                    <div className="house-rule-card" key={rule.id}>
                      <label className="house-rule-toggle">
                        <input
                          checked={rule.enabled}
                          type="checkbox"
                          onChange={(event) =>
                            setHouseRules((current) =>
                              current.map((item) => (item.id === rule.id ? { ...item, enabled: event.target.checked } : item)),
                            )
                          }
                        />
                        <span>
                          <strong>{rule.name}</strong>
                          <small>{rule.category ?? "Custom"} · {rule.description}</small>
                        </span>
                      </label>
                      <div className="house-rule-actions">
                        <label>
                          <span>Pts</span>
                          <input
                            min="0"
                            type="number"
                            value={rule.points}
                            onChange={(event) =>
                              setHouseRules((current) =>
                                current.map((item) =>
                                  item.id === rule.id ? { ...item, points: Math.max(0, Number(event.target.value)) } : item,
                                ),
                              )
                            }
                          />
                        </label>
                        {!rule.detector ? (
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => setHouseRules((current) => current.filter((item) => item.id !== rule.id))}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="house-rule-form">
                  <input
                    aria-label="House scoring name"
                    placeholder="Name"
                    type="text"
                    value={houseDraft.name}
                    onChange={(event) => setHouseDraft((current) => ({ ...current, name: event.target.value }))}
                  />
                  <textarea
                    aria-label="House scoring win condition"
                    placeholder="Describe the win condition"
                    value={houseDraft.description}
                    onChange={(event) => setHouseDraft((current) => ({ ...current, description: event.target.value }))}
                  />
                  <label>
                    <span>Points</span>
                    <input
                      min="0"
                      type="number"
                      value={houseDraft.points}
                      onChange={(event) => setHouseDraft((current) => ({ ...current, points: Math.max(0, Number(event.target.value)) }))}
                    />
                  </label>
                  <button className="secondary-button" type="button" onClick={addHouseRule}>
                    Add house item
                  </button>
                </div>
              </section>
            </div>

            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setGame(dealRound(nextDealer, game.players.map((player) => player.score), nextRound, game.players, game.tableId));
                setSettingsOpen(false);
              }}
            >
              New hand
            </button>
          </section>
        </div>
      ) : null}

      {game.winSummary ? (
        <div className="modal-backdrop win-backdrop" role="presentation">
          <section className="win-modal" role="dialog" aria-modal="true" aria-labelledby="win-title">
            <p className="eyebrow">Hand complete</p>
            <h2 id="win-title">{game.winSummary.title}</h2>
            <p>{game.winSummary.detail}</p>
            {game.winSummary.winner !== HUMAN ? (
              <div className="winning-hand-review" aria-label={`${game.players[game.winSummary.winner].name} revealed winning hand`}>
                <span>{game.players[game.winSummary.winner].name}'s hand</span>
                <div>
                  {game.players[game.winSummary.winner].hand.map((tile) => (
                    <TileView key={tile.id} tile={tile} disabled />
                  ))}
                </div>
              </div>
            ) : null}
            <div className="score-breakdown">
              {game.winSummary.lineItems.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <div className="win-total">
              <span>{game.winSummary.points} points</span>
              <strong>+{game.winSummary.total} total</strong>
            </div>
            <button
              className="full-width-button"
              type="button"
              onClick={() => setGame(dealRound(nextDealer, game.players.map((player) => player.score), nextRound, game.players, game.tableId))}
            >
              Next hand
            </button>
            <button className="text-button full-width-button" type="button" onClick={() => setGame(dealRound(0, undefined, 1, game.players, game.tableId))}>
              New game
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default function Home() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <h1>Table One Mahjong</h1>
          <div className="round-status">
            <span>Preparing</span>
            <strong>Shuffling tiles</strong>
          </div>
        </header>
      </main>
    );
  }

  return <MahjongApp />;
}
