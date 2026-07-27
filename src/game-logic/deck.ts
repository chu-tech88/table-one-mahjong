import { Game, Player, Tile, Difficulty } from "./types";
import { shuffle, sortTiles, structuredCloneGame, appendAction, tableNarration } from "./helpers";
import { isWinningHand, possibleChiOptions, canPong, canExposedKong, concealedKongOptions } from "./validation";
import { chooseDiscard, shouldCall } from "./ai";
import { scoreRound } from "./scoring";

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

export function drawNonFlower(game: Game, playerIndex: number) {
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

export function dealRound(
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
  const dealerMessage = dealer === 0 ? "You are Dealer" : `${dealerName} is dealer`;

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
