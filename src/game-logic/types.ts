export type Suit =
  | "dots"
  | "bamboo"
  | "characters"
  | "winds"
  | "dragons"
  | "flowers";
export type Difficulty = "calm" | "balanced" | "sharp";
export type Phase = "discard" | "claim" | "round-over";
export type MeldType = "chi" | "pong" | "kong";
export type TableMode = "solo" | "online-ready";
export type GameActionType =
  | "deal-hand"
  | "draw"
  | "discard"
  | "claim"
  | "kong"
  | "declare-ready"
  | "score-bonus"
  | "score-round"
  | "hand-draw";

export type Tile = {
  id: string;
  code: string;
  suit: Suit;
  rank: number;
  label: string;
  short: string;
  sort: number;
  flower?: boolean;
};

export type Meld = {
  type: MeldType;
  tiles: Tile[];
  from?: number;
  concealed?: boolean;
};

export type Player = {
  name: string;
  controller: "human" | "ai";
  wind: string;
  difficulty: Difficulty;
  hand: Tile[];
  flowers: Tile[];
  melds: Meld[];
  discards: Tile[];
  score: number;
};

export type LastDiscard = {
  tile: Tile;
  by: number;
};

export type PendingClaim = {
  tile: Tile;
  by: number;
  claimer: number;
  canHu: boolean;
  canPong: boolean;
  canKong: boolean;
  canChi: boolean;
};

export type PendingAddedGong = {
  player: number;
  tile: Tile;
  meldIndex: number;
  candidates: number[];
};

export type Rules = {
  baseWin: number;
};

export type StandardRuleKey =
  | "dealer"
  | "flower"
  | "no-flowers"
  | "wind-or-dragon"
  | "no-wind-or-dragon"
  | "waiting-one-with-option"
  | "self-draw"
  | "dual-wait"
  | "revealed-gong"
  | "flower-replacement-win"
  | "pair-win"
  | "concealed-hand"
  | "pure-single-wait"
  | "concealed-gong"
  | "two-concealed-pongs"
  | "pure-double-chi"
  | "big-small-chi"
  | "terminal-pongs"
  | "four-in-one"
  | "missing-two-suits"
  | "all-simple"
  | "small-chi"
  | "robbing-gong"
  | "last-tile-draw"
  | "gong-replacement-win"
  | "two-four-in-ones"
  | "two-gongs-two-concealed-triplets"
  | "single-wait-last-tile"
  | "three-consecutive-pairs"
  | "five-families"
  | "three-sister-chi"
  | "three-concealed-triplets"
  | "mixed-terminals-honors"
  | "eight-exhausted-tiles"
  | "big-chi"
  | "same-number-pongs"
  | "three-shifted-pongs"
  | "pure-triple-chi"
  | "little-win"
  | "one-long-dragon"
  | "little-three-winds"
  | "all-pongs"
  | "one-mixed-suit"
  | "pure-terminals"
  | "double-terminal-sequence"
  | "double-terminal-triplets"
  | "five-consecutive-pongs"
  | "three-gongs-three-triplets"
  | "big-three-winds"
  | "little-three-dragons"
  | "four-concealed-triplets"
  | "four-shifted-triplets"
  | "declaration-win"
  | "twin-dragons"
  | "little-four-winds"
  | "big-three-dragons"
  | "four-in-four"
  | "three-digits"
  | "terminals-or-honors-every-set"
  | "four-gongs-four-triplets"
  | "big-four-winds"
  | "pure-one-suit"
  | "all-eight-flowers"
  | "heavenly-win"
  | "five-concealed-triplets"
  | "five-shifted-triplets"
  | "all-winds-dragons"
  | "pure-quadruple-chi";

export type HouseRule = {
  id: string;
  name: string;
  description: string;
  points: number;
  enabled: boolean;
  detector?: StandardRuleKey;
  category?: "Everyday" | "Hand patterns" | "Limit hands" | "Custom";
};

export type HouseRuleDraft = {
  name: string;
  description: string;
  points: number;
};

export type WinSummary = {
  winner?: number;
  winningTileId?: string;
  title: string;
  detail: string;
  points: number;
  total: number;
  lineItems: string[];
  scoreItems: Array<{
    name: string;
    description: string;
    points: number;
    multiplier: number;
  }>;
};

export type SeatPresence = "connected" | "reconnecting" | "ai";

export type Activity = {
  player: number;
  text: string;
  tile?: Tile;
};

export type Game = {
  tableId: string;
  mode: TableMode;
  actionSeq: number;
  actionLog: GameActionLog[];
  players: Player[];
  wall: Tile[];
  turn: number;
  dealer: number;
  dealerStreak: number;
  round: number;
  phase: Phase;
  lastDiscard?: LastDiscard;
  pendingClaim?: PendingClaim;
  claimPasses?: number[];
  pendingAddedGong?: PendingAddedGong;
  message: string;
  selectedId?: string;
  drawnTileId?: string;
  drawContext?: "wall" | "flower-replacement" | "gong-replacement";
  robbingGong?: boolean;
  declaredReady?: number[];
  settledBonuses?: string[];
  activity?: Activity;
  handResult?: "win" | "draw";
  winner?: number;
  winSummary?: WinSummary;
  nextHandReady?: number[];
  nextHandRequired?: number[];
  seatPresence?: SeatPresence[];
  rules: Rules;
  houseRules: HouseRule[];
};

export type GameActionLog = {
  seq: number;
  type: GameActionType;
  actor: number;
  description: string;
  at: number;
};
