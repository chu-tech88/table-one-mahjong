import { Game, HouseRule, Rules } from "./types";
import { structuredCloneGame } from "./helpers";

export type ScenarioSnapshot = {
  version: 1;
  id: string;
  label: string;
  createdAt: number;
  game: Game;
  rules: Rules;
  houseRules: HouseRule[];
  metadata: {
    mode: "local" | "networked";
    roomId?: string;
    playerIndex?: number;
    playerName?: string;
    notes?: string;
  };
};

const SNAPSHOT_STORAGE_KEY = "table-one-scenario-snapshots";

function createId() {
  return `scenario-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function resolveStorage(storage?: Storage) {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
    return globalThis.localStorage as Storage;
  }
  return undefined;
}

export function createScenarioSnapshot(
  game: Game,
  rules: Rules,
  houseRules: HouseRule[],
  label: string,
  metadata: Partial<ScenarioSnapshot["metadata"]> = {},
): ScenarioSnapshot {
  return {
    version: 1,
    id: createId(),
    label,
    createdAt: Date.now(),
    game: structuredCloneGame(game),
    rules: { ...rules },
    houseRules: houseRules.map((rule) => ({ ...rule })),
    metadata: {
      mode: "local",
      ...metadata,
    },
  };
}

export function saveScenarioSnapshot(
  snapshot: ScenarioSnapshot,
  storage?: Storage,
): ScenarioSnapshot {
  const resolved = resolveStorage(storage);
  if (!resolved) return snapshot;
  const snapshots = loadScenarioSnapshots(resolved);
  const nextSnapshots = [snapshot, ...snapshots.filter((item) => item.id !== snapshot.id)];
  resolved.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(nextSnapshots));
  return snapshot;
}

export function loadScenarioSnapshots(storage?: Storage): ScenarioSnapshot[] {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  const raw = resolved.getItem(SNAPSHOT_STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as ScenarioSnapshot[];
}

export function getLatestScenarioSnapshot(storage?: Storage): ScenarioSnapshot | undefined {
  const snapshots = loadScenarioSnapshots(storage);
  return snapshots[0];
}

export function restoreScenarioSnapshot(snapshot: ScenarioSnapshot): ScenarioSnapshot {
  return {
    version: 1,
    id: snapshot.id || createId(),
    label: snapshot.label || "Imported scenario",
    createdAt: snapshot.createdAt || Date.now(),
    game: structuredCloneGame(snapshot.game),
    rules: { ...snapshot.rules },
    houseRules: snapshot.houseRules.map((rule) => ({ ...rule })),
    metadata: { ...snapshot.metadata, mode: snapshot.metadata.mode ?? "local" },
  };
}

export function clearScenarioSnapshots(storage?: Storage) {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  resolved.removeItem(SNAPSHOT_STORAGE_KEY);
}
