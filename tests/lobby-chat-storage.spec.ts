// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLobbyChatHistory,
  getStoredLobbyMessages,
  saveLobbyMessages,
} from "../src/game-logic/lobbyChatStorage";

describe("lobby chat storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists and restores room-scoped chat history", () => {
    const roomId = "room-42";
    const messages = [
      {
        id: "msg-1",
        playerIndex: 0,
        playerName: "You",
        text: "Hello",
        createdAt: 1700000000000,
      },
    ];

    saveLobbyMessages(roomId, messages);

    expect(getStoredLobbyMessages(roomId)).toEqual(messages);
    expect(getStoredLobbyMessages("another-room")).toEqual([]);
    clearLobbyChatHistory(roomId);
    expect(getStoredLobbyMessages(roomId)).toEqual([]);
  });
});
