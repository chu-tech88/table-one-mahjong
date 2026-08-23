import { Game, Player, Tile, Difficulty, HouseRule, Rules } from "./types";
import { createDefaultHouseRules, DEFAULT_RULES } from "./rules";
import {
  shuffle,
  sortTiles,
  structuredCloneGame,
  appendAction,
  tableNarration,
} from "./helpers";
import {
  isWinningHand,
  possibleChiOptions,
  canPong,
  canExposedKong,
  concealedKongOptions,
} from "./validation";
import { chooseDiscard, shouldCall } from "./ai";
import { scoreRound, settleAllEightFlowers } from "./scoring";

export function makeDeck() {
  const deck: Tile[] = [];
  const addTile = (
    code: string,
    suit: "dots" | "bamboo" | "characters" | "winds" | "dragons" | "flowers",
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
    addTile(
      `B${rank}`,
      "bamboo",
      rank,
      `${rank} Bamboo`,
      `${rank}B`,
      20 + rank,
    );
    addTile(
      `C${rank}`,
      "characters",
      rank,
      `${rank} Character`,
      `${rank}C`,
      40 + rank,
    );
  }

  ["East", "South", "West", "North"].forEach((wind, index) => {
    addTile(
      `W${index + 1}`,
      "winds",
      index + 1,
      `${wind} Wind`,
      wind[0],
      60 + index,
    );
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

  [
    "Plum",
    "Orchid",
    "Chrysanthemum",
    "Bamboo",
    "Spring",
    "Summer",
    "Autumn",
    "Winter",
  ].forEach((flower, index) => {
    addTile(
      `F${index + 1}`,
      "flowers",
      index + 1,
      flower,
      flower.slice(0, 2),
      90 + index,
      1,
      true,
    );
  });

  return shuffle(deck);
}

export const DEAD_WALL_TILES = 16;

export function drawNonFlower(
  game: Game,
  playerIndex: number,
  minimumWallTiles = DEAD_WALL_TILES,
) {
  const next = structuredCloneGame(game);
  const player = next.players[playerIndex];
  next.drawnTileId = undefined;
  next.drawContext = undefined;
  let replacedFlower = false;
  while (next.wall.length > minimumWallTiles) {
    const tile = next.wall.shift();
    if (!tile) break;
    if (tile.flower) {
      player.flowers.push(tile);
      replacedFlower = true;
    } else {
      player.hand.push(tile);
      player.hand = sortTiles(player.hand);
      next.drawnTileId = tile.id;
      next.drawContext = replacedFlower ? "flower-replacement" : "wall";
      break;
    }
  }
  return next;
}

export function dealRound(
  dealer = 0,
  scores?: number[],
  round = 1,
  profiles?: Pick<Player, "name" | "difficulty" | "controller">[],
  tableId = "local-table-one",
  rules: Rules = DEFAULT_RULES,
  houseRules: HouseRule[] = createDefaultHouseRules(),
  dealerStreak = 0,
): Game {
  let wall = makeDeck();
  const defaultNames = ["You", "Mina", "Theo", "Grace"];
  const defaultDifficulties: Difficulty[] = [
    "balanced",
    "balanced",
    "balanced",
    "balanced",
  ];
  const players: Player[] = defaultNames.map((defaultName, index) => ({
    name: profiles?.[index]?.name.trim() || defaultName,
    controller: profiles?.[index]?.controller ?? (index === 0 ? "human" : "ai"),
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
  const dealerMessage =
    dealer === 0 ? "You are Dealer" : `${dealerName} is Dealer`;

  let game: Game = {
    tableId,
    mode: "online-ready",
    actionSeq: 0,
    actionLog: [],
    players,
    wall,
    turn: dealer,
    dealer,
    dealerStreak,
    round,
    phase: "discard",
    message: tableNarration("deal", dealerMessage),
    activity: { player: dealer, text: tableNarration("deal", dealerMessage) },
    rules: { ...rules },
    houseRules: houseRules.map((rule) => ({ ...rule })),
    declaredReady: [],
    settledBonuses: [],
  };
  appendAction(
    game,
    "deal-hand",
    dealer,
    `${dealerMessage}. Hand ${round} begins.`,
  );
  players.forEach((_, index) => {
    game = settleAllEightFlowers(game, index, houseRules);
  });
  return game;
}
