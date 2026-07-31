import { HouseRule, Rules, StandardRuleKey } from "./types";

export const DEFAULT_RULES: Rules = { baseWin: 4 };

type RuleDefinition = {
  detector: StandardRuleKey;
  name: string;
  description: string;
  points: number;
  category: "Everyday" | "Hand patterns" | "Limit hands";
};

const everyday = "Everyday" as const;
const patterns = "Hand patterns" as const;
const limits = "Limit hands" as const;

export const STANDARD_SCORING_RULE_DEFINITIONS: RuleDefinition[] = [
  { detector: "dealer", name: "Dealer", description: "Dealer wins; add one more for each consecutive dealer win", points: 1, category: everyday },
  { detector: "flower", name: "Flower", description: "Each flower collected", points: 1, category: everyday },
  { detector: "no-flowers", name: "No Flowers", description: "Win without any flowers", points: 1, category: everyday },
  { detector: "wind-or-dragon", name: "Wind and/or Dragon", description: "Each Wind or Dragon Pong or Gong", points: 1, category: everyday },
  { detector: "no-wind-or-dragon", name: "No Wind and/or Dragon", description: "No Wind or Dragon Pong, Gong, or pair", points: 1, category: everyday },
  { detector: "waiting-one-with-option", name: "Waiting on One with Option", description: "Win on one tile while another arrangement or wait was possible", points: 1, category: everyday },
  { detector: "self-draw", name: "Self Draw", description: "Win with a tile drawn from the wall", points: 1, category: everyday },
  { detector: "dual-wait", name: "Dual Wait", description: "Two different pairs were both winning waits", points: 1, category: everyday },
  { detector: "revealed-gong", name: "Revealed Gong", description: "Win with a revealed Gong in the hand", points: 1, category: everyday },
  { detector: "flower-replacement-win", name: "Flower Replacement Win", description: "Win on the replacement tile after drawing a flower", points: 1, category: everyday },
  { detector: "pair-win", name: "Pair Win", description: "The winning tile completes the pair", points: 1, category: everyday },
  { detector: "concealed-hand", name: "Concealed Hand", description: "Win without claiming a discarded tile for a Chi, Pong, or revealed Gong", points: 2, category: everyday },
  { detector: "pure-single-wait", name: "Pure Single Wait", description: "Only one tile can complete the hand", points: 2, category: everyday },
  { detector: "concealed-gong", name: "Concealed Gong", description: "Each concealed Gong", points: 2, category: everyday },
  { detector: "two-concealed-pongs", name: "Two Concealed Pong", description: "Two concealed Pongs or Gongs", points: 2, category: everyday },
  { detector: "pure-double-chi", name: "Pure Double Chi", description: "Two identical Chi in the same suit", points: 2, category: patterns },
  { detector: "big-small-chi", name: "Big & Small Chi", description: "A 1-2-3 and 7-8-9 Chi in the same suit", points: 2, category: patterns },
  { detector: "terminal-pongs", name: "Terminal Pong", description: "Pongs of 1 and 9 in the same suit", points: 2, category: patterns },
  { detector: "four-in-one", name: "Four in One", description: "All four copies of a tile appear across different sets without a Gong", points: 2, category: patterns },
  { detector: "missing-two-suits", name: "Missing Two Suits", description: "Only one numbered suit is used; honors are allowed", points: 2, category: patterns },
  { detector: "all-simple", name: "All Simple", description: "Only numbered tiles 2 through 8; no honors", points: 2, category: patterns },
  { detector: "small-chi", name: "Xiao Ping Hu (Small Chi)", description: "Five Chi; honors are allowed only as the pair", points: 3, category: patterns },
  { detector: "robbing-gong", name: "Robbing the Gong", description: "Win on a tile used to upgrade an exposed Pong to a Gong", points: 3, category: patterns },
  { detector: "last-tile-draw", name: "Last Tile Draw", description: "Self draw the final playable tile from the wall", points: 3, category: patterns },
  { detector: "gong-replacement-win", name: "Win on Gong Replacement", description: "Win on the replacement draw after declaring a Gong", points: 3, category: patterns },
  { detector: "two-four-in-ones", name: "Two Four-in-Ones", description: "Two separate Four in One patterns", points: 5, category: patterns },
  { detector: "two-gongs-two-concealed-triplets", name: "Two Gongs, Two Concealed Triplets", description: "Two Gongs and at least two concealed triplets", points: 1, category: patterns },
  { detector: "single-wait-last-tile", name: "Single Wait on Last Tile", description: "The only winning tile is the fourth and final copy", points: 5, category: patterns },
  { detector: "three-consecutive-pairs", name: "Three Consecutive Pairs / Chis Tail", description: "Two consecutive Pongs and the adjacent pair in one suit", points: 5, category: patterns },
  { detector: "five-families", name: "Five Families", description: "Uses Characters, Bamboo, Dots, Winds, and Dragons", points: 5, category: patterns },
  { detector: "three-sister-chi", name: "Three Sister Chi", description: "The same Chi sequence appears in all three numbered suits", points: 8, category: patterns },
  { detector: "three-concealed-triplets", name: "Three Concealed Triplets", description: "Three concealed Pongs or Gongs", points: 8, category: patterns },
  { detector: "mixed-terminals-honors", name: "Mixed Terminals & Honors", description: "Only 1, 9, Wind, and Dragon tiles", points: 8, category: patterns },
  { detector: "eight-exhausted-tiles", name: "8 Exhausted Tiles", description: "Two winning waits with only one unseen copy of each remaining", points: 8, category: patterns },
  { detector: "big-chi", name: "Da Ping Hu (Big Chi)", description: "Five Chi with a numbered pair and no honors", points: 10, category: patterns },
  { detector: "same-number-pongs", name: "Same Number Pong (3x)", description: "Pongs of the same rank in all three numbered suits", points: 10, category: patterns },
  { detector: "three-shifted-pongs", name: "Three Shifted Pongs", description: "Three sequential Pongs in one suit", points: 10, category: patterns },
  { detector: "pure-triple-chi", name: "Pure Triple Chi", description: "Three identical Chi in the same suit", points: 10, category: patterns },
  { detector: "little-win", name: "Little Win", description: "If the hand earns only one bonus point, award ten instead", points: 10, category: patterns },
  { detector: "one-long-dragon", name: "One Long Dragon", description: "Chi 1-2-3, 4-5-6, and 7-8-9 in one suit", points: 10, category: patterns },
  { detector: "little-three-winds", name: "Little Three Winds", description: "Two Wind Pongs and a pair of a third Wind", points: 10, category: patterns },
  { detector: "all-pongs", name: "Dui Dui (All Pongs)", description: "Five Pongs or Gongs and a pair", points: 15, category: patterns },
  { detector: "one-mixed-suit", name: "One Mixed Suit", description: "One numbered suit together with honors", points: 15, category: patterns },
  { detector: "pure-terminals", name: "Pure Terminals", description: "Only numbered 1 and 9 tiles; no honors", points: 15, category: patterns },
  { detector: "double-terminal-sequence", name: "Double Terminal Sequence", description: "Two 1-2-3 Chi and two 7-8-9 Chi", points: 15, category: patterns },
  { detector: "double-terminal-triplets", name: "Double Terminal Triplets", description: "Two 1 Pongs and two 9 Pongs", points: 15, category: patterns },
  { detector: "five-consecutive-pongs", name: "Five Consecutive Pongs", description: "Five sequential Pongs in one suit", points: 15, category: patterns },
  { detector: "three-gongs-three-triplets", name: "Three Gongs, Three Triplets", description: "Three Gongs among at least three triplet sets", points: 15, category: patterns },
  { detector: "big-three-winds", name: "Big Three Winds", description: "Pongs or Gongs of three Winds", points: 20, category: limits },
  { detector: "little-three-dragons", name: "Little Three Dragons", description: "Two Dragon Pongs and a pair of the third Dragon", points: 20, category: limits },
  { detector: "four-concealed-triplets", name: "Four Concealed Triplets", description: "Four concealed Pongs or Gongs", points: 20, category: limits },
  { detector: "four-shifted-triplets", name: "Four Shifted Triplets", description: "Four sequential Pongs in one suit", points: 20, category: limits },
  { detector: "declaration-win", name: "Declaration Win", description: "Declare a ready hand on the first turn, then win", points: 20, category: limits },
  { detector: "twin-dragons", name: "Twin Dragons", description: "Two different pairs of identical Chi", points: 20, category: limits },
  { detector: "little-four-winds", name: "Little Four Winds", description: "Three Wind Pongs and a pair of the fourth Wind", points: 30, category: limits },
  { detector: "big-three-dragons", name: "Big Three Dragons", description: "Pongs or Gongs of all three Dragons", points: 30, category: limits },
  { detector: "four-in-four", name: "Four in Four", description: "All four copies of a tile appear across four distinct sets", points: 30, category: limits },
  { detector: "three-digits", name: "Three Digits", description: "Only three numbered ranks are used across the hand", points: 30, category: limits },
  { detector: "terminals-or-honors-every-set", name: "All with Terminals and/or Winds/Dragons", description: "Every set and the pair contains a terminal or honor", points: 30, category: limits },
  { detector: "four-gongs-four-triplets", name: "Four Gongs and Four Triplets", description: "Four Gongs among at least four triplet sets", points: 30, category: limits },
  { detector: "big-four-winds", name: "Big Four Winds", description: "Pongs or Gongs of all four Winds", points: 40, category: limits },
  { detector: "pure-one-suit", name: "Pure One Suit", description: "Only one numbered suit; no honors", points: 40, category: limits },
  { detector: "all-eight-flowers", name: "All Eight Flowers", description: "Collect all eight flowers", points: 40, category: limits },
  { detector: "heavenly-win", name: "Heavenly Win", description: "Dealer wins on the initial hand, or another player wins on the dealer's first discard", points: 40, category: limits },
  { detector: "five-concealed-triplets", name: "Five Concealed Triplets", description: "Five concealed Pongs or Gongs", points: 50, category: limits },
  { detector: "five-shifted-triplets", name: "Five Shifted Triplets", description: "Five sequential Pongs in one suit", points: 50, category: limits },
  { detector: "all-winds-dragons", name: "All Winds and Dragons", description: "Only Wind and Dragon tiles", points: 50, category: limits },
  { detector: "pure-quadruple-chi", name: "Pure Quadruple Chi", description: "Four identical Chi in the same suit", points: 50, category: limits },
];

export function createDefaultHouseRules(): HouseRule[] {
  return STANDARD_SCORING_RULE_DEFINITIONS.map((rule) => ({
    ...rule,
    id: `standard-${rule.detector}`,
    enabled: true,
  }));
}
