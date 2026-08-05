// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useGame } from "../src/hooks/useGame";

describe("useGame", () => {
  it("switches cleanly from local to networked mode", () => {
    const { result, rerender } = renderHook(
      ({ mode }: { mode: "local" | "networked" }) =>
        useGame({
          mode,
          serverUrl: "ws://localhost:8080",
          roomId: "test-room",
          playerIndex: 0,
          playerName: "Alice",
          enabled: false,
        }),
      {
        initialProps: { mode: "local" as const },
      },
    );

    expect(result.current.game).toBeDefined();

    rerender({ mode: "networked" as const });

    expect(result.current.game).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });
});
