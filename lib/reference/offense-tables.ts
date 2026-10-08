// CE v1.5 "Create A New League" steps 8 to 11: the QV and CDV table, the
// offense quality pairs and Table C (Appendix A, page 16).

import {
  inPairOrderOf,
  pairIndexIn,
  row as sharedRow,
  type Footnote,
  type ProfileRow,
  type Quality as SharedQuality,
} from "@/lib/reference/profile-tables";

export { qualityLabel, type Footnote, type Strength } from "@/lib/reference/profile-tables";

export type OffenseProfile = "PROLIFIC" | "PROLIFIC_SEMI" | "AVERAGE" | "DULL_SEMI" | "DULL";

export const PROFILE_LABELS: Record<OffenseProfile, string> = {
  PROLIFIC: "PROLIFIC",
  PROLIFIC_SEMI: "PROLIFIC•",
  AVERAGE: "AVERAGE",
  DULL_SEMI: "DULL•",
  DULL: "DULL",
};

// Positive then negative, in the order the pairs are listed on a card.
export const OFFENSE_PAIRS = [
  ["DYNAMIC", "ERRATIC"],
  ["SOLID", "POROUS"],
  ["RELIABLE", "SHAKY"],
  ["SECURE", "CLUMSY"],
  ["DISCIPLINED", "UNDISCIPLINED"],
  ["EFFICIENT", "INEFFICIENT"],
] as const;

export type OffenseQuality = (typeof OFFENSE_PAIRS)[number][number];
export type Quality = SharedQuality<OffenseQuality>;

export function pairIndex(quality: OffenseQuality): number {
  return pairIndexIn(OFFENSE_PAIRS, quality);
}

export function inPairOrder(qualities: Quality[]): Quality[] {
  return inPairOrderOf(OFFENSE_PAIRS, qualities);
}

// Step 8. League sizes outside 8 to 56 are not supported.
export function qvCdvFor(teamCount: number): { qv: number; cdv: number } {
  if (teamCount <= 18) return { qv: 2, cdv: 1 };
  if (teamCount <= 31) return { qv: 4, cdv: 2 };
  if (teamCount <= 43) return { qv: 6, cdv: 3 };
  return { qv: 8, cdv: 4 };
}

function row(text: string, footnote?: Footnote): ProfileRow<OffenseQuality> {
  return sharedRow<OffenseQuality>(text, footnote);
}

// The qualities a footnote gives to one more team drawn from the pool.
export const FOOTNOTE_AWARDS: Record<Footnote, Quality[]> = {
  a: row("DYNAMIC• SOLID•").qualities,
  b: row("DYNAMIC•").qualities,
  c: row("SOLID•").qualities,
  d: row("ERRATIC• POROUS•").qualities,
  e: row("ERRATIC•").qualities,
  f: row("POROUS•").qualities,
};

// The profiles handed out in step 9, in sub-step order A to D.
export const DRAFT_PROFILES = ["PROLIFIC", "PROLIFIC_SEMI", "DULL", "DULL_SEMI"] as const;
export type DraftProfile = (typeof DRAFT_PROFILES)[number];

// Table C, one column per profile, keyed by 2d6 read in ascending order. Kept
// exactly as printed, including the few qualities that look out of place for
// their column (PROLIFIC• 1-1, DULL 6-6, DULL• 4-4, 5-5, 5-6 and 6-6).
export const TABLE_C: Record<DraftProfile, Record<string, ProfileRow<OffenseQuality>>> = {
  PROLIFIC: {
    "1-1": row("", "a"),
    "1-2": row("", "a"),
    "1-3": row("", "a"),
    "1-4": row("", "a"),
    "1-5": row("SOLID•", "b"),
    "1-6": row("SOLID•", "b"),
    "2-2": row("DYNAMIC•", "c"),
    "2-3": row("DYNAMIC•", "c"),
    "2-4": row("DYNAMIC•", "c"),
    "2-5": row("DYNAMIC", "c"),
    "2-6": row("DYNAMIC", "c"),
    "3-3": row("DYNAMIC", "c"),
    "3-4": row("DYNAMIC", "c"),
    "3-5": row("DYNAMIC• SOLID"),
    "3-6": row("DYNAMIC• SOLID"),
    "4-4": row("DYNAMIC• SOLID"),
    "4-5": row("DYNAMIC SOLID•"),
    "4-6": row("DYNAMIC SOLID•"),
    "5-5": row("SOLID", "b"),
    "5-6": row("DYNAMIC SOLID"),
    "6-6": row("DYNAMIC• SOLID•"),
  },
  PROLIFIC_SEMI: {
    "1-1": row("POROUS•", "a"),
    "1-2": row("", "a"),
    "1-3": row("", "a"),
    "1-4": row("", "a"),
    "1-5": row("", "a"),
    "1-6": row("", "a"),
    "2-2": row("SOLID•", "b"),
    "2-3": row("SOLID•", "b"),
    "2-4": row("DYNAMIC•", "c"),
    "2-5": row("DYNAMIC•", "c"),
    "2-6": row("DYNAMIC•", "c"),
    "3-3": row("DYNAMIC", "c"),
    "3-4": row("DYNAMIC", "c"),
    "3-5": row("DYNAMIC", "c"),
    "3-6": row("SOLID", "b"),
    "4-4": row("DYNAMIC SOLID"),
    "4-5": row("DYNAMIC SOLID"),
    "4-6": row("DYNAMIC• SOLID•"),
    "5-5": row("DYNAMIC• SOLID"),
    "5-6": row("DYNAMIC• SOLID•"),
    "6-6": row("DYNAMIC SOLID•"),
  },
  DULL: {
    "1-1": row("", "d"),
    "1-2": row("", "d"),
    "1-3": row("", "d"),
    "1-4": row("", "d"),
    "1-5": row("POROUS•", "e"),
    "1-6": row("POROUS•", "e"),
    "2-2": row("ERRATIC•", "f"),
    "2-3": row("ERRATIC•", "f"),
    "2-4": row("ERRATIC•", "f"),
    "2-5": row("ERRATIC", "f"),
    "2-6": row("ERRATIC", "f"),
    "3-3": row("ERRATIC", "f"),
    "3-4": row("ERRATIC", "f"),
    "3-5": row("ERRATIC• POROUS"),
    "3-6": row("ERRATIC• POROUS"),
    "4-4": row("ERRATIC• POROUS"),
    "4-5": row("ERRATIC POROUS•"),
    "4-6": row("ERRATIC POROUS•"),
    "5-5": row("POROUS", "e"),
    "5-6": row("ERRATIC POROUS"),
    "6-6": row("SOLID•", "d"),
  },
  DULL_SEMI: {
    "1-1": row("", "d"),
    "1-2": row("", "d"),
    "1-3": row("", "d"),
    "1-4": row("", "d"),
    "1-5": row("", "d"),
    "1-6": row("", "d"),
    "2-2": row("POROUS•", "e"),
    "2-3": row("POROUS•", "e"),
    "2-4": row("ERRATIC•", "f"),
    "2-5": row("ERRATIC•", "f"),
    "2-6": row("ERRATIC•", "f"),
    "3-3": row("ERRATIC", "f"),
    "3-4": row("ERRATIC", "f"),
    "3-5": row("ERRATIC", "f"),
    "3-6": row("POROUS", "e"),
    "4-4": row("DYNAMIC•", "d"),
    "4-5": row("ERRATIC POROUS•"),
    "4-6": row("ERRATIC• POROUS•"),
    "5-5": row("ERRATIC SOLID", "f"),
    "5-6": row("SOLID", "d"),
    "6-6": row("SOLID•", "d"),
  },
};
