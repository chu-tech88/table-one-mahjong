import { describe, expect, it } from "vitest";
import { dealRound } from "../src/game-logic/deck";
import {
  DEFAULT_RULES,
  createDefaultHouseRules,
} from "../src/game-logic/rules";
import {
  createScenarioSnapshot,
  getLatestScenarioSnapshot,
  loadScenarioSnapshots,
  saveScenarioSnapshot,
} from "../src/game-logic/snapshot";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  } as Storage;
}

describe("scenario snapshots", () => {
  it("stores and loads structured snapshot JSON", () => {
    const storage = createMemoryStorage();
    const game = dealRound();
    const snapshot = createScenarioSnapshot(
      game,
      DEFAULT_RULES,
      createDefaultHouseRules(),
      "Regression capture",
    );

    saveScenarioSnapshot(snapshot, storage);

    const allSnapshots = loadScenarioSnapshots(storage);
    expect(allSnapshots).toHaveLength(1);
    expect(allSnapshots[0].label).toBe("Regression capture");
    expect(allSnapshots[0].game.tableId).toBe(game.tableId);
    expect(getLatestScenarioSnapshot(storage)?.version).toBe(1);
  });
});
