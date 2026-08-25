// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dealRound } from "../src/game-logic/deck";
import { GameClient } from "../src/network/game-client";

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((error: Event) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  open() {
    this.onopen?.();
  }

  receive(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>);
  }
}

describe("GameClient connection protocol", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  it("waits for room acknowledgement and sends resume credentials", async () => {
    const assigned = vi.fn();
    const sessionAssigned = vi.fn();
    const client = new GameClient({
      onSeatAssigned: assigned,
      onSessionAssigned: sessionAssigned,
    });
    let connected = false;
    const connection = client
      .connect("ws://test", "family", 2, "Eric", {
        playerId: "player-1",
        resumeToken: "resume-1",
      })
      .then(() => {
        connected = true;
      });
    const socket = FakeWebSocket.instances[0];

    socket.open();
    await Promise.resolve();
    expect(connected).toBe(false);
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: "join-room",
      roomId: "family",
      playerIndex: 2,
      playerId: "player-1",
      resumeToken: "resume-1",
    });

    socket.receive({
      type: "room-joined",
      roomId: "family",
      playerIndex: 2,
      playerId: "player-1",
      resumeToken: "resume-1",
      roomInstanceId: "room-instance-1",
      stateVersion: 4,
    });
    await connection;

    expect(connected).toBe(true);
    expect(assigned).toHaveBeenCalledWith(2);
    expect(sessionAssigned).toHaveBeenCalledWith({
      roomId: "family",
      playerIndex: 2,
      playerId: "player-1",
      resumeToken: "resume-1",
      roomInstanceId: "room-instance-1",
    });
  });

  it("ignores older state versions and gives every action an id", async () => {
    const stateUpdate = vi.fn();
    const client = new GameClient({ onGameStateUpdate: stateUpdate });
    const connection = client.connect("ws://test", "family", 0, "Eric");
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive({
      type: "room-joined",
      roomId: "family",
      playerIndex: 0,
      playerId: "player-1",
      resumeToken: "resume-1",
      roomInstanceId: "room-instance-1",
      stateVersion: 1,
    });
    await connection;

    const newerGame = dealRound();
    const olderGame = dealRound();
    socket.receive({
      type: "game-state-update",
      game: newerGame,
      roomInstanceId: "room-instance-1",
      stateVersion: 3,
    });
    socket.receive({
      type: "game-state-update",
      game: olderGame,
      roomInstanceId: "room-instance-1",
      stateVersion: 2,
    });
    expect(stateUpdate).toHaveBeenCalledTimes(1);
    expect(stateUpdate).toHaveBeenCalledWith(newerGame);

    client.sendAction({ type: "pass" });
    const actionMessage = JSON.parse(socket.sent.at(-1)!);
    expect(actionMessage.type).toBe("player-action");
    expect(actionMessage.actionId).toEqual(expect.any(String));
    expect(actionMessage.actionId.length).toBeGreaterThan(8);
  });
});
