export type StoredLobbyChatMessage = {
  id: string;
  playerIndex: number;
  playerName: string;
  text: string;
  createdAt: number;
};

const STORAGE_PREFIX = "table-one-lobby-chat";
const MAX_MESSAGES = 50;

function getStorageKey(roomId: string) {
  return `${STORAGE_PREFIX}:${roomId}`;
}

export function saveLobbyMessages(
  roomId: string,
  messages: StoredLobbyChatMessage[],
) {
  if (typeof window === "undefined") {
    return;
  }

  const key = getStorageKey(roomId);
  const trimmed = messages.slice(-MAX_MESSAGES);
  window.sessionStorage.setItem(key, JSON.stringify(trimmed));
}

export function getStoredLobbyMessages(roomId: string) {
  if (typeof window === "undefined") {
    return [] as StoredLobbyChatMessage[];
  }

  const key = getStorageKey(roomId);
  const raw = window.sessionStorage.getItem(key);
  if (!raw) {
    return [] as StoredLobbyChatMessage[];
  }

  try {
    const parsed = JSON.parse(raw) as StoredLobbyChatMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as StoredLobbyChatMessage[];
  }
}

export function clearLobbyChatHistory(roomId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(getStorageKey(roomId));
}
