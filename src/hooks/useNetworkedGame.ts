import { useState, useCallback, useEffect, useRef } from "react";
import { Game, Rules, HouseRule, Difficulty } from "../game-logic/types";
import { GameClient } from "../network/game-client";

type UseNetworkedGameReturn = {
  game: Game | null;
  selectedTileId?: string;
  rules: Rules;
  houseRules: HouseRule[];
  setRules: (rules: Rules) => void;
  setHouseRules: (rules: HouseRule[]) => void;
  isConnected: boolean;
  roomId: string;
  playerIndex: number;
  error: string | null;
  selectTile: (tileId: string) => void;
  discard: (tileId: string) => void;
  claim: (type: "chi" | "pong" | "kong", tiles?: any) => void;
  pass: () => void;
  kong: (code: string, concealed: boolean) => void;
  addHouseRule: (name: string, description: string, points: number) => void;
  removeHouseRule: (id: string) => void;
  updateHouseRule: (id: string, points: number, enabled: boolean) => void;
  updatePlayerName: (playerIndex: number, name: string) => void;
  updateDifficulty: (playerIndex: number, difficulty: Difficulty) => void;
  newHand: (dealer?: number, resetGame?: boolean) => void;
};

/**
 * Hook for multiplayer networked games via WebSocket.
 *
 * Connects to server and:
 * - Sends player actions as events
 * - Receives game state updates from server
 * - Handles disconnection and sync
 *
 * Server handles:
 * - Game state authority
 * - Move validation
 * - Scoring calculation
 * - AI for other players
 */
export function useNetworkedGame(
  serverUrl: string,
  roomId: string,
  playerIndex: number,
  enabled = true,
): UseNetworkedGameReturn {
  const [game, setGame] = useState<Game | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | undefined>();
  const clientRef = useRef<GameClient | null>(null);

  const rules: Rules = { baseWin: 5 };
  const houseRules: HouseRule[] = [];

  // Connect to server
  useEffect(() => {
    if (!enabled) {
      setGame(null);
      setIsConnected(false);
      setError(null);
      setSelectedTileId(undefined);
      return;
    }

    const client = new GameClient({
      onGameStateUpdate: (newGame) => {
        setGame(newGame);
        setError(null);
        // Keep selection if the tile still exists and the player can still discard.
        setSelectedTileId((current) => {
          if (!current) return undefined;
          const isDiscardTurn =
            newGame.turn === playerIndex && newGame.phase === "discard";
          if (!isDiscardTurn) return undefined;
          const stillInHand = newGame.players[playerIndex].hand.some(
            (tile) => tile.id === current,
          );
          return stillInHand ? current : undefined;
        });
      },
      onActionRejected: (reason) => {
        setError(reason);
      },
      onDisconnected: () => {
        setIsConnected(false);
        setError("Disconnected from server");
      },
    });

    clientRef.current = client;
    let isMounted = true;

    client
      .connect(serverUrl, roomId, playerIndex)
      .then(() => {
        if (!isMounted) return;
        setIsConnected(true);
        setError(null);
        client.requestState();
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(`Failed to connect: ${err.message}`);
      });

    return () => {
      isMounted = false;
      client.disconnect();
    };
  }, [enabled, serverUrl, roomId, playerIndex]);

  const selectTile = useCallback(
    (tileId: string) => {
      if (!clientRef.current || !game) return;
      setSelectedTileId(tileId);
    },
    [game],
  );

  const discard = useCallback((tileId: string) => {
    if (!clientRef.current) return;
    clientRef.current.discard(tileId);
    setSelectedTileId(undefined);
  }, []);

  const claim = useCallback((type: "chi" | "pong" | "kong", tiles?: any) => {
    if (!clientRef.current) return;
    clientRef.current.claim(type, tiles);
  }, []);

  const pass = useCallback(() => {
    if (!clientRef.current) return;
    clientRef.current.pass();
  }, []);

  // Dummy implementations for settings (server doesn't support these yet)
  const setRules = useCallback(() => {}, []);
  const setHouseRules = useCallback(() => {}, []);
  const kong = useCallback(() => {}, []);
  const addHouseRule = useCallback(() => {}, []);
  const removeHouseRule = useCallback(() => {}, []);
  const updateHouseRule = useCallback(() => {}, []);
  const updatePlayerName = useCallback(() => {}, []);
  const updateDifficulty = useCallback(() => {}, []);
  const newHand = useCallback((dealer?: number, resetGame = false) => {
    if (!clientRef.current) return;
    clientRef.current.newHand(dealer, resetGame);
    setSelectedTileId(undefined);
  }, []);

  return {
    game,
    selectedTileId,
    rules,
    houseRules,
    setRules,
    setHouseRules,
    isConnected,
    roomId,
    playerIndex,
    error,
    selectTile,
    discard,
    claim,
    pass,
    kong,
    addHouseRule,
    removeHouseRule,
    updateHouseRule,
    updatePlayerName,
    updateDifficulty,
    newHand,
  };
}
