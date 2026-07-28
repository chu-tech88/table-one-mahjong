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
  | "score-round";

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

export type Rules = {
  baseWin: number;
};

export type StandardRuleKey =
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
  winner: number;
  title: string;
  detail: string;
  points: number;
  total: number;
  lineItems: string[];
};

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

export type GameActionLog = {
  seq: number;
  type: GameActionType;
  actor: number;
  description: string;
  at: number;
};
