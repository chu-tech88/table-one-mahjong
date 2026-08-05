// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { dealRound } from "../src/game-logic/deck";
import { structuredCloneGame } from "../src/game-logic/helpers";
import { useLocalGame } from "../src/hooks/useLocalGame";

describe("useLocalGame", () => {
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
});
