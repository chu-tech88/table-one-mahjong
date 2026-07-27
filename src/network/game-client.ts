import { Game, HouseRule, Rules } from "../game-logic/types";
import { possibleChiOptions } from "../game-logic/validation";
import { ClientMessage, ServerMessage, PlayerAction } from "./messages";

/**
 * Client-side WebSocket connector for multiplayer games.
 * Handles:
 * - Connection to server
 * - Sending player actions
 * - Receiving game state updates
 * - Local validation for UI feedback
 */

export type GameClientCallbacks = {
  onGameStateUpdate?: (game: Game) => void;
  onActionRejected?: (reason: string) => void;
  onDisconnected?: () => void;
};

export class GameClient {
  private ws: WebSocket | null = null;
  private roomId: string = "";
  private playerIndex: number = -1;
  private game: Game | null = null;
  private callbacks: GameClientCallbacks;
  private isConnected = false;

  constructor(callbacks?: GameClientCallbacks) {
    this.callbacks = callbacks || {};
  }

  // ============ CONNECTION ============

  connect(
    serverUrl: string,
    roomId: string,
    playerIndex: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.ws && this.isConnected) {
          console.log("[GameClient] Already connected");
          resolve();
          return;
        }

        this.roomId = roomId;
        this.playerIndex = playerIndex;

        console.log(`[GameClient] Connecting to ${serverUrl}`);

        // Create WebSocket connection
        this.ws = new WebSocket(serverUrl);

        const onOpenTimeout = setTimeout(() => {
          console.error("[GameClient] Connection timeout");
          reject(new Error("Connection timeout"));
        }, 5000);

        this.ws.onopen = () => {
          clearTimeout(onOpenTimeout);
          console.log(`[GameClient] Connected to server at ${serverUrl}`);
          this.isConnected = true;

          // Join room
          this.sendMessage({
            type: "join-room",
            roomId,
            playerIndex,
          });

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            if (typeof event.data !== "string") {
              console.warn("[GameClient] Ignoring non-text websocket message");
              return;
            }
            const msg = JSON.parse(event.data) as ServerMessage;
            this.handleServerMessage(msg);
          } catch (error) {
            console.error("[GameClient] Failed to parse message:", error);
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(onOpenTimeout);
          console.error("WebSocket error:", error);
          this.isConnected = false;
          reject(error);
        };

        this.ws.onclose = () => {
          clearTimeout(onOpenTimeout);
          console.log("Disconnected from server");
          this.isConnected = false;
          this.callbacks.onDisconnected?.();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.ws) {
      console.log("[GameClient] Disconnecting");
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
      action,
    });
  }

  requestState() {
    this.sendMessage({
      type: "request-state",
    });
  }

  // ============ RECEIVE MESSAGES ============

  private handleServerMessage(message: ServerMessage) {
    console.log("[GameClient] Received message:", message.type);

    if (message.type === "game-state-update") {
      console.log("[GameClient] Game state received");
      this.game = message.game;
      this.callbacks.onGameStateUpdate?.(message.game);
    }

    if (message.type === "action-rejected") {
      console.warn("Server rejected action:", message.reason);
      this.callbacks.onActionRejected?.(message.reason);
      if (message.reason === "Room not found") {
        this.sendMessage({
          type: "join-room",
          roomId: this.roomId,
          playerIndex: this.playerIndex,
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
    }

    if (message.type === "system") {
      console.log("Server:", message.message);
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
}
