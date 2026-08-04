import { WebSocketServer, WebSocket } from "ws";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { Game } from "../src/game-logic/types";
import { dealRound } from "../src/game-logic/deck";
import {
  discardTile,
  applyClaim,
  applyKong,
  startTurn,
  canDeclareReady,
  declareReadyAndDiscard,
  passClaim,
} from "../src/game-logic/flow";
import { chooseDiscard } from "../src/game-logic/ai";
import { scoreRound } from "../src/game-logic/scoring";
import {
  concealedKongOptions,
  addedKongOptions,
  isWinningHand,
} from "../src/game-logic/validation";
import {
  nextDealerForRound,
  nextDealerStreak,
  nextRoundNumber,
  structuredCloneGame,
} from "../src/game-logic/helpers";
import { ClientMessage, ServerMessage } from "../src/network/messages";

// Types
interface GameRoom {
  game: Game;
  players: (WebSocket | null)[];
  created: number;
  lastActivity: number;
  autoPlayAI: Map<number, NodeJS.Timeout>; // Track AI turn timers
}

// Storage
const rooms = new Map<string, GameRoom>();
const ROOM_RETENTION_MS = 24 * 60 * 60 * 1000;
const PORT = Number(process.env.PORT ?? process.env.WS_PORT ?? "8080");
const DIST_DIR = resolve(process.cwd(), "dist");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function isOpenSocket(socket: WebSocket | null): socket is WebSocket {
  return socket !== null && socket.readyState === WebSocket.OPEN;
}

function isHumanSeat(room: GameRoom, index: number) {
  return isOpenSocket(room.players[index] ?? null);
}

function cleanPlayerName(value: unknown) {
  return (
    String(value ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 18) || "Player"
  );
}

function syncControllers(room: GameRoom) {
  room.game.players.forEach((player, index) => {
    player.controller = isHumanSeat(room, index) ? "human" : "ai";
  });
}

function connectedSeats(room: GameRoom) {
  return room.players
    .map((player, index) => (isOpenSocket(player ?? null) ? index : -1))
    .filter((index) => index >= 0);
}

function gameForPlayer(game: Game, recipient: number) {
  if (
    game.phase !== "claim" ||
    !game.pendingClaim ||
    game.pendingClaim.claimer === recipient
  ) {
    return game;
  }

  const visible = structuredCloneGame(game);
  const claimant = visible.pendingClaim?.claimer ?? visible.turn;
  const claimantName =
    visible.players[claimant]?.name || `Player ${claimant + 1}`;
  visible.pendingClaim = undefined;
  visible.message = `${claimantName} is waiting to discard.`;
  visible.activity = {
    player: claimant,
    text: `${claimantName} is waiting to discard.`,
  };
  return visible;
}

function sendGameState(socket: WebSocket, game: Game, recipient: number) {
  socket.send(
    JSON.stringify({
      type: "game-state-update",
      game: gameForPlayer(game, recipient),
    } as ServerMessage),
  );
}

function broadcastGame(room: GameRoom) {
  room.players.forEach((player, index) => {
    if (isOpenSocket(player)) sendGameState(player, room.game, index);
  });
}

function dealNextHand(game: Game) {
  const dealer = nextDealerForRound(game);
  return dealRound(
    dealer,
    game.players.map((player) => player.score),
    nextRoundNumber(game),
    game.players,
    game.tableId,
    game.rules,
    game.houseRules,
    nextDealerStreak(game),
  );
}

function markReadyForNextHand(room: GameRoom, readyPlayer: number) {
  const required = connectedSeats(room);
  const ready = Array.from(
    new Set([...(room.game.nextHandReady ?? []), readyPlayer]),
  ).filter((index) => required.includes(index));

  if (required.length > 0 && required.every((index) => ready.includes(index))) {
    return dealNextHand(room.game);
  }

  const next = structuredCloneGame(room.game);
  next.nextHandReady = ready;
  next.nextHandRequired = required;
  next.message = "Waiting for all players to continue.";
  next.activity = {
    player: readyPlayer,
    text: "Waiting for all players to continue.",
  };
  return next;
}

function getMimeType(filePath: string) {
  return (
    MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream"
  );
}

function sendText(res: ServerResponse, status: number, text: string) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(text);
}

async function serveClient(req: IncomingMessage, res: ServerResponse) {
  if (!req.url) {
    sendText(res, 400, "Bad request");
    return;
  }

  if (req.url === "/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Method not allowed");
    return;
  }

  if (!existsSync(DIST_DIR)) {
    sendText(
      res,
      503,
      "Client build not found. Run 'npm run build' before starting production server.",
    );
    return;
  }

  const rawPath = decodeURIComponent(req.url.split("?")[0] || "/");
  const requestPath = rawPath === "/" ? "/index.html" : rawPath;
  const candidate = normalize(join(DIST_DIR, requestPath));
  const indexFile = join(DIST_DIR, "index.html");

  if (!candidate.startsWith(DIST_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  let filePath = candidate;
  try {
    const info = await stat(candidate);
    if (info.isDirectory()) {
      filePath = indexFile;
    }
  } catch {
    filePath = indexFile;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", getMimeType(filePath));
  createReadStream(filePath).pipe(res);
}

// Single-process hosting: HTTP + static client + WebSocket on one port
const httpServer = createServer((req, res) => {
  void serveClient(req, res).catch((error) => {
    console.error("[HTTP] Failed to serve request:", error);
    sendText(res, 500, "Internal server error");
  });
});

// Create WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server: httpServer });

httpServer.listen(PORT, () => {
  console.log("🎮 Mahjong Game Server");
  console.log(`🌐 HTTP listening on http://localhost:${PORT}`);
  console.log(`📡 WebSocket listening on ws://localhost:${PORT}`);
});

wss.on("connection", (socket) => {
  let roomId: string = "";
  let playerIndex: number = -1;

  console.log(`[Connected] New client connected`);

  socket.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as ClientMessage;
      console.log(
        `[Message] Received from ${roomId}:${playerIndex}:`,
        msg.type,
      );

      // ============ JOIN ROOM ============
      if (msg.type === "join-room") {
        const requestedRoomId = msg.roomId;
        const requestedPlayerIndex = msg.playerIndex;

        if (
          !Number.isInteger(requestedPlayerIndex) ||
          requestedPlayerIndex < 0 ||
          requestedPlayerIndex > 3
        ) {
          socket.send(
            JSON.stringify({
              type: "action-rejected",
              reason: "Invalid seat index. Choose 0-3.",
            } as ServerMessage),
          );
          return;
        }

        if (!rooms.has(requestedRoomId)) {
          // Create new room
          rooms.set(requestedRoomId, {
            game: dealRound(),
            players: [null, null, null, null],
            created: Date.now(),
            lastActivity: Date.now(),
            autoPlayAI: new Map(),
          });
          console.log(`[Room] Created room ${requestedRoomId}`);
        }

        const room = rooms.get(requestedRoomId)!;
        room.lastActivity = Date.now();
        const existing = room.players[requestedPlayerIndex];
        if (isOpenSocket(existing ?? null) && existing !== socket) {
          socket.send(
            JSON.stringify({
              type: "action-rejected",
              reason: `Seat ${requestedPlayerIndex} is already taken in room ${requestedRoomId}`,
            } as ServerMessage),
          );
          return;
        }
        roomId = requestedRoomId;
        playerIndex = requestedPlayerIndex;
        room.players[playerIndex] = socket;
        room.game.players[playerIndex].name = cleanPlayerName(msg.playerName);
        syncControllers(room);

        broadcastGame(room);

        console.log(`[Room] Player ${playerIndex} joined room ${roomId}`);

        // Trigger AI if needed
        setTimeout(() => playAITurnIfNeeded(roomId), 500);
      }

      // ============ ROOM SEATS (LOBBY) ============
      if (msg.type === "request-room-seats") {
        const room = rooms.get(msg.roomId);
        const occupiedSeats = room
          ? room.players
              .map((player, index) =>
                isOpenSocket(player ?? null) ? index : -1,
              )
              .filter((index) => index >= 0)
          : [];
        socket.send(
          JSON.stringify({
            type: "room-seats-update",
            roomId: msg.roomId,
            occupiedSeats,
          } as ServerMessage),
        );
      }

      // ============ PLAYER ACTION ============
      if (msg.type === "player-action") {
        const room = rooms.get(roomId);
        if (!room) {
          socket.send(
            JSON.stringify({
              type: "action-rejected",
              reason: "Room not found",
            } as ServerMessage),
          );
          return;
        }
        room.lastActivity = Date.now();

        if (room.players[playerIndex] !== socket) {
          socket.send(
            JSON.stringify({
              type: "action-rejected",
              reason: "Seat ownership mismatch. Rejoin with an available seat.",
            } as ServerMessage),
          );
          socket.close(1008, "Seat ownership mismatch");
          return;
        }

        // Validate actions by phase/type.
        // During claim phase, player 0 (human) is allowed to claim/pass even if turn is currently on another player.
        if (msg.action.type === "discard") {
          if (room.game.turn !== playerIndex || room.game.phase !== "discard") {
            socket.send(
              JSON.stringify({
                type: "action-rejected",
                reason: `Not your turn. Current turn: Player ${room.game.turn}`,
              } as ServerMessage),
            );
            return;
          }
          const player = room.game.players[playerIndex];
          if (
            room.game.declaredReady?.includes(playerIndex) &&
            player.discards.length > 0 &&
            msg.action.tileId !== room.game.drawnTileId
          ) {
            socket.send(
              JSON.stringify({
                type: "action-rejected",
                reason:
                  "After declaring ready, you must discard the tile just drawn",
              } as ServerMessage),
            );
            return;
          }
        }

        if (msg.action.type === "kong") {
          const player = room.game.players[playerIndex];
          const availableKongs = [
            ...concealedKongOptions(player.hand),
            ...addedKongOptions(player),
          ];
          if (
            room.game.phase !== "discard" ||
            room.game.turn !== playerIndex ||
            !availableKongs.includes(msg.action.code)
          ) {
            socket.send(
              JSON.stringify({
                type: "action-rejected",
                reason: "That Gong is not available right now",
              } as ServerMessage),
            );
            return;
          }
        }

        if (msg.action.type === "declare-ready") {
          if (!canDeclareReady(room.game, playerIndex, msg.action.tileId)) {
            socket.send(
              JSON.stringify({
                type: "action-rejected",
                reason: "A ready declaration is not available for that discard",
              } as ServerMessage),
            );
            return;
          }
        }

        if (msg.action.type === "claim" || msg.action.type === "pass") {
          if (room.game.phase !== "claim") {
            socket.send(
              JSON.stringify({
                type: "action-rejected",
                reason: "Not in claim phase",
              } as ServerMessage),
            );
            return;
          }
          if (room.game.pendingClaim?.claimer !== playerIndex) {
            socket.send(
              JSON.stringify({
                type: "action-rejected",
                reason: "You are not the active claimant",
              } as ServerMessage),
            );
            return;
          }
          if (msg.action.type === "claim" && room.game.pendingClaim.canHu) {
            socket.send(
              JSON.stringify({
                type: "action-rejected",
                reason: "Hu has priority over Pong, Chi, and Gong",
              } as ServerMessage),
            );
            return;
          }
        }

        if (msg.action.type === "hu") {
          if (msg.action.winBy === "discard") {
            if (
              room.game.phase !== "claim" ||
              room.game.pendingClaim?.claimer !== playerIndex ||
              !room.game.pendingClaim.canHu
            ) {
              socket.send(
                JSON.stringify({
                  type: "action-rejected",
                  reason: "You cannot win on this discard",
                } as ServerMessage),
              );
              return;
            }
          }

          if (msg.action.winBy === "self-draw") {
            const player = room.game.players[playerIndex];
            if (
              room.game.phase !== "discard" ||
              room.game.turn !== playerIndex ||
              !isWinningHand(player.hand, player.melds.length)
            ) {
              socket.send(
                JSON.stringify({
                  type: "action-rejected",
                  reason: "You cannot self-draw win right now",
                } as ServerMessage),
              );
              return;
            }
          }
        }

        if (msg.action.type === "new-hand") {
          if (playerIndex !== 0) {
            socket.send(
              JSON.stringify({
                type: "action-rejected",
                reason: "Only player 0 can start a new hand",
              } as ServerMessage),
            );
            return;
          }
        }

        if (
          msg.action.type === "ready-next-hand" &&
          room.game.phase !== "round-over"
        ) {
          socket.send(
            JSON.stringify({
              type: "action-rejected",
              reason: "The current hand is not complete",
            } as ServerMessage),
          );
          return;
        }

        let nextGame: Game | null = null;
        const action = msg.action;

        try {
          // -------- EXECUTE ACTION --------
          if (action.type === "discard") {
            const tile = room.game.players[playerIndex].hand.find(
              (t) => t.id === action.tileId,
            );
            if (!tile) {
              throw new Error("Tile not in hand");
            }

            console.log(
              `[Action] Player ${playerIndex} discards ${tile.label}`,
            );
            nextGame = discardTile(
              room.game,
              playerIndex,
              action.tileId,
              room.game.rules,
              room.game.houseRules,
              (index) => isHumanSeat(room, index),
            );
          }

          if (action.type === "claim") {
            if (room.game.phase !== "claim") {
              throw new Error("Not in claim phase");
            }

            console.log(
              `[Action] Player ${playerIndex} claims ${action.claimType}`,
            );
            nextGame = applyClaim(
              room.game,
              playerIndex,
              action.claimType,
              action.tiles,
              room.game.rules,
              room.game.houseRules,
            );
          }

          if (action.type === "pass") {
            if (room.game.phase !== "claim") {
              throw new Error("Not in claim phase");
            }

            console.log(`[Action] Player ${playerIndex} passes`);
            nextGame = passClaim(
              room.game,
              playerIndex,
              room.game.rules,
              room.game.houseRules,
              (index) => isHumanSeat(room, index),
            );
          }

          if (action.type === "hu") {
            console.log(
              `[Action] Player ${playerIndex} wins by ${action.winBy}`,
            );
            nextGame = scoreRound(
              room.game,
              playerIndex,
              action.winBy,
              room.game.rules,
              room.game.houseRules,
            );
          }

          if (action.type === "declare-ready") {
            nextGame = declareReadyAndDiscard(
              room.game,
              playerIndex,
              action.tileId,
              room.game.rules,
              room.game.houseRules,
              (index) => isHumanSeat(room, index),
            );
          }

          if (action.type === "kong") {
            nextGame = applyKong(
              room.game,
              playerIndex,
              action.code,
              action.concealed,
              room.game.rules,
              room.game.houseRules,
              (index) => isHumanSeat(room, index),
            );
          }

          if (action.type === "update-player-name") {
            if (
              action.playerIndex !== playerIndex &&
              room.game.players[action.playerIndex]?.controller !== "ai"
            ) {
              throw new Error("You can only rename yourself or an AI player");
            }
            nextGame = structuredCloneGame(room.game);
            nextGame.players[action.playerIndex].name = cleanPlayerName(
              action.name,
            );
          }

          if (action.type === "update-difficulty") {
            if (
              action.playerIndex < 0 ||
              action.playerIndex > 3 ||
              room.game.players[action.playerIndex]?.controller === "human" ||
              !["calm", "balanced", "sharp"].includes(action.difficulty)
            ) {
              throw new Error("Only AI difficulty can be changed");
            }
            nextGame = structuredCloneGame(room.game);
            nextGame.players[action.playerIndex].difficulty = action.difficulty;
          }

          if (action.type === "update-table-rules") {
            nextGame = structuredCloneGame(room.game);
            nextGame.rules = {
              baseWin: Math.max(
                0,
                Math.min(100, Number(action.rules.baseWin) || 0),
              ),
            };
            nextGame.houseRules = action.houseRules
              .slice(0, 100)
              .map((rule) => ({
                ...rule,
                id: String(rule.id).slice(0, 64),
                name: String(rule.name).slice(0, 80),
                description: String(rule.description).slice(0, 240),
                points: Math.max(0, Math.min(100, Number(rule.points) || 0)),
                enabled: Boolean(rule.enabled),
              }));
          }

          if (action.type === "new-hand") {
            if (action.resetGame) {
              nextGame = dealRound(
                0,
                undefined,
                1,
                room.game.players,
                room.game.tableId,
                room.game.rules,
                room.game.houseRules,
                0,
              );
            } else {
              const dealer = action.dealer ?? nextDealerForRound(room.game);
              const round = nextRoundNumber(room.game);
              nextGame = dealRound(
                dealer,
                room.game.players.map((p) => p.score),
                round,
                room.game.players,
                room.game.tableId,
                room.game.rules,
                room.game.houseRules,
                nextDealerStreak(room.game),
              );
            }
          }
          if (action.type === "ready-next-hand") {
            nextGame = markReadyForNextHand(room, playerIndex);
          }

          if (!nextGame) {
            throw new Error("Invalid action");
          }

          // -------- UPDATE ROOM STATE --------
          room.game = nextGame;

          // -------- BROADCAST TO ALL PLAYERS --------
          broadcastGame(room);

          // -------- TRIGGER AI TURN (IF NEEDED) --------
          setTimeout(() => playAITurnIfNeeded(roomId), 1500);
        } catch (error) {
          socket.send(
            JSON.stringify({
              type: "action-rejected",
              reason: error instanceof Error ? error.message : "Unknown error",
            } as ServerMessage),
          );
        }
      }

      // -------- REQUEST STATE (for sync) --------
      if (msg.type === "request-state") {
        const room = rooms.get(roomId);
        if (room && room.players[playerIndex] === socket) {
          sendGameState(socket, room.game, playerIndex);
        } else {
          socket.send(
            JSON.stringify({
              type: "action-rejected",
              reason: "Not joined to a seat in this room",
            } as ServerMessage),
          );
          socket.close(1008, "Not joined to a seat");
        }
      }
    } catch (error) {
      console.error("[Error] Failed to handle message:", error);
      socket.send(
        JSON.stringify({
          type: "system",
          message: "Server error",
        } as ServerMessage),
      );
    }
  });

  socket.on("close", () => {
    if (roomId && playerIndex >= 0) {
      console.log(`[Disconnected] Player ${playerIndex} left room ${roomId}`);

      const room = rooms.get(roomId);
      if (room) {
        room.lastActivity = Date.now();
        room.players[playerIndex] = null;
        syncControllers(room);

        if (room.game.phase === "round-over" && room.game.nextHandReady) {
          const required = connectedSeats(room);
          const ready = room.game.nextHandReady.filter((index) =>
            required.includes(index),
          );
          if (
            required.length > 0 &&
            required.every((index) => ready.includes(index))
          ) {
            room.game = dealNextHand(room.game);
          } else {
            room.game = {
              ...room.game,
              nextHandReady: ready,
              nextHandRequired: required,
            };
          }
        }

        // Broadcast disconnection to others
        room.players.forEach((player) => {
          if (isOpenSocket(player)) {
            // 1 = OPEN
            player.send(
              JSON.stringify({
                type: "player-disconnected",
                playerIndex,
              } as ServerMessage),
            );
          }
        });
        broadcastGame(room);

        // Clean up AI timers for this player
        if (room.autoPlayAI.has(playerIndex)) {
          clearTimeout(room.autoPlayAI.get(playerIndex));
          room.autoPlayAI.delete(playerIndex);
        }

        // Keep empty rooms so a suspended browser can resume the same hand.
        if (room.players.every((p) => p === null)) {
          room.autoPlayAI.forEach((timer) => clearTimeout(timer));
          room.autoPlayAI.clear();
          console.log(`[Room] Paused empty room ${roomId}`);
        } else {
          // If a seat disconnects during its turn/claim, allow AI fallback progression.
          setTimeout(() => playAITurnIfNeeded(roomId), 50);
        }
      }
    }
  });

  socket.on("error", (error) => {
    console.error("[Error] WebSocket error:", error);
  });
});

// ============ AI AUTOPILOT ============

function playAITurnIfNeeded(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.players.every((player) => player === null)) return;

  const { game } = room;

  // If claim is waiting on a disconnected claimant, auto-pass and continue.
  if (game.phase === "claim" && game.pendingClaim && game.lastDiscard) {
    const activeClaimant = game.pendingClaim.claimer;
    if (!isHumanSeat(room, activeClaimant)) {
      const nextGame = startTurn(
        game,
        (game.lastDiscard.by + 1) % 4,
        game.rules,
        game.houseRules,
        (index) => isHumanSeat(room, index),
      );
      room.game = nextGame;
      broadcastGame(room);
      setTimeout(() => playAITurnIfNeeded(roomId), 1500);
    }
    return;
  }

  // Check if current turn is connected human seat
  const currentPlayerIndex = game.turn;
  if (isHumanSeat(room, currentPlayerIndex)) {
    // Connected human player, wait for their action
    return;
  }

  // Check if we're in discard phase
  if (game.phase !== "discard") {
    return;
  }

  console.log(`[AI] Playing turn for Player ${currentPlayerIndex}`);

  try {
    const player = game.players[currentPlayerIndex];
    const tile = chooseDiscard(
      player.hand,
      player.difficulty,
      player.melds.length,
    );

    // Execute AI move
    const nextGame = discardTile(
      game,
      currentPlayerIndex,
      tile.id,
      game.rules,
      game.houseRules,
      (index) => isHumanSeat(room, index),
    );
    room.game = nextGame;

    // Broadcast
    broadcastGame(room);

    // Continue if another AI turn is needed
    setTimeout(() => playAITurnIfNeeded(roomId), 1500);
  } catch (error) {
    console.error(`[AI] Error during AI turn:`, error);
  }
}

const roomCleanupTimer = setInterval(
  () => {
    const cutoff = Date.now() - ROOM_RETENTION_MS;
    rooms.forEach((room, id) => {
      if (
        room.lastActivity < cutoff &&
        room.players.every((player) => player === null)
      ) {
        room.autoPlayAI.forEach((timer) => clearTimeout(timer));
        rooms.delete(id);
        console.log(`[Room] Expired inactive room ${id}`);
      }
    });
  },
  60 * 60 * 1000,
);
roomCleanupTimer.unref();

// ============ STATS ============

setInterval(() => {
  console.log(
    `[Stats] Active rooms: ${rooms.size}, Players: ${Array.from(
      rooms.values(),
    ).reduce(
      (sum, room) => sum + room.players.filter((p) => isOpenSocket(p)).length,
      0,
    )}`,
  );
}, 30000);
