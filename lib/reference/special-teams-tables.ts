// CE v1.5 "Create A New League" step 14: Table E (Appendix A, page 18).

import { ASCENDING_KEYS } from "@/lib/dice";

export type ReturnQuality = "ELECTRIC" | "ELECTRIC_SEMI";

// A return quality or none, or a kicking success range such as "11-63".
export type SpecialTeamsResult = ReturnQuality | null | string;

export type SpecialTeamsColumn = "kickReturn" | "puntReturn" | "fg" | "xp15" | "xp2";

// Takes a column's 21 results in the order they are printed, one line per
// first die, and keys them by the roll.
function column<Result>(results: Result[]): Record<string, Result> {
  return Object.fromEntries(ASCENDING_KEYS.map((key, index) => [key, results[index]]));
}

// Table E, keyed by 2d6 read in ascending order. Kept exactly as printed: the
// FG and XP columns do not always rise with the roll.
export const TABLE_E: {
  kickReturn: Record<string, ReturnQuality | null>;
  puntReturn: Record<string, ReturnQuality | null>;
  fg: Record<string, string>;
  xp15: Record<string, string>;
  xp2: Record<string, string>;
} = {
  kickReturn: column<ReturnQuality | null>([
    null, null, null, null, null, null,
    null, null, null, null, null,
    null, null, null, null,
    null, "ELECTRIC_SEMI", "ELECTRIC_SEMI",
    "ELECTRIC_SEMI", "ELECTRIC_SEMI",
    "ELECTRIC",
  ]),
  puntReturn: column<ReturnQuality | null>([
    null, null, null, null, null, null,
    null, null, null, null, null,
    null, null, null, "ELECTRIC_SEMI",
    "ELECTRIC_SEMI", "ELECTRIC_SEMI", "ELECTRIC_SEMI",
    "ELECTRIC_SEMI", "ELECTRIC",
    "ELECTRIC",
  ]),
  fg: column([
    "11-45", "11-46", "11-51", "11-52", "11-53", "11-53",
    "11-54", "11-53", "11-54", "11-54", "11-55",
    "11-55", "11-56", "11-56", "11-61",
    "11-61", "11-62", "11-63",
    "11-65", "11-64",
    "11-65",
  ]),
  // XP kicked from the 15-yard line.
  xp15: column([
    "11-56", "11-56", "11-61", "11-61", "11-62", "11-62",
    "11-63", "11-62", "11-63", "11-63", "11-64",
    "11-64", "11-64", "11-64", "11-64",
    "11-65", "11-65", "11-65",
    "11-66", "11-65",
    "11-66",
  ]),
  // XP kicked from the 2-yard line.
  xp2: column([
    "11-63", "11-64", "11-64", "11-65", "11-65", "11-65",
    "11-66", "11-66", "11-66", "11-66", "11-66",
    "11-66", "11-66", "11-66", "11-66",
    "11-66", "11-66", "11-66",
    "11-66", "11-66",
    "11-66",
  ]),
};

export function resultLabel(result: SpecialTeamsResult): string {
  if (result === null) return "no quality";
  if (result === "ELECTRIC_SEMI") return "ELECTRIC•";
  return result;
}

// Higher is better. Ranges rank by their end value.
function rank(result: SpecialTeamsResult): number {
  if (result === null) return 0;
  if (result === "ELECTRIC_SEMI") return 1;
  if (result === "ELECTRIC") return 2;
  return Number(result.slice(3));
}

export function isBetter(candidate: SpecialTeamsResult, current: SpecialTeamsResult): boolean {
  return rank(candidate) > rank(current);
}

// How many of the 36 ways two dice can fall give a better result than this
// one on the same column. A double falls one way, any other roll two.
export function waysToImprove(name: SpecialTeamsColumn, current: SpecialTeamsResult): number {
  const rows: Record<string, SpecialTeamsResult> = TABLE_E[name];
  return Object.entries(rows).reduce((ways, [key, result]) => {
    if (!isBetter(result, current)) return ways;
    return ways + (key[0] === key[2] ? 1 : 2);
  }, 0);
}
