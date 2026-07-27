import { useState, useEffect, useRef, useCallback } from "react";
import {
  Game,
  Rules,
  HouseRule,
  Difficulty,
  StandardRuleKey,
} from "../game-logic/types";
import { dealRound, drawNonFlower } from "../game-logic/deck";
import {
  discardTile,
  applyClaim,
  applyKong,
  startTurn,
  HUMAN,
} from "../game-logic/flow";
import { scoreRound } from "../game-logic/scoring";
import { chooseDiscard } from "../game-logic/ai";
import { isWinningHand, concealedKongOptions } from "../game-logic/validation";

const DEFAULT_RULES: Rules = {
  baseWin: 5,
};

const standardScoringRuleDefinitions: Array<{
  detector: StandardRuleKey;
  name: string;
  description: string;
  points: number;
  category: "Everyday" | "Hand patterns" | "Limit hands";
}> = [
  {
    detector: "matching-flower",
    name: "Matching seat flower",
    description: "Each flower or season matching the winner's seat",
    points: 1,
    category: "Everyday" as const,
  },
  {
    detector: "dragon-pung",
    name: "Dragon Pong or Kong",
    description: "Each completed Red, Green, or White Dragon set",
    points: 1,
    category: "Everyday" as const,
  },
  {
    detector: "seat-wind",
    name: "Seat Wind Pong or Kong",
    description: "A set matching the winner's seat wind",
    points: 1,
    category: "Everyday" as const,
  },
  {
    detector: "round-wind",
    name: "Round Wind Pong or Kong",
    description: "A set matching the prevailing wind",
    points: 1,
    category: "Everyday" as const,
  },
  {
    detector: "self-draw",
    name: "Self draw",
    description: "Win using a tile drawn from the wall",
    points: 1,
    category: "Everyday" as const,
  },
  {
    detector: "dealer",
    name: "Dealer",
    description: "The dealer wins the hand",
    points: 1,
    category: "Everyday" as const,
  },
  {
    detector: "concealed-hand",
    name: "Concealed hand",
    description: "Win by discard without an exposed Chi, Pong, or Kong",
    points: 1,
    category: "Everyday" as const,
  },
  {
    detector: "last-tile",
    name: "Last tile",
    description: "Win on the final playable wall tile",
    points: 1,
    category: "Everyday" as const,
  },
  {
    detector: "win-after-kong",
    name: "Win after Kong",
    description: "Win on the replacement draw after declaring Kong",
    points: 1,
    category: "Everyday" as const,
  },
  {
    detector: "all-chows",
    name: "All Chows",
    description: "Five sequences with a numbered pair and no flowers or honors",
    points: 2,
    category: "Hand patterns" as const,
  },
  {
    detector: "three-concealed-pungs",
    name: "Three concealed Pungs",
    description: "Three concealed Pongs or Kongs",
    points: 2,
    category: "Hand patterns" as const,
  },
  {
    detector: "concealed-self-draw",
    name: "Concealed self draw",
    description: "Self draw with no exposed Chi, Pong, or Kong",
    points: 3,
    category: "Hand patterns" as const,
  },
  {
    detector: "all-pungs",
    name: "All Pungs",
    description: "Five Pongs or Kongs and one pair",
    points: 4,
    category: "Hand patterns" as const,
  },
  {
    detector: "little-three-dragons",
    name: "Little Three Dragons",
    description: "Two Dragon sets and a pair of the third Dragon",
    points: 4,
    category: "Hand patterns" as const,
  },
  {
    detector: "half-flush",
    name: "Half Flush",
    description: "One numbered suit together with honor tiles",
    points: 4,
    category: "Hand patterns" as const,
  },
  {
    detector: "four-concealed-pungs",
    name: "Four concealed Pungs",
    description: "Four concealed Pongs or Kongs",
    points: 5,
    category: "Hand patterns" as const,
  },
  {
    detector: "big-three-dragons",
    name: "Big Three Dragons",
    description: "Pongs or Kongs of all three Dragons",
    points: 8,
    category: "Limit hands" as const,
  },
  {
    detector: "full-flush",
    name: "Full Flush",
    description: "Only one numbered suit, with no honors",
    points: 8,
    category: "Limit hands" as const,
  },
  {
    detector: "all-honors",
    name: "All Honors",
    description: "The entire winning hand uses only Winds and Dragons",
    points: 8,
    category: "Limit hands" as const,
  },
  {
    detector: "five-concealed-pungs",
    name: "Five concealed Pungs",
    description: "Five concealed Pongs or Kongs",
    points: 8,
    category: "Limit hands" as const,
  },
  {
    detector: "little-four-winds",
    name: "Little Four Winds",
    description: "Three Wind sets and a pair of the fourth Wind",
    points: 8,
    category: "Limit hands" as const,
  },
  {
    detector: "seven-flowers",
    name: "Seven Flowers",
    description: "Win while holding seven bonus flowers",
    points: 8,
    category: "Limit hands" as const,
  },
  {
    detector: "all-flowers",
    name: "All Flowers",
    description: "Win while holding all eight bonus flowers",
    points: 8,
    category: "Limit hands" as const,
  },
  {
    detector: "big-four-winds",
    name: "Big Four Winds",
    description: "Pongs or Kongs of all four Winds",
    points: 16,
    category: "Limit hands" as const,
  },
];

const standardScoringRules = standardScoringRuleDefinitions.map((rule) => ({
  ...rule,
  id: `standard-${rule.detector}`,
  enabled: true,
}));

const defaultHouseRules = standardScoringRules;

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
  addHouseRule: (name: string, description: string, points: number) => void;
  removeHouseRule: (id: string) => void;
  updateHouseRule: (id: string, points: number, enabled: boolean) => void;
  updatePlayerName: (playerIndex: number, name: string) => void;
  updateDifficulty: (playerIndex: number, difficulty: Difficulty) => void;
  newHand: (dealer?: number, resetGame?: boolean) => void;
  isConnected?: boolean;
  error?: string | null;
};

export function useLocalGame(): UseLocalGameReturn {
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [houseRules, setHouseRules] = useState<HouseRule[]>(defaultHouseRules);
  const [game, setGame] = useState<Game>(() => dealRound(0));
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
      return startTurn(
        current,
        (current.lastDiscard.by + 1) % 4,
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
        return dealRound(0, undefined, 1, current.players, current.tableId);
      }
      return dealRound(
        dealer ??
          (current.winner === current.dealer
            ? current.dealer
            : (current.dealer + 1) % 4),
        current.players.map((p) => p.score),
        dealer !== undefined && dealer !== current.dealer
          ? current.round + 1
          : current.round,
        current.players,
        current.tableId,
      );
    });
  }, []);

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
    addHouseRule,
    removeHouseRule,
    updateHouseRule,
    updatePlayerName,
    updateDifficulty,
    newHand,
    isConnected: true,
    error: null,
  };
}
