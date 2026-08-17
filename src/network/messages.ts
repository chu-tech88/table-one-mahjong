import { Difficulty, Game, HouseRule, Rules } from "../game-logic/types";

/**
 * Messages between client and server
 * Client → Server: join-room, player-action, request-state, request-room-seats
 * Server → Clients: game-state-update, room-seats-update, action-rejected, player-disconnected
 */

// ============ CLIENT → SERVER ============

export type ClientMessage =
  | JoinRoomMessage
  | LeaveRoomMessage
  | PlayerActionMessage
  | RequestStateMessage
  | RequestRoomSeatsMessage
  | RequestRoomListMessage
  | LobbyChatMessage
  | JoinLobbyChatMessage;

export type JoinRoomMessage = {
  type: "join-room";
  roomId: string;
  playerIndex?: number;
  playerName: string;
};

export type LeaveRoomMessage = {
  type: "leave-room";
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
  | { type: "hu"; winBy: "discard" | "self-draw" }
  | { type: "kong"; code: string; concealed: boolean }
  | { type: "declare-ready"; tileId: string }
  | { type: "update-player-name"; playerIndex: number; name: string }
  | { type: "update-difficulty"; playerIndex: number; difficulty: Difficulty }
  | { type: "update-table-rules"; rules: Rules; houseRules: HouseRule[] }
  | { type: "ready-next-hand" }
  | { type: "new-hand"; dealer?: number; resetGame?: boolean };

export type RequestStateMessage = {
  type: "request-state";
};

export type RequestRoomSeatsMessage = {
  type: "request-room-seats";
  roomId: string;
};

export type RequestRoomListMessage = {
  type: "request-room-list";
};

export type LobbyChatMessage = {
  type: "lobby-chat";
  roomId: string;
  playerIndex: number;
  playerName: string;
  text: string;
};

export type JoinLobbyChatMessage = {
  type: "join-lobby-chat";
  roomId: string;
  playerIndex: number;
  playerName: string;
};

// ============ SERVER → CLIENT ============

export type ServerMessage =
  | RoomJoinedMessage
  | GameStateUpdateMessage
  | RoomSeatsUpdateMessage
  | RoomListUpdateMessage
  | ActionRejectedMessage
  | PlayerDisconnectedMessage
  | SystemMessage
  | LobbyChatMessageBroadcast;

export type GameStateUpdateMessage = {
  type: "game-state-update";
  game: Game;
};

export type RoomJoinedMessage = {
  type: "room-joined";
  roomId: string;
  playerIndex: number;
};

export type RoomSeatsUpdateMessage = {
  type: "room-seats-update";
  roomId: string;
  occupiedSeats: number[];
};

export type RoomListEntry = {
  roomId: string;
  occupiedSeats: number[];
  playerCount: number;
  isFull: boolean;
};

export type RoomListUpdateMessage = {
  type: "room-list-update";
  rooms: RoomListEntry[];
};

export type ActionRejectedMessage = {
  type: "action-rejected";
  reason: string;
};

export type PlayerDisconnectedMessage = {
  type: "player-disconnected";
  playerIndex: number;
  aiTakeover: boolean;
};

export type SystemMessage = {
  type: "system";
  message: string;
};

export type LobbyChatMessageBroadcast = {
  type: "lobby-chat-message";
  message: {
    id: string;
    playerIndex: number;
    playerName: string;
    text: string;
    createdAt: number;
  };
};
