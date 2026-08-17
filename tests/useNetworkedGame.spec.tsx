// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMocks = vi.hoisted(() => ({
  readyNextHand: vi.fn(),
  requestState: vi.fn(),
}));

vi.mock("../src/network/game-client", () => ({
  GameClient: class {
    private callbacks: { onSeatAssigned?: (playerIndex: number) => void };

    constructor(callbacks: { onSeatAssigned?: (playerIndex: number) => void }) {
      this.callbacks = callbacks;
    }

    connect(_: string, __: string, preferredPlayerIndex?: number) {
      this.callbacks.onSeatAssigned?.(preferredPlayerIndex ?? 0);
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
      useNetworkedGame("ws://localhost:8080", "score-preservation", 0, "Eric"),
    );

    await waitFor(() => expect(result.current.isConnected).toBe(true));

    act(() => result.current.readyNextHand());

    expect(clientMocks.readyNextHand).toHaveBeenCalledOnce();
    unmount();
  });

  it("resets the local player index when the preferred seat changes for a new room", async () => {
    const { result, rerender, unmount } = renderHook(
      ({ preferredPlayerIndex }) =>
        useNetworkedGame(
          "ws://localhost:8080",
          "room-switch",
          preferredPlayerIndex,
          "Jordan",
        ),
      {
        initialProps: { preferredPlayerIndex: 0 },
      },
    );

    await waitFor(() => expect(result.current.playerIndex).toBe(0));

    rerender({ preferredPlayerIndex: 1 });

    await waitFor(() => expect(result.current.playerIndex).toBe(1));
    unmount();
  });
});
