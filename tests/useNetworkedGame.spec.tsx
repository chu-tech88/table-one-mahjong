// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMocks = vi.hoisted(() => ({
  readyNextHand: vi.fn(),
  requestState: vi.fn(),
}));

vi.mock("../src/network/game-client", () => ({
  GameClient: class {
    constructor(
      private callbacks: { onSeatAssigned?: (playerIndex: number) => void },
    ) {}

    connect() {
      this.callbacks.onSeatAssigned?.(0);
      return Promise.resolve();
    }

    disconnect() {}

    requestState() {
      clientMocks.requestState();
    }

    readyNextHand() {
      clientMocks.readyNextHand();
    }
  },
}));

import { useNetworkedGame } from "../src/hooks/useNetworkedGame";

describe("useNetworkedGame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses readiness instead of resetting scores between multiplayer hands", async () => {
    const { result, unmount } = renderHook(() =>
      useNetworkedGame(
        "ws://localhost:8080",
        "score-preservation",
        0,
        "Eric",
      ),
    );

    await waitFor(() => expect(result.current.isConnected).toBe(true));

    act(() => result.current.readyNextHand());

    expect(clientMocks.readyNextHand).toHaveBeenCalledOnce();
    unmount();
  });
});
