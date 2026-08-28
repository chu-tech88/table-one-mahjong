import { describe, expect, it, vi } from "vitest";
import { GameClient } from "../src/network/game-client";

describe("GameClient", () => {
  it("uses the score-preserving readiness action for the next hand", () => {
    const client = new GameClient();
    const sendAction = vi
      .spyOn(client, "sendAction")
      .mockImplementation(() => {});

    client.readyNextHand();

    expect(sendAction).toHaveBeenCalledOnce();
    expect(sendAction).toHaveBeenCalledWith({ type: "ready-next-hand" });
  });

  it("requests a list of active rooms from the server", () => {
    const client = new GameClient();
    const sendMessage = vi
      .spyOn(client as any, "sendMessage")
      .mockImplementation(() => {});

    client.requestRoomList();

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith({ type: "request-room-list" });
  });

  it("sends hand reveals as an authoritative player action", () => {
    const client = new GameClient();
    const sendAction = vi
      .spyOn(client, "sendAction")
      .mockImplementation(() => {});

    client.revealHand();

    expect(sendAction).toHaveBeenCalledWith({ type: "reveal-hand" });
  });

  it("uses the active game connection for table chat", () => {
    const client = new GameClient();
    const sendMessage = vi
      .spyOn(client as any, "sendMessage")
      .mockImplementation(() => {});
    (client as any).roomId = "room-1";
    (client as any).playerIndex = 2;
    (client as any).playerName = "Mina";

    client.joinLobbyChat();
    client.sendLobbyChat(" hello ");

    expect(sendMessage).toHaveBeenNthCalledWith(1, {
      type: "join-lobby-chat",
      roomId: "room-1",
      playerIndex: 2,
      playerName: "Mina",
    });
    expect(sendMessage).toHaveBeenNthCalledWith(2, {
      type: "lobby-chat",
      roomId: "room-1",
      playerIndex: 2,
      playerName: "Mina",
      text: " hello ",
    });
  });
});
