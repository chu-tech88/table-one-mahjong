import { Game } from "../game-logic/types";

/**
 * Messages between client and server
 * Client → Server: join-room, player-action, request-state, request-room-seats
 * Server → Clients: game-state-update, room-seats-update, action-rejected, player-disconnected
 */

// ============ CLIENT → SERVER ============

export type ClientMessage = JoinRoomMessage | PlayerActionMessage | RequestStateMessage | RequestRoomSeatsMessage;

export type JoinRoomMessage = {
  type: "join-room";
  roomId: string;
  playerIndex: number;
};

export type PlayerActionMessage = {
  type: "player-action";
  playerIndex: number;
  action: PlayerAction;
};

export type PlayerAction =
  | { type: "discard"; tileId: string }
  | { type: "claim"; claimType: "chi" | "pong" | "kong"; tiles?: any }
  | { type: "pass" }
  | { type: "new-hand"; dealer?: number; resetGame?: boolean };

export type RequestStateMessage = {
  type: "request-state";
};

export type RequestRoomSeatsMessage = {
  type: "request-room-seats";
  roomId: string;
};

// ============ SERVER → CLIENT ============

export type ServerMessage =
  | GameStateUpdateMessage
  | RoomSeatsUpdateMessage
  | ActionRejectedMessage
  | PlayerDisconnectedMessage
  | SystemMessage;

export type GameStateUpdateMessage = {
  type: "game-state-update";
  game: Game;
};

export type RoomSeatsUpdateMessage = {
  type: "room-seats-update";
  roomId: string;
  occupiedSeats: number[];
};

export type ActionRejectedMessage = {
  type: "action-rejected";
  reason: string;
};

export type PlayerDisconnectedMessage = {
  type: "player-disconnected";
  playerIndex: number;
};

export type SystemMessage = {
  type: "system";
  message: string;
};
