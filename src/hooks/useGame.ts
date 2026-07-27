import { useLocalGame } from "./useLocalGame";
import { useNetworkedGame } from "./useNetworkedGame";

type UseGameOptions =
  | { mode: "local" }
  | {
      mode: "networked";
      serverUrl: string;
      roomId: string;
      playerIndex: number;
      enabled?: boolean;
    };

/**
 * Abstract game hook that picks the right implementation.
 *
 * Usage:
 *   const game = useGame({ mode: "local" });
 *   // or
 *   const game = useGame({
 *     mode: "networked",
 *     serverUrl: "ws://localhost:8080",
 *     roomId: "abc123",
 *     playerIndex: 0
 *   });
 *
 * Rest of code doesn't need to know which mode is active.
 */
export function useGame(options: UseGameOptions) {
  if (options.mode === "networked") {
    return useNetworkedGame(
      options.serverUrl,
      options.roomId,
      options.playerIndex,
      options.enabled ?? true,
    );
  }
  return useLocalGame();
}
