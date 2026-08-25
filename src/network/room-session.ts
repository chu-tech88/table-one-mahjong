import { RoomSession } from "./messages";

const ROOM_SESSION_PREFIX = "table-one-mahjong-room-session-v1:";
const ROOM_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type StoredRoomSession = RoomSession & { savedAt: number };

function storageKey(roomId: string) {
  return `${ROOM_SESSION_PREFIX}${encodeURIComponent(
    roomId.trim().toLowerCase(),
  )}`;
}

function removeStoredRoomSession(roomId: string) {
  try {
    window.localStorage.removeItem(storageKey(roomId));
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

export function loadRoomSession(roomId: string): RoomSession | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(storageKey(roomId));
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as Partial<StoredRoomSession>;
    if (
      stored.roomId !== roomId ||
      !Number.isInteger(stored.playerIndex) ||
      Number(stored.playerIndex) < 0 ||
      Number(stored.playerIndex) > 3 ||
      !stored.playerId ||
      !stored.resumeToken ||
      !stored.roomInstanceId ||
      !stored.savedAt ||
      Date.now() - stored.savedAt > ROOM_SESSION_MAX_AGE_MS
    ) {
      removeStoredRoomSession(roomId);
      return undefined;
    }
    return {
      roomId: stored.roomId,
      playerIndex: stored.playerIndex,
      playerId: stored.playerId,
      resumeToken: stored.resumeToken,
      roomInstanceId: stored.roomInstanceId,
    } as RoomSession;
  } catch {
    removeStoredRoomSession(roomId);
    return undefined;
  }
}

export function saveRoomSession(session: RoomSession) {
  if (typeof window === "undefined") return;
  try {
    const stored: StoredRoomSession = { ...session, savedAt: Date.now() };
    window.localStorage.setItem(
      storageKey(session.roomId),
      JSON.stringify(stored),
    );
  } catch {
    // The active connection remains usable when browser storage is unavailable.
  }
}

export function clearRoomSession(roomId: string) {
  if (typeof window === "undefined") return;
  removeStoredRoomSession(roomId);
}
