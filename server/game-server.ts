import { WebSocketServer, WebSocket } from "ws";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { Game, SeatPresence } from "../src/game-logic/types";
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
import {
  markReadyForNextHand,
  prepareNextHandReadiness,
  removeRequiredSeat,
} from "../src/game-logic/round";

// Types
interface GameRoom {
  game: Game;
  players: (WebSocket | null)[];
  chatSubscribers: Set<WebSocket>;
  created: number;
  lastActivity: number;
  autoPlayAI: Map<number, NodeJS.Timeout>; // Track AI turn timers
  disconnectTimers: Map<number, NodeJS.Timeout>;
  seatPresence: SeatPresence[];
}

// Storage
const rooms = new Map<string, GameRoom>();
const ROOM_RETENTION_MS = 24 * 60 * 60 * 1000;
const DISCONNECT_GRACE_MS = Number(process.env.DISCONNECT_GRACE_MS ?? "30000");
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
  return room.seatPresence[index] !== "ai";
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
    player.controller = room.seatPresence[index] === "ai" ? "ai" : "human";
  });
  room.game.seatPresence = [...room.seatPresence];
}

function resetRoomForNewSession(room: GameRoom) {
  const previousRules = room.game.rules;
  const previousHouseRules = room.game.houseRules;
  room.game = dealRound(
    0,
    undefined,
    1,
    room.game.players,
    room.game.tableId,
    previousRules,
    previousHouseRules,
    0,
  );
  room.players = [null, null, null, null];
  room.chatSubscribers.clear();
  room.lastActivity = Date.now();
  room.autoPlayAI.forEach((timer) => clearTimeout(timer));
  room.autoPlayAI.clear();
  room.disconnectTimers.forEach((timer) => clearTimeout(timer));
  room.disconnectTimers.clear();
  room.seatPresence = ["ai", "ai", "ai", "ai"];
  syncControllers(room);

  room.chatSubscribers.forEach((subscriber) => {
    if (isOpenSocket(subscriber)) {
      subscriber.send(
        JSON.stringify({
          type: "system",
          message: "Room reset: chat cleared",
        } as ServerMessage),
      );
    }
  });
}

function removeRoomIfEmpty(roomId: string, room: GameRoom) {
  const hasHumanSeats = room.players.some((player) =>
    isOpenSocket(player ?? null),
  );
  if (!hasHumanSeats) {
    rooms.delete(roomId);
    room.autoPlayAI.forEach((timer) => clearTimeout(timer));
    room.autoPlayAI.clear();
    room.disconnectTimers.forEach((timer) => clearTimeout(timer));
    room.disconnectTimers.clear();
    room.chatSubscribers.clear();
  }
}

function shouldPreserveRoom(room: GameRoom) {
  return room.players.some((player) => isOpenSocket(player ?? null));
}

function connectedSeats(room: GameRoom) {
  return room.players
    .map((player, index) => (isOpenSocket(player ?? null) ? index : -1))
    .filter((index) => index >= 0);
}

function activeHumanSeats(room: GameRoom) {
  return room.seatPresence
    .map((presence, index) => (presence === "ai" ? -1 : index))
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

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

async function createTrelloCard(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    sendText(res, 405, "Method not allowed");
    return;
  }

  try {
    const payload = await readJsonBody(req);
    const title = String(payload?.title ?? "Bug report").trim();
    const description = String(payload?.description ?? "").trim();
    const snapshot = payload?.snapshot ?? {};
    const metadata = payload?.metadata ?? {};
    const serialized = JSON.stringify(
      { snapshot, metadata, title, description },
      null,
      2,
    );
    const screenshotDataUrl = String(payload?.screenshot ?? "").trim();
    const summaryDescription = [
      description || "Automated gameplay scenario export",
      "",
      "A JSON replay payload is attached to this card.",
      `Mode: ${metadata?.mode ?? "unknown"}`,
      `Room: ${metadata?.roomId ?? "n/a"}`,
      `Player: ${metadata?.playerName ?? "n/a"}`,
    ]
      .join("\n")
      .slice(0, 4000);

    const trelloApiKey = process.env.TRELLO_API_KEY?.trim();
    const trelloToken = process.env.TRELLO_TOKEN?.trim();
    const trelloListId = process.env.TRELLO_LIST_ID?.trim();

    console.log("[Trello] Request received", {
      hasApiKey: Boolean(trelloApiKey),
      hasToken: Boolean(trelloToken),
      hasListId: Boolean(trelloListId),
      title,
    });

    if (!trelloApiKey || !trelloToken || !trelloListId) {
      const missing = [
        !trelloApiKey ? "TRELLO_API_KEY" : null,
        !trelloToken ? "TRELLO_TOKEN" : null,
        !trelloListId ? "TRELLO_LIST_ID" : null,
      ].filter(Boolean);
      console.error("[Trello] Missing configuration", { missing });
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          ok: false,
          message: `Trello is not configured. Missing: ${missing.join(", ")}`,
        }),
      );
      return;
    }

    const cardParams = new URLSearchParams({
      key: trelloApiKey,
      token: trelloToken,
      idList: trelloListId,
      name: title,
      desc: summaryDescription,
    });

    const cardResponse = await fetch("https://api.trello.com/1/cards", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: cardParams,
    });

    if (!cardResponse.ok) {
      const cardText = await cardResponse.text();
      console.error("[Trello] Card creation failed", {
        status: cardResponse.status,
        body: cardText,
      });
      res.statusCode = cardResponse.status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, message: cardText }));
      return;
    }

    const cardData = (await cardResponse.json()) as {
      id?: string;
      url?: string;
      name?: string;
    };

    const attachments = [
      {
        name: `${title.replace(/\s+/g, "-").toLowerCase() || "bug-report"}-${Date.now()}.json`,
        data: new Blob([serialized], { type: "application/json" }),
      },
    ];

    if (screenshotDataUrl.startsWith("data:image/")) {
      const base64 = screenshotDataUrl.split(",")[1] ?? "";
      const screenshotBuffer = Buffer.from(base64, "base64");
      attachments.push({
        name: `${title.replace(/\s+/g, "-").toLowerCase() || "bug-report"}-${Date.now()}.png`,
        data: new Blob([screenshotBuffer], { type: "image/png" }),
      });
    }

    let attachmentResponse: Response | null = null;
    for (const attachment of attachments) {
      const attachmentForm = new FormData();
      attachmentForm.append("file", attachment.data, attachment.name);

      console.log("[Trello] Uploading attachment", {
        cardId: cardData.id,
        attachmentName: attachment.name,
      });

      attachmentResponse = await fetch(
        `https://api.trello.com/1/cards/${cardData.id}/attachments?key=${trelloApiKey}&token=${trelloToken}`,
        {
          method: "POST",
          body: attachmentForm,
        },
      );

      if (!attachmentResponse.ok) {
        const attachmentText = await attachmentResponse.text();
        console.error("[Trello] Attachment creation failed", {
          status: attachmentResponse.status,
          body: attachmentText,
          attachmentName: attachment.name,
        });
      } else {
        console.log("[Trello] Attachment uploaded", {
          cardId: cardData.id,
          attachmentName: attachment.name,
        });
      }
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: true,
        cardId: cardData.id,
        cardUrl: cardData.url,
        cardName: cardData.name,
        attachmentOk: attachmentResponse.ok,
      }),
    );
  } catch (error) {
    console.error("[Trello] Failed to create card", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({ ok: false, message: "Failed to create Trello card" }),
    );
  }
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

  if (req.url === "/api/bug-report") {
    await createTrelloCard(req, res);
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
  let isLeavingRoom = false;

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
          requestedPlayerIndex !== undefined &&
          (!Number.isInteger(requestedPlayerIndex) ||
            requestedPlayerIndex < 0 ||
            requestedPlayerIndex > 3)
        ) {
          socket.send(
            JSON.stringify({
              type: "action-rejected",
              reason: "Invalid seat index. Choose 0-3.",
            } as ServerMessage),
          );
          return;
        }

        const normalizedRoomId = String(requestedRoomId ?? "")
          .trim()
          .replace(/\s+/g, "-")
          .slice(0, 32);

        if (!normalizedRoomId) {
          socket.send(
            JSON.stringify({
              type: "action-rejected",
              reason: "Room ID is required.",
            } as ServerMessage),
          );
          return;
        }

        if (!rooms.has(normalizedRoomId)) {
          rooms.set(normalizedRoomId, {
            game: dealRound(),
            players: [null, null, null, null],
            chatSubscribers: new Set<WebSocket>(),
            created: Date.now(),
            lastActivity: Date.now(),
            autoPlayAI: new Map(),
            disconnectTimers: new Map(),
            seatPresence: ["ai", "ai", "ai", "ai"],
          });
          console.log(`[Room] Created room ${normalizedRoomId}`);
        }

        const room = rooms.get(normalizedRoomId)!;
        room.lastActivity = Date.now();
        const availableSeats = room.players
          .map((player, index) =>
            !isOpenSocket(player ?? null) && room.seatPresence[index] === "ai"
              ? index
              : -1,
          )
          .filter((index) => index >= 0);
        if (requestedPlayerIndex !== undefined) {
          const existing = room.players[requestedPlayerIndex];
          if (isOpenSocket(existing ?? null) && existing !== socket) {
            socket.send(
              JSON.stringify({
                type: "action-rejected",
                reason: `Seat ${requestedPlayerIndex} is already taken in room ${normalizedRoomId}`,
              } as ServerMessage),
            );
            return;
          }
        } else if (availableSeats.length === 0) {
          socket.send(
            JSON.stringify({
              type: "action-rejected",
              reason: `Room ${normalizedRoomId} is full`,
            } as ServerMessage),
          );
          return;
        }
        roomId = normalizedRoomId;
        playerIndex =
          requestedPlayerIndex ??
          availableSeats[Math.floor(Math.random() * availableSeats.length)];
        const disconnectTimer = room.disconnectTimers.get(playerIndex);
        if (disconnectTimer) clearTimeout(disconnectTimer);
        room.disconnectTimers.delete(playerIndex);
        room.players[playerIndex] = socket;
        room.seatPresence[playerIndex] = "connected";
        room.game.players[playerIndex].name = cleanPlayerName(msg.playerName);
        syncControllers(room);

        socket.send(
          JSON.stringify({
            type: "room-joined",
            roomId,
            playerIndex,
          } as ServerMessage),
        );

        broadcastGame(room);

        console.log(`[Room] Player ${playerIndex} joined room ${roomId}`);

        // Trigger AI if needed
        setTimeout(() => playAITurnIfNeeded(roomId), 500);
      }

      // ============ ROOM SEATS (LOBBY) ============
      if (msg.type === "request-room-seats") {
        const room = rooms.get(msg.roomId);
        const occupiedSeats = room
          ? room.seatPresence
              .map((presence, index) => (presence !== "ai" ? index : -1))
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

      if (msg.type === "request-room-list") {
        const visibleRooms = [...rooms.entries()]
          .filter(([, room]) =>
            room.players.some((player) => isOpenSocket(player ?? null)),
          )
          .map(([roomId, room]) => {
            const occupiedSeats = room.seatPresence
              .map((presence, index) => (presence !== "ai" ? index : -1))
              .filter((index) => index >= 0);
            return {
              roomId,
              occupiedSeats,
              playerCount: occupiedSeats.length,
              isFull: occupiedSeats.length >= 4,
            };
          })
          .sort((a, b) => a.roomId.localeCompare(b.roomId));

        socket.send(
          JSON.stringify({
            type: "room-list-update",
            rooms: visibleRooms,
          } as ServerMessage),
        );
      }

      if (msg.type === "join-lobby-chat") {
        const room = rooms.get(msg.roomId);
        if (!room) {
          socket.send(
            JSON.stringify({
              type: "action-rejected",
              reason: "Room not found.",
            } as ServerMessage),
          );
          return;
        }

        roomId = msg.roomId;
        playerIndex = msg.playerIndex;
        room.chatSubscribers.add(socket);
        room.lastActivity = Date.now();
        return;
      }

      if (msg.type === "lobby-chat") {
        const room = rooms.get(msg.roomId);
        if (!room || !room.chatSubscribers.has(socket)) {
          socket.send(
            JSON.stringify({
              type: "action-rejected",
              reason: "You have not joined this room's chat.",
            } as ServerMessage),
          );
          return;
        }

        const normalizedText = String(msg.text ?? "")
          .trim()
          .slice(0, 140);
        if (!normalizedText) return;

        const payload = {
          type: "lobby-chat-message",
          message: {
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            playerIndex: msg.playerIndex,
            playerName: cleanPlayerName(msg.playerName),
            text: normalizedText,
            createdAt: Date.now(),
          },
        } as ServerMessage;

        room.chatSubscribers.forEach((subscriber) => {
          if (isOpenSocket(subscriber)) {
            subscriber.send(JSON.stringify(payload));
          }
        });
      }

      // ============ LEAVE ROOM ============
      if (msg.type === "leave-room") {
        const room = rooms.get(roomId);
        if (!room) {
          socket.send(
            JSON.stringify({
              type: "action-rejected",
              reason: "Room not found.",
            } as ServerMessage),
          );
          return;
        }

        room.lastActivity = Date.now();
        isLeavingRoom = true;

        room.chatSubscribers.delete(socket);

        if (playerIndex >= 0 && room.players[playerIndex] === socket) {
          room.players[playerIndex] = null;
        }

        room.seatPresence[playerIndex] = "ai";
        const disconnectTimer = room.disconnectTimers.get(playerIndex);
        if (disconnectTimer) clearTimeout(disconnectTimer);
        room.disconnectTimers.delete(playerIndex);
        room.game = removeRequiredSeat(room.game, playerIndex);

        syncControllers(room);

        const remainingHumanPlayers = shouldPreserveRoom(room);
        if (remainingHumanPlayers) {
          room.players.forEach((player) => {
            if (isOpenSocket(player)) {
              player.send(
                JSON.stringify({
                  type: "game-state-update",
                  game: room.game,
                } as ServerMessage),
              );
            }
          });
        } else {
          resetRoomForNewSession(room);
          removeRoomIfEmpty(roomId, room);
          console.log(`[Room] Reset room ${roomId} after last human left`);
        }

        socket.send(
          JSON.stringify({
            type: "system",
            message: "Left room",
          } as ServerMessage),
        );
        socket.close(1000, "Left room");
        return;
      }

      // ============ PLAYER ACTION ============
      if (msg.type === "player-action") {
        const room = rooms.get(roomId);
        if (!room) {
          socket.send(
            JSON.stringify({
              type: "action-rejected",
              reason: "Room not found.",
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
                reason: `It is not your turn. ${room.game.players[room.game.turn].name} is currently playing.`,
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
                  "After declaring ready, you must discard the tile you just drew.",
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
                reason: "That Gong is not available right now.",
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
                reason:
                  "A ready declaration is not available for that discard.",
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
                reason: "No claim is available right now.",
              } as ServerMessage),
            );
            return;
          }
          if (room.game.pendingClaim?.claimer !== playerIndex) {
            socket.send(
              JSON.stringify({
                type: "action-rejected",
                reason: "You are not the active claimant.",
              } as ServerMessage),
            );
            return;
          }
          if (msg.action.type === "claim" && room.game.pendingClaim.canHu) {
            socket.send(
              JSON.stringify({
                type: "action-rejected",
                reason: "Hu has priority over Pong, Chi, and Gong.",
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
                  reason: "You cannot win on this discard.",
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
                  reason: "You cannot win by self-draw right now.",
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
                reason: "Only the room controller can start a new hand.",
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
              reason: "The current hand is not complete.",
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
              throw new Error("The selected tile is not in your hand.");
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
              throw new Error("No claim is available right now.");
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
              throw new Error("No claim is available right now.");
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
              throw new Error("You can only rename yourself or an AI player.");
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
              throw new Error("Only an AI player's difficulty can be changed.");
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
            nextGame = markReadyForNextHand(room.game, playerIndex);
          }

          if (!nextGame) {
            throw new Error("That action is not available right now.");
          }

          // -------- UPDATE ROOM STATE --------
          if (
            nextGame.phase === "round-over" &&
            room.game.phase !== "round-over"
          ) {
            nextGame = prepareNextHandReadiness(
              nextGame,
              activeHumanSeats(room),
            );
          }
          room.game = nextGame;
          syncControllers(room);

          // -------- BROADCAST TO ALL PLAYERS --------
          broadcastGame(room);

          // -------- TRIGGER AI TURN (IF NEEDED) --------
          setTimeout(() => playAITurnIfNeeded(roomId), 1500);
        } catch (error) {
          socket.send(
            JSON.stringify({
              type: "action-rejected",
              reason:
                error instanceof Error
                  ? error.message
                  : "An unknown error occurred.",
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
              reason: "You have not joined a seat in this room.",
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
          message: "A server error occurred.",
        } as ServerMessage),
      );
    }
  });

  socket.on("close", () => {
    if (roomId && playerIndex >= 0 && !isLeavingRoom) {
      console.log(`[Disconnected] Player ${playerIndex} left room ${roomId}`);

      const room = rooms.get(roomId);
      if (room) {
        room.lastActivity = Date.now();
        if (room.players[playerIndex] === socket) {
          room.players[playerIndex] = null;
        }
        room.seatPresence[playerIndex] = "reconnecting";
        syncControllers(room);
        broadcastGame(room);

        // Clean up AI timers for this player
        if (room.autoPlayAI.has(playerIndex)) {
          clearTimeout(room.autoPlayAI.get(playerIndex));
          room.autoPlayAI.delete(playerIndex);
        }

        const existingTimer = room.disconnectTimers.get(playerIndex);
        if (existingTimer) clearTimeout(existingTimer);
        const disconnectTimer = setTimeout(() => {
          const currentRoom = rooms.get(roomId);
          if (
            !currentRoom ||
            isOpenSocket(currentRoom.players[playerIndex] ?? null) ||
            currentRoom.seatPresence[playerIndex] !== "reconnecting"
          ) {
            return;
          }

          currentRoom.disconnectTimers.delete(playerIndex);
          currentRoom.seatPresence[playerIndex] = "ai";
          currentRoom.game = removeRequiredSeat(currentRoom.game, playerIndex);
          syncControllers(currentRoom);
          currentRoom.players.forEach((player) => {
            if (isOpenSocket(player)) {
              player.send(
                JSON.stringify({
                  type: "player-disconnected",
                  playerIndex,
                  aiTakeover: true,
                } as ServerMessage),
              );
            }
          });
          broadcastGame(currentRoom);
          setTimeout(() => playAITurnIfNeeded(roomId), 50);
        }, DISCONNECT_GRACE_MS);
        room.disconnectTimers.set(playerIndex, disconnectTimer);
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
        room.disconnectTimers.forEach((timer) => clearTimeout(timer));
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
