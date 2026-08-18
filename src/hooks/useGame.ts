import { Game, HouseRule, Rules } from "../game-logic/types";
import { useLocalGame } from "./useLocalGame";
import { useNetworkedGame } from "./useNetworkedGame";

type UseGameOptions =
  | {
      mode: "local";
      initialGame?: Game;
      initialRules?: Rules;
      initialHouseRules?: HouseRule[];
      pauseLocalAI?: boolean;
    }
  | {
      mode: "networked";
      serverUrl: string;
      roomId: string;
      playerIndex?: number;
      playerName: string;
      enabled?: boolean;
      initialGame?: Game;
      initialRules?: Rules;
      initialHouseRules?: HouseRule[];
      pauseLocalAI?: boolean;
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
  const localGame = useLocalGame({
    initialGame: options.initialGame,
    initialRules: options.initialRules,
    initialHouseRules: options.initialHouseRules,
    pauseAI: options.pauseLocalAI,
  });

  const networkedGame = useNetworkedGame(
    options.mode === "networked" ? options.serverUrl : "ws://localhost:8080",
    options.mode === "networked" ? options.roomId : "local-room",
    options.mode === "networked" ? options.playerIndex : 0,
    options.mode === "networked" ? options.playerName : "Player",
    options.mode === "networked" ? (options.enabled ?? true) : false,
  );

  return options.mode === "networked" ? networkedGame : localGame;
}
