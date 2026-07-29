import { HouseRule, Rules, StandardRuleKey } from "./types";

export const DEFAULT_RULES: Rules = { baseWin: 5 };

const STANDARD_SCORING_RULE_DEFINITIONS: Array<{
  detector: StandardRuleKey;
  name: string;
  description: string;
  points: number;
  category: "Everyday" | "Hand patterns" | "Limit hands";
}> = [
  { detector: "matching-flower", name: "Matching seat flower", description: "Each flower or season matching the winner's seat", points: 1, category: "Everyday" },
  { detector: "dragon-pung", name: "Dragon Pong or Kong", description: "Each completed Red, Green, or White Dragon set", points: 1, category: "Everyday" },
  { detector: "seat-wind", name: "Seat Wind Pong or Kong", description: "A set matching the winner's seat wind", points: 1, category: "Everyday" },
  { detector: "round-wind", name: "Round Wind Pong or Kong", description: "A set matching the prevailing wind", points: 1, category: "Everyday" },
  { detector: "self-draw", name: "Self draw", description: "Win using a tile drawn from the wall", points: 1, category: "Everyday" },
  { detector: "dealer", name: "Dealer", description: "The dealer wins the hand", points: 1, category: "Everyday" },
  { detector: "concealed-hand", name: "Concealed hand", description: "Win by discard without an exposed Chi, Pong, or Kong", points: 1, category: "Everyday" },
  { detector: "last-tile", name: "Last tile", description: "Win on the final playable wall tile", points: 1, category: "Everyday" },
  { detector: "win-after-kong", name: "Win after Kong", description: "Win on the replacement draw after declaring Kong", points: 1, category: "Everyday" },
  { detector: "all-chows", name: "All Chows", description: "Five sequences with a numbered pair and no flowers or honors", points: 2, category: "Hand patterns" },
  { detector: "three-concealed-pungs", name: "Three concealed Pungs", description: "Three concealed Pongs or Kongs", points: 2, category: "Hand patterns" },
  { detector: "concealed-self-draw", name: "Concealed self draw", description: "Self draw with no exposed Chi, Pong, or Kong", points: 3, category: "Hand patterns" },
  { detector: "all-pungs", name: "All Pungs", description: "Five Pongs or Kongs and one pair", points: 4, category: "Hand patterns" },
  { detector: "little-three-dragons", name: "Little Three Dragons", description: "Two Dragon sets and a pair of the third Dragon", points: 4, category: "Hand patterns" },
  { detector: "half-flush", name: "Half Flush", description: "One numbered suit together with honor tiles", points: 4, category: "Hand patterns" },
  { detector: "four-concealed-pungs", name: "Four concealed Pungs", description: "Four concealed Pongs or Kongs", points: 5, category: "Hand patterns" },
  { detector: "big-three-dragons", name: "Big Three Dragons", description: "Pongs or Kongs of all three Dragons", points: 8, category: "Limit hands" },
  { detector: "full-flush", name: "Full Flush", description: "Only one numbered suit, with no honors", points: 8, category: "Limit hands" },
  { detector: "all-honors", name: "All Honors", description: "The entire winning hand uses only Winds and Dragons", points: 8, category: "Limit hands" },
  { detector: "five-concealed-pungs", name: "Five concealed Pungs", description: "Five concealed Pongs or Kongs", points: 8, category: "Limit hands" },
  { detector: "little-four-winds", name: "Little Four Winds", description: "Three Wind sets and a pair of the fourth Wind", points: 8, category: "Limit hands" },
  { detector: "seven-flowers", name: "Seven Flowers", description: "Win while holding seven bonus flowers", points: 8, category: "Limit hands" },
  { detector: "all-flowers", name: "All Flowers", description: "Win while holding all eight bonus flowers", points: 8, category: "Limit hands" },
  { detector: "big-four-winds", name: "Big Four Winds", description: "Pongs or Kongs of all four Winds", points: 16, category: "Limit hands" },
];

export function createDefaultHouseRules(): HouseRule[] {
  return STANDARD_SCORING_RULE_DEFINITIONS.map((rule) => ({
    ...rule,
    id: `standard-${rule.detector}`,
    enabled: true,
  }));
}
