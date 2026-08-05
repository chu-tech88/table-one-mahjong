import { Game, HouseRule, Rules } from "../game-logic/types";
import { useLocalGame } from "./useLocalGame";
import { useNetworkedGame } from "./useNetworkedGame";

type UseGameOptions =
  | {
      mode: "local";
      initialGame?: Game;
      initialRules?: Rules;
      initialHouseRules?: HouseRule[];
    }
  | {
      mode: "networked";
      serverUrl: string;
      roomId: string;
      playerIndex: number;
      playerName: string;
      enabled?: boolean;
      initialGame?: Game;
      initialRules?: Rules;
      initialHouseRules?: HouseRule[];
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
      options.playerName,
      options.enabled ?? true,
    );
  }
  return useLocalGame({
    initialGame: options.initialGame,
    initialRules: options.initialRules,
    initialHouseRules: options.initialHouseRules,
  });
}
