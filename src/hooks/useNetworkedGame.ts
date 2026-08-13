import { useState, useCallback, useEffect, useRef } from "react";
import { Game, Rules, HouseRule, Difficulty } from "../game-logic/types";
import { GameClient } from "../network/game-client";
import { createDefaultHouseRules, DEFAULT_RULES } from "../game-logic/rules";

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
  hu: (winBy: "discard" | "self-draw") => void;
  kong: (code: string, concealed: boolean) => void;
  declareReady: (tileId: string) => void;
  addHouseRule: (name: string, description: string, points: number) => void;
  removeHouseRule: (id: string) => void;
  updateHouseRule: (id: string, points: number, enabled: boolean) => void;
  updatePlayerName: (playerIndex: number, name: string) => void;
  updateDifficulty: (playerIndex: number, difficulty: Difficulty) => void;
  newHand: (dealer?: number, resetGame?: boolean) => void;
  leaveRoom: () => void;
  readyNextHand: () => void;
  aiTakeoverSeat?: number;
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
  preferredPlayerIndex: number | undefined,
  playerName: string,
  enabled = true,
): UseNetworkedGameReturn {
  const [game, setGame] = useState<Game | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | undefined>();
  const [playerIndex, setPlayerIndex] = useState(preferredPlayerIndex ?? -1);
  const [aiTakeoverSeat, setAiTakeoverSeat] = useState<number>();
  const playerIndexRef = useRef(preferredPlayerIndex ?? -1);
  const clientRef = useRef<GameClient | null>(null);

  const rules: Rules = game?.rules ?? DEFAULT_RULES;
  const houseRules: HouseRule[] = game?.houseRules ?? createDefaultHouseRules();

  // Connect to server
  useEffect(() => {
    if (!enabled) {
      setGame(null);
      setIsConnected(false);
      setError(null);
      setSelectedTileId(undefined);
      setPlayerIndex(preferredPlayerIndex ?? -1);
      playerIndexRef.current = preferredPlayerIndex ?? -1;
      return;
    }

    let isMounted = true;
    let reconnectTimer: number | undefined;
    let activeClient: GameClient | null = null;

    const scheduleReconnect = () => {
      if (!isMounted) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(connect, 1500);
    };

    const connect = () => {
      if (!isMounted) return;
      const client = new GameClient({
        onSeatAssigned: (assignedPlayerIndex) => {
          if (!isMounted || client !== activeClient) return;
          playerIndexRef.current = assignedPlayerIndex;
          setPlayerIndex(assignedPlayerIndex);
        },
        onGameStateUpdate: (newGame) => {
          if (!isMounted || client !== activeClient) return;
          setGame(newGame);
          setError(null);
          setSelectedTileId((current) => {
            if (!current) return undefined;
            const isDiscardTurn =
              newGame.turn === playerIndexRef.current && newGame.phase === "discard";
            if (!isDiscardTurn) return undefined;
            const stillInHand = newGame.players[playerIndexRef.current]?.hand.some(
              (tile) => tile.id === current,
            );
            return stillInHand ? current : undefined;
          });
        },
        onActionRejected: (reason) => {
          if (client === activeClient) setError(reason);
        },
        onDisconnected: () => {
          if (!isMounted || client !== activeClient) return;
          setIsConnected(false);
          setError("Reconnecting to your table...");
          scheduleReconnect();
        },
        onPlayerTakenOver: (takenOverPlayerIndex) => {
          if (!isMounted || client !== activeClient) return;
          setAiTakeoverSeat(takenOverPlayerIndex);
          window.setTimeout(() => {
            if (isMounted) setAiTakeoverSeat(undefined);
          }, 6000);
        },
      });

      activeClient = client;
      clientRef.current = client;
      client
        .connect(serverUrl, roomId, preferredPlayerIndex, playerName)
        .then(() => {
          if (!isMounted || client !== activeClient) return;
          setIsConnected(true);
          setError(null);
          client.requestState();
        })
        .catch(() => {
          if (!isMounted || client !== activeClient) return;
          setIsConnected(false);
          setError("Reconnecting to your table...");
          scheduleReconnect();
        });
    };

    connect();

    return () => {
      isMounted = false;
      window.clearTimeout(reconnectTimer);
      activeClient?.disconnect();
    };
  }, [enabled, serverUrl, roomId, preferredPlayerIndex, playerName]);

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

  const hu = useCallback((winBy: "discard" | "self-draw") => {
    if (!clientRef.current) return;
    clientRef.current.hu(winBy);
    setSelectedTileId(undefined);
  }, []);

  const setRules = useCallback(
    (nextRules: Rules) => {
      setGame((current) =>
        current ? { ...current, rules: { ...nextRules } } : current,
      );
      clientRef.current?.updateTableRules(nextRules, houseRules);
    },
    [houseRules],
  );
  const setHouseRules = useCallback(
    (nextRules: HouseRule[]) => {
      setGame((current) =>
        current
          ? {
              ...current,
              houseRules: nextRules.map((rule) => ({ ...rule })),
            }
          : current,
      );
      clientRef.current?.updateTableRules(rules, nextRules);
    },
    [rules],
  );
  const kong = useCallback((code: string, concealed: boolean) => {
    clientRef.current?.kong(code, concealed);
  }, []);
  const declareReady = useCallback((tileId: string) => {
    clientRef.current?.declareReady(tileId);
    setSelectedTileId(undefined);
  }, []);
  const addHouseRule = useCallback(
    (name: string, description: string, points: number) => {
      setHouseRules([
        ...houseRules,
        {
          id: `house-${Date.now()}`,
          name,
          description,
          points: Math.max(0, points),
          enabled: true,
          category: "Custom",
        },
      ]);
    },
    [houseRules, setHouseRules],
  );
  const removeHouseRule = useCallback(
    (id: string) => setHouseRules(houseRules.filter((rule) => rule.id !== id)),
    [houseRules, setHouseRules],
  );
  const updateHouseRule = useCallback(
    (id: string, points: number, enabled: boolean) =>
      setHouseRules(
        houseRules.map((rule) =>
          rule.id === id
            ? { ...rule, points: Math.max(0, points), enabled }
            : rule,
        ),
      ),
    [houseRules, setHouseRules],
  );
  const updatePlayerName = useCallback(
    (targetPlayerIndex: number, name: string) => {
      setGame((current) => {
        if (!current?.players[targetPlayerIndex]) return current;
        const players = [...current.players];
        players[targetPlayerIndex] = {
          ...players[targetPlayerIndex],
          name,
        };
        return { ...current, players };
      });
      clientRef.current?.updatePlayerName(targetPlayerIndex, name);
    },
    [],
  );
  const updateDifficulty = useCallback(
    (targetPlayerIndex: number, difficulty: Difficulty) => {
      setGame((current) => {
        if (!current?.players[targetPlayerIndex]) return current;
        const players = [...current.players];
        players[targetPlayerIndex] = {
          ...players[targetPlayerIndex],
          difficulty,
        };
        return { ...current, players };
      });
      clientRef.current?.updateDifficulty(targetPlayerIndex, difficulty);
    },
    [],
  );
  const newHand = useCallback((dealer?: number, resetGame = false) => {
    if (!clientRef.current) return;
    clientRef.current.newHand(dealer, resetGame);
    setSelectedTileId(undefined);
  }, []);
  const leaveRoom = useCallback(() => {
    clientRef.current?.leaveRoom();
  }, []);
  const readyNextHand = useCallback(() => {
    clientRef.current?.readyNextHand();
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
    hu,
    kong,
    declareReady,
    addHouseRule,
    removeHouseRule,
    updateHouseRule,
    updatePlayerName,
    updateDifficulty,
    newHand,
    leaveRoom,
    readyNextHand,
    aiTakeoverSeat,
  };
}
