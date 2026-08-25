import { Difficulty, Game, HouseRule, Rules } from "../game-logic/types";
import { possibleChiOptions } from "../game-logic/validation";
import {
  ClientMessage,
  ServerMessage,
  PlayerAction,
  RoomResumeCredentials,
  RoomSession,
} from "./messages";

/**
 * Client-side WebSocket connector for multiplayer games.
 * Handles:
 * - Connection to server
 * - Sending player actions
 * - Receiving game state updates
 * - Local validation for UI feedback
 */

export type GameClientCallbacks = {
  onSeatAssigned?: (playerIndex: number) => void;
  onSessionAssigned?: (session: RoomSession) => void;
  onGameStateUpdate?: (game: Game) => void;
  onRoomListUpdate?: (
    rooms: Array<{
      roomId: string;
      occupiedSeats: number[];
      playerCount: number;
      isFull: boolean;
    }>,
  ) => void;
  onActionRejected?: (reason: string) => void;
  onDisconnected?: () => void;
  onPlayerTakenOver?: (playerIndex: number) => void;
  onSystemMessage?: (message: string) => void;
};

export class GameClient {
  private ws: WebSocket | null = null;
  private roomId: string = "";
  private playerIndex: number = -1;
  private playerName: string = "";
  private game: Game | null = null;
  private callbacks: GameClientCallbacks;
  private isConnected = false;
  private intentionalDisconnect = false;
  private roomInstanceId = "";
  private latestStateVersion = -1;

  constructor(callbacks?: GameClientCallbacks) {
    this.callbacks = callbacks || {};
  }

  // ============ CONNECTION ============

  connect(
    serverUrl: string,
    roomId: string,
    playerIndex: number | undefined,
    playerName: string,
    resumeCredentials?: RoomResumeCredentials,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.ws && this.isConnected) {
          console.log("[GameClient] Already connected");
          resolve();
          return;
        }

        this.roomId = roomId;
        this.playerIndex = playerIndex ?? -1;
        this.playerName = playerName;
        this.intentionalDisconnect = false;
        let settled = false;
        let joined = false;

        const rejectConnection = (error: unknown) => {
          if (settled) return;
          settled = true;
          reject(
            error instanceof Error ? error : new Error("Connection failed"),
          );
        };

        console.log(`[GameClient] Connecting to ${serverUrl}`);

        // Create WebSocket connection
        this.ws = new WebSocket(serverUrl);

        const onOpenTimeout = setTimeout(() => {
          console.error("[GameClient] Connection timeout");
          this.intentionalDisconnect = true;
          this.ws?.close();
          rejectConnection(new Error("Connection timeout"));
        }, 5000);

        this.ws.onopen = () => {
          console.log(`[GameClient] Connected to server at ${serverUrl}`);

          // Join room
          this.sendMessage({
            type: "join-room",
            roomId,
            playerIndex,
            playerName,
            playerId: resumeCredentials?.playerId,
            resumeToken: resumeCredentials?.resumeToken,
          });
        };

        this.ws.onmessage = (event) => {
          try {
            if (typeof event.data !== "string") {
              console.warn("[GameClient] Ignoring non-text websocket message");
              return;
            }
            const msg = JSON.parse(event.data) as ServerMessage;
            this.handleServerMessage(msg);
            if (msg.type === "room-joined") {
              joined = true;
              this.isConnected = true;
              clearTimeout(onOpenTimeout);
              if (!settled) {
                settled = true;
                resolve();
              }
            } else if (msg.type === "action-rejected" && !joined) {
              this.intentionalDisconnect = true;
              this.ws?.close();
              rejectConnection(new Error(msg.reason));
            }
          } catch (error) {
            console.error("[GameClient] Failed to parse message:", error);
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(onOpenTimeout);
          console.error("WebSocket error:", error);
          this.isConnected = false;
          rejectConnection(error);
        };

        this.ws.onclose = () => {
          clearTimeout(onOpenTimeout);
          console.log("Disconnected from server");
          this.isConnected = false;
          if (!settled) {
            rejectConnection(new Error("Disconnected before joining"));
          }
          if (!this.intentionalDisconnect) this.callbacks.onDisconnected?.();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.ws) {
      console.log("[GameClient] Disconnecting");
      this.intentionalDisconnect = true;
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  // ============ SEND MESSAGES ============

  private sendMessage(message: ClientMessage) {
    if (!this.ws || this.ws.readyState !== 1) {
      // 1 = OPEN
      console.error("WebSocket not connected");
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  sendAction(action: PlayerAction) {
    this.sendMessage({
      type: "player-action",
      playerIndex: this.playerIndex,
      actionId:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      action,
    });
  }

  requestState() {
    this.sendMessage({
      type: "request-state",
    });
  }

  requestRoomList() {
    this.sendMessage({
      type: "request-room-list",
    });
  }

  leaveRoom() {
    this.intentionalDisconnect = true;
    this.sendMessage({
      type: "leave-room",
    });
  }

  // ============ RECEIVE MESSAGES ============

  private handleServerMessage(message: ServerMessage) {
    console.log("[GameClient] Received message:", message.type);

    if (message.type === "game-state-update") {
      const hasVersionMetadata =
        typeof message.roomInstanceId === "string" &&
        Number.isInteger(message.stateVersion);
      if (hasVersionMetadata) {
        if (
          this.roomInstanceId === message.roomInstanceId &&
          message.stateVersion < this.latestStateVersion
        ) {
          console.warn("[GameClient] Ignoring stale game state");
          return;
        }
        if (this.roomInstanceId !== message.roomInstanceId) {
          this.roomInstanceId = message.roomInstanceId;
          this.latestStateVersion = -1;
        }
        this.latestStateVersion = message.stateVersion;
      }
      console.log("[GameClient] Game state received");
      this.game = message.game;
      this.callbacks.onGameStateUpdate?.(message.game);
    }

    if (message.type === "room-joined") {
      this.playerIndex = message.playerIndex;
      this.callbacks.onSeatAssigned?.(message.playerIndex);
      if (
        typeof message.playerId === "string" &&
        typeof message.resumeToken === "string" &&
        typeof message.roomInstanceId === "string" &&
        Number.isInteger(message.stateVersion)
      ) {
        this.roomInstanceId = message.roomInstanceId;
        this.latestStateVersion = message.stateVersion;
        this.callbacks.onSessionAssigned?.({
          roomId: message.roomId,
          playerIndex: message.playerIndex,
          playerId: message.playerId,
          resumeToken: message.resumeToken,
          roomInstanceId: message.roomInstanceId,
        });
      }
    }

    if (message.type === "room-list-update") {
      this.callbacks.onRoomListUpdate?.(message.rooms);
    }

    if (message.type === "lobby-chat-message") {
      return;
    }

    if (message.type === "action-rejected") {
      console.warn("Server rejected action:", message.reason);
      this.callbacks.onActionRejected?.(message.reason);
      if (message.reason === "Room not found") {
        this.sendMessage({
          type: "join-room",
          roomId: this.roomId,
          playerIndex: this.playerIndex,
          playerName: this.playerName,
        });
      }
      if (
        message.reason.includes("Seat") ||
        message.reason.includes("Not joined") ||
        message.reason.includes("ownership mismatch") ||
        message.reason.includes("Invalid seat index")
      ) {
        return;
      }
      // Request fresh state to sync
      this.requestState();
    }

    if (message.type === "player-disconnected") {
      console.log(`Player ${message.playerIndex} disconnected`);
      if (message.aiTakeover) {
        this.callbacks.onPlayerTakenOver?.(message.playerIndex);
      }
    }

    if (message.type === "system") {
      console.log("Server:", message.message);
      this.callbacks.onSystemMessage?.(message.message);
    }
  }

  // ============ GAME STATE ACCESS ============

  getGame(): Game | null {
    return this.game;
  }

  isConnectedToServer(): boolean {
    return this.isConnected;
  }

  getPlayerIndex(): number {
    return this.playerIndex;
  }

  // ============ LOCAL VALIDATION FOR UI ============
  // These don't execute moves, just validate for UI feedback

  canPlayerDiscard(): boolean {
    if (!this.game) return false;
    return this.game.phase === "discard" && this.game.turn === this.playerIndex;
  }

  canPlayerClaim(): boolean {
    if (!this.game) return false;
    return this.game.phase === "claim" && this.game.pendingClaim !== undefined;
  }

  getClaimOptions() {
    if (!this.game || !this.game.pendingClaim) {
      return {
        canChi: [],
        canPong: false,
        canKong: false,
        canHu: false,
      };
    }

    const hand = this.game.players[this.playerIndex].hand;
    const discard = this.game.pendingClaim.tile;

    return {
      canChi: this.game.pendingClaim.canChi
        ? possibleChiOptions(hand, discard)
        : [],
      canPong: this.game.pendingClaim.canPong,
      canKong: this.game.pendingClaim.canKong,
      canHu: this.game.pendingClaim.canHu,
    };
  }

  // ============ PLAYER ACTIONS ============

  discard(tileId: string) {
    if (!this.canPlayerDiscard()) {
      console.warn("Cannot discard: not your turn or wrong phase");
      return;
    }

    this.sendAction({
      type: "discard",
      tileId,
    });
  }

  claim(type: "chi" | "pong" | "kong", tiles?: any) {
    if (!this.canPlayerClaim()) {
      console.warn("Cannot claim: not in claim phase");
      return;
    }

    this.sendAction({
      type: "claim",
      claimType: type,
      tiles,
    });
  }

  hu(winBy: "discard" | "self-draw") {
    if (!this.game) {
      console.warn("Cannot win: no game state");
      return;
    }

    const canHuByDiscard =
      winBy === "discard" &&
      this.game.phase === "claim" &&
      this.game.pendingClaim?.claimer === this.playerIndex &&
      this.game.pendingClaim.canHu;
    const canHuBySelfDraw =
      winBy === "self-draw" &&
      this.game.phase === "discard" &&
      this.game.turn === this.playerIndex;

    if (!canHuByDiscard && !canHuBySelfDraw) {
      console.warn("Cannot win: not in a winning state");
      return;
    }

    this.sendAction({
      type: "hu",
      winBy,
    });
  }

  pass() {
    if (!this.canPlayerClaim()) {
      console.warn("Cannot pass: not in claim phase");
      return;
    }

    this.sendAction({
      type: "pass",
    });
  }

  newHand(dealer?: number, resetGame = false) {
    this.sendAction({
      type: "new-hand",
      dealer,
      resetGame,
    });
  }

  readyNextHand() {
    this.sendAction({ type: "ready-next-hand" });
  }

  kong(code: string, concealed: boolean) {
    this.sendAction({ type: "kong", code, concealed });
  }

  declareReady(tileId: string) {
    this.sendAction({ type: "declare-ready", tileId });
  }

  updatePlayerName(playerIndex: number, name: string) {
    if (playerIndex === this.playerIndex) this.playerName = name;
    this.sendAction({ type: "update-player-name", playerIndex, name });
  }

  updateDifficulty(playerIndex: number, difficulty: Difficulty) {
    this.sendAction({ type: "update-difficulty", playerIndex, difficulty });
  }

  updateTableRules(rules: Rules, houseRules: HouseRule[]) {
    this.sendAction({ type: "update-table-rules", rules, houseRules });
  }
}
