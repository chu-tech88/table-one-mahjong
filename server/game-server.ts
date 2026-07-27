import { WebSocketServer, WebSocket } from "ws";
import { Game, Rules, HouseRule } from "../src/game-logic/types";
import { dealRound } from "../src/game-logic/deck";
import { discardTile, applyClaim, startTurn } from "../src/game-logic/flow";
import { scoreRound } from "../src/game-logic/scoring";
import { chooseDiscard } from "../src/game-logic/ai";
import { isWinningHand } from "../src/game-logic/validation";
import { ClientMessage, ServerMessage } from "../src/network/messages";

// Game configuration
const RULES: Rules = {
  baseWin: 5,
};

const HOUSE_RULES: HouseRule[] = [];

// Types
interface GameRoom {
  game: Game;
  players: (WebSocket | null)[];
  created: number;
  autoPlayAI: Map<number, NodeJS.Timeout>; // Track AI turn timers
}

// Storage
const rooms = new Map<string, GameRoom>();
const PORT = Number(process.env.PORT ?? process.env.WS_PORT ?? "8080");

function isOpenSocket(socket: WebSocket | null) {
  return socket !== null && socket.readyState === WebSocket.OPEN;
}

function isHumanSeat(room: GameRoom, index: number) {
  return isOpenSocket(room.players[index] ?? null);
}

// Create WebSocket server
const wss = new WebSocketServer({ port: PORT });

console.log("🎮 Mahjong Game Server");
console.log(`📡 Listening on ws://localhost:${PORT}`);

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
            autoPlayAI: new Map(),
          });
          console.log(`[Room] Created room ${requestedRoomId}`);
        }

        const room = rooms.get(requestedRoomId)!;
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

        // Send current game state to joining player
        socket.send(
          JSON.stringify({
            type: "game-state-update",
            game: room.game,
          } as ServerMessage),
        );

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
        }

        if (
          msg.action.type === "claim" ||
          msg.action.type === "pass" ||
          (msg.action.type === "hu" && msg.action.source === "discard")
        ) {
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
          if (
            msg.action.type === "hu" &&
            !room.game.pendingClaim?.canHu
          ) {
            socket.send(
              JSON.stringify({
                type: "action-rejected",
                reason: "Hu is not available",
              } as ServerMessage),
            );
            return;
          }
        }

        if (msg.action.type === "hu" && msg.action.source === "self-draw") {
          if (room.game.phase !== "discard" || room.game.turn !== playerIndex) {
            socket.send(
              JSON.stringify({
                type: "action-rejected",
                reason: `Not your turn. Current turn: Player ${room.game.turn}`,
              } as ServerMessage),
            );
            return;
          }
          const player = room.game.players[playerIndex];
          if (!isWinningHand(player.hand, player.melds.length)) {
            socket.send(
              JSON.stringify({
                type: "action-rejected",
                reason: "Hand is not a winning hand",
              } as ServerMessage),
            );
            return;
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

        let nextGame: Game | null = null;

        try {
          // -------- EXECUTE ACTION --------
          if (msg.action.type === "discard") {
            const tile = room.game.players[playerIndex].hand.find(
              (t) => t.id === msg.action.tileId,
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
              msg.action.tileId,
              RULES,
              HOUSE_RULES,
              (index) => isHumanSeat(room, index),
            );
          }

          if (msg.action.type === "claim") {
            if (room.game.phase !== "claim") {
              throw new Error("Not in claim phase");
            }

            console.log(
              `[Action] Player ${playerIndex} claims ${msg.action.claimType}`,
            );
            nextGame = applyClaim(
              room.game,
              playerIndex,
              msg.action.claimType,
              msg.action.tiles,
              RULES,
              HOUSE_RULES,
            );
          }

          if (msg.action.type === "hu") {
            nextGame = scoreRound(
              room.game,
              playerIndex,
              msg.action.source,
              RULES,
              HOUSE_RULES,
            );
          }

          if (msg.action.type === "pass") {
            if (room.game.phase !== "claim") {
              throw new Error("Not in claim phase");
            }

            console.log(`[Action] Player ${playerIndex} passes`);
            nextGame = startTurn(
              room.game,
              (room.game.lastDiscard!.by + 1) % 4,
              RULES,
              HOUSE_RULES,
              (index) => isHumanSeat(room, index),
            );
          }

          if (msg.action.type === "new-hand") {
            if (msg.action.resetGame) {
              nextGame = dealRound(
                0,
                undefined,
                1,
                room.game.players,
                room.game.tableId,
              );
            } else {
              const dealer =
                msg.action.dealer ??
                (room.game.winner === room.game.dealer
                  ? room.game.dealer
                  : (room.game.dealer + 1) % 4);
              const round =
                msg.action.dealer !== undefined &&
                msg.action.dealer !== room.game.dealer
                  ? room.game.round + 1
                  : room.game.round;
              nextGame = dealRound(
                dealer,
                room.game.players.map((p) => p.score),
                round,
                room.game.players,
                room.game.tableId,
              );
            }
          }

          if (!nextGame) {
            throw new Error("Invalid action");
          }

          // -------- UPDATE ROOM STATE --------
          room.game = nextGame;

          // -------- BROADCAST TO ALL PLAYERS --------
          room.players.forEach((player) => {
            if (isOpenSocket(player ?? null)) {
              // 1 = OPEN
              player.send(
                JSON.stringify({
                  type: "game-state-update",
                  game: nextGame,
                } as ServerMessage),
              );
            }
          });

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
          socket.send(
            JSON.stringify({
              type: "game-state-update",
              game: room.game,
            } as ServerMessage),
          );
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
        room.players[playerIndex] = null;

        // Broadcast disconnection to others
        room.players.forEach((player) => {
          if (isOpenSocket(player ?? null)) {
            // 1 = OPEN
            player.send(
              JSON.stringify({
                type: "player-disconnected",
                playerIndex,
              } as ServerMessage),
            );
          }
        });

        // Clean up AI timers for this player
        if (room.autoPlayAI.has(playerIndex)) {
          clearTimeout(room.autoPlayAI.get(playerIndex));
          room.autoPlayAI.delete(playerIndex);
        }

        // Clean up room if empty
        if (room.players.every((p) => p === null)) {
          rooms.delete(roomId);
          console.log(`[Room] Cleaned up empty room ${roomId}`);
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

  const { game } = room;

  // If claim is waiting on a disconnected claimant, auto-pass and continue.
  if (game.phase === "claim" && game.pendingClaim && game.lastDiscard) {
    const activeClaimant = game.pendingClaim.claimer;
    if (!isHumanSeat(room, activeClaimant)) {
      const nextGame = startTurn(
        game,
        (game.lastDiscard.by + 1) % 4,
        RULES,
        HOUSE_RULES,
        (index) => isHumanSeat(room, index),
      );
      room.game = nextGame;
      room.players.forEach((p) => {
        if (isOpenSocket(p ?? null)) {
          p.send(
            JSON.stringify({
              type: "game-state-update",
              game: nextGame,
            } as ServerMessage),
          );
        }
      });
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
      RULES,
      HOUSE_RULES,
      (index) => isHumanSeat(room, index),
    );
    room.game = nextGame;

    // Broadcast
    room.players.forEach((p) => {
      if (isOpenSocket(p ?? null)) {
        // 1 = OPEN
        p.send(
          JSON.stringify({
            type: "game-state-update",
            game: nextGame,
          } as ServerMessage),
        );
      }
    });

    // Continue if another AI turn is needed
    setTimeout(() => playAITurnIfNeeded(roomId), 1500);
  } catch (error) {
    console.error(`[AI] Error during AI turn:`, error);
  }
}

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
