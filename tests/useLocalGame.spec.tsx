// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dealRound } from "../src/game-logic/deck";
import { structuredCloneGame } from "../src/game-logic/helpers";
import { useLocalGame } from "../src/hooks/useLocalGame";

describe("useLocalGame", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("replaces the active game when a new snapshot is provided", async () => {
    const initialGame = dealRound();
    const updatedGame = structuredCloneGame(initialGame);
    updatedGame.message = "Imported snapshot";
    updatedGame.actionSeq = 99;

    const { result, rerender } = renderHook(
      ({ initialGame }) => useLocalGame({ initialGame }),
      { initialProps: { initialGame } },
    );

    rerender({ initialGame: updatedGame });

    await waitFor(() => {
      expect(result.current.game.message).toBe("Imported snapshot");
      expect(result.current.game.actionSeq).toBe(99);
    });
  });

  it("pauses and resumes AI turns for an open solo lesson", async () => {
    vi.useFakeTimers();
    const initialGame = dealRound();
    initialGame.turn = 1;
    initialGame.phase = "discard";
    const initialActionSeq = initialGame.actionSeq;

    const { result, rerender } = renderHook(
      ({ pauseAI }) => useLocalGame({ initialGame, pauseAI }),
      { initialProps: { pauseAI: true } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(result.current.game.actionSeq).toBe(initialActionSeq);

    rerender({ pauseAI: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(result.current.game.actionSeq).toBeGreaterThan(initialActionSeq);
  });

  it("starts a reset session with every AI set to Balanced", () => {
    const initialGame = dealRound();
    initialGame.players[1].difficulty = "calm";
    initialGame.players[2].difficulty = "sharp";

    const { result } = renderHook(() => useLocalGame({ initialGame }));
    act(() => result.current.newHand(0, true));

    expect(
      result.current.game.players
        .filter((player) => player.controller === "ai")
        .every((player) => player.difficulty === "balanced"),
    ).toBe(true);
  });
});
