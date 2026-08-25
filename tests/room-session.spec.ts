// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRoomSession,
  loadRoomSession,
  saveRoomSession,
} from "../src/network/room-session";

describe("room resume session storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("stores, restores, and explicitly clears private resume credentials", () => {
    const session = {
      roomId: "family-table",
      playerIndex: 2,
      playerId: "player-2",
      resumeToken: "private-token",
      roomInstanceId: "instance-1",
    };

    saveRoomSession(session);
    expect(loadRoomSession("family-table")).toEqual(session);

    clearRoomSession("family-table");
    expect(loadRoomSession("family-table")).toBeUndefined();
  });
});
