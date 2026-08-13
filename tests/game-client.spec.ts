import { describe, expect, it, vi } from "vitest";
import { GameClient } from "../src/network/game-client";

describe("GameClient", () => {
  it("uses the score-preserving readiness action for the next hand", () => {
    const client = new GameClient();
    const sendAction = vi.spyOn(client, "sendAction").mockImplementation(() => {});

    client.readyNextHand();

    expect(sendAction).toHaveBeenCalledOnce();
    expect(sendAction).toHaveBeenCalledWith({ type: "ready-next-hand" });
  });
});
