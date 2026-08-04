import { useState, useEffect, useRef, useCallback } from "react";
import {
  Game,
  Rules,
  HouseRule,
  Difficulty,
} from "../game-logic/types";
import { createDefaultHouseRules, DEFAULT_RULES } from "../game-logic/rules";
import { dealRound } from "../game-logic/deck";
import {
  discardTile,
  applyClaim,
  applyKong,
  declareReadyAndDiscard,
  passClaim,
  HUMAN,
} from "../game-logic/flow";
import { scoreRound } from "../game-logic/scoring";
import { chooseDiscard } from "../game-logic/ai";
import { isWinningHand } from "../game-logic/validation";
import {
  nextDealerForRound,
  nextDealerStreak,
  nextRoundNumber,
} from "../game-logic/helpers";

type UseLocalGameReturn = {
  game: Game;
  selectedTileId?: string;
  rules: Rules;
  houseRules: HouseRule[];
  setRules: (rules: Rules) => void;
  setHouseRules: (rules: HouseRule[]) => void;
  selectTile: (tileId: string) => void;
  discard: (tileId: string) => void;
  claim: (type: "chi" | "pong" | "kong", tiles?: any) => void;
  pass: () => void;
  hu: (source: "discard" | "self-draw") => void;
  kong: (code: string, concealed: boolean) => void;
  declareReady: (tileId: string) => void;
  addHouseRule: (name: string, description: string, points: number) => void;
  removeHouseRule: (id: string) => void;
  updateHouseRule: (id: string, points: number, enabled: boolean) => void;
  updatePlayerName: (playerIndex: number, name: string) => void;
  updateDifficulty: (playerIndex: number, difficulty: Difficulty) => void;
  newHand: (dealer?: number, resetGame?: boolean) => void;
  readyNextHand: () => void;
  isConnected?: boolean;
  error?: string | null;
};

export function useLocalGame(): UseLocalGameReturn {
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [houseRules, setHouseRules] = useState<HouseRule[]>(createDefaultHouseRules);
  const [game, setGame] = useState<Game>(() =>
    dealRound(0, undefined, 1, undefined, "local-table-one", DEFAULT_RULES, createDefaultHouseRules()),
  );
  const timerRef = useRef<number | undefined>(undefined);

  // Auto-play AI turns
  useEffect(() => {
    window.clearTimeout(timerRef.current);
    if (
      game.phase !== "discard" ||
      game.turn === HUMAN ||
      game.winner !== undefined
    )
      return;
    timerRef.current = window.setTimeout(
      () => {
        setGame((current) => {
          if (current.phase !== "discard" || current.turn === HUMAN)
            return current;
          const player = current.players[current.turn];
          const tile = chooseDiscard(
            player.hand,
            player.difficulty,
            player.melds.length,
          );
          return discardTile(current, current.turn, tile.id, rules, houseRules);
        });
      },
      game.players[game.turn].difficulty === "sharp" ? 1250 : 1700,
    );
    return () => window.clearTimeout(timerRef.current);
  }, [game, rules, houseRules]);

  const selectTile = useCallback((tileId: string) => {
    setGame((current) => {
      if (current.phase !== "discard" || current.turn !== HUMAN) return current;
      return {
        ...current,
        selectedId: tileId,
        message: `Tap tile again quickly or press Discard.`,
      };
    });
  }, []);

  const discard = useCallback(
    (tileId: string) => {
      setGame((current) =>
        discardTile(current, HUMAN, tileId, rules, houseRules),
      );
    },
    [rules, houseRules],
  );

  const claim = useCallback(
    (type: "chi" | "pong" | "kong", tiles?: any) => {
      setGame((current) =>
        applyClaim(current, HUMAN, type, tiles, rules, houseRules),
      );
    },
    [rules, houseRules],
  );

  const pass = useCallback(() => {
    setGame((current) => {
      if (current.phase !== "claim" || !current.lastDiscard) return current;
      return passClaim(
        current,
        HUMAN,
        rules,
        houseRules,
      );
    });
  }, [rules, houseRules]);

  const hu = useCallback(
    (source: "discard" | "self-draw") => {
      setGame((current) => {
        if (source === "discard") {
          if (
            current.phase !== "claim" ||
            !current.pendingClaim?.canHu ||
            current.pendingClaim.claimer !== HUMAN
          ) {
            return current;
          }
        }

        if (
          source === "self-draw" &&
          (current.phase !== "discard" ||
            current.turn !== HUMAN ||
            !isWinningHand(current.players[HUMAN].hand, current.players[HUMAN].melds.length))
        ) {
          return current;
        }

        return scoreRound(current, HUMAN, source, rules, houseRules);
      });
    },
    [rules, houseRules],
  );

  const kong = useCallback(
    (code: string, concealed: boolean) => {
      setGame((current) =>
        applyKong(current, HUMAN, code, concealed, rules, houseRules),
      );
    },
    [rules, houseRules],
  );

  const declareReady = useCallback(
    (tileId: string) => {
      setGame((current) =>
        declareReadyAndDiscard(current, HUMAN, tileId, rules, houseRules),
      );
    },
    [rules, houseRules],
  );

  const addHouseRule = useCallback(
    (name: string, description: string, points: number) => {
      setHouseRules((current) => [
        ...current,
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
    [],
  );

  const removeHouseRule = useCallback((id: string) => {
    setHouseRules((current) => current.filter((rule) => rule.id !== id));
  }, []);

  const updateHouseRule = useCallback(
    (id: string, points: number, enabled: boolean) => {
      setHouseRules((current) =>
        current.map((rule) =>
          rule.id === id
            ? { ...rule, points: Math.max(0, points), enabled }
            : rule,
        ),
      );
    },
    [],
  );

  const updatePlayerName = useCallback((playerIndex: number, name: string) => {
    setGame((current) => {
      const next = { ...current, players: [...current.players] };
      next.players[playerIndex] = { ...next.players[playerIndex], name };
      return next;
    });
  }, []);

  const updateDifficulty = useCallback(
    (playerIndex: number, difficulty: Difficulty) => {
      setGame((current) => {
        const next = { ...current, players: [...current.players] };
        next.players[playerIndex] = {
          ...next.players[playerIndex],
          difficulty,
        };
        return next;
      });
    },
    [],
  );

  const newHand = useCallback((dealer?: number, resetGame = false) => {
    setGame((current) => {
      if (resetGame) {
        return dealRound(
          0,
          undefined,
          1,
          current.players,
          current.tableId,
          rules,
          houseRules,
          0,
        );
      }
      const nextDealer =
        dealer ?? nextDealerForRound(current);
      return dealRound(
        nextDealer,
        current.players.map((p) => p.score),
        nextRoundNumber(current),
        current.players,
        current.tableId,
        rules,
        houseRules,
        nextDealerStreak(current),
      );
    });
  }, [rules, houseRules]);

  const readyNextHand = useCallback(() => {
    newHand(undefined, false);
  }, [newHand]);

  return {
    game,
    selectedTileId: game.selectedId,
    rules,
    houseRules,
    setRules,
    setHouseRules,
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
    readyNextHand,
    isConnected: true,
    error: null,
  };
}
