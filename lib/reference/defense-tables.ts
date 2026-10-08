// CE v1.5 "Create A New League" steps 12 and 13: the defense quality pairs and
// Table D (Appendix A, page 17).

import {
  inPairOrderOf,
  row as sharedRow,
  type Footnote,
  type ProfileRow,
  type Quality,
} from "@/lib/reference/profile-tables";

export type DefenseProfile = "STAUNCH" | "STAUNCH_SEMI" | "AVERAGE" | "INEPT_SEMI" | "INEPT";

export const DEFENSE_PROFILE_LABELS: Record<DefenseProfile, string> = {
  STAUNCH: "STAUNCH",
  STAUNCH_SEMI: "STAUNCH•",
  AVERAGE: "AVERAGE",
  INEPT_SEMI: "INEPT•",
  INEPT: "INEPT",
};

// Positive then negative, in the order the pairs are listed on a card.
export const DEFENSE_PAIRS = [
  ["STIFF", "SOFT"],
  ["PUNISHING", "MILD"],
  ["AGGRESSIVE", "MEEK"],
  ["ACTIVE", "PASSIVE"],
  ["DISCIPLINED", "UNDISCIPLINED"],
] as const;

export type DefenseQualityName = (typeof DEFENSE_PAIRS)[number][number];
export type DefenseQuality = Quality<DefenseQualityName>;

export function inDefensePairOrder(qualities: DefenseQuality[]): DefenseQuality[] {
  return inPairOrderOf(DEFENSE_PAIRS, qualities);
}

function row(text: string, footnote?: Footnote): ProfileRow<DefenseQualityName> {
  return sharedRow<DefenseQualityName>(text, footnote);
}

// The qualities a footnote gives to one more team drawn from the pool.
export const DEFENSE_FOOTNOTE_AWARDS: Record<Footnote, DefenseQuality[]> = {
  a: row("STIFF• PUNISHING•").qualities,
  b: row("STIFF•").qualities,
  c: row("PUNISHING•").qualities,
  d: row("SOFT• MILD•").qualities,
  e: row("SOFT•").qualities,
  f: row("MILD•").qualities,
};

// The profiles handed out in step 12, in sub-step order A to D.
export const DEFENSE_DRAFT_PROFILES = ["STAUNCH", "STAUNCH_SEMI", "INEPT", "INEPT_SEMI"] as const;
export type DefenseDraftProfile = (typeof DEFENSE_DRAFT_PROFILES)[number];

// Table D, one column per profile, keyed by 2d6 read in ascending order. Kept
// exactly as printed, including MILD• on STAUNCH• 1-1.
export const TABLE_D: Record<
  DefenseDraftProfile,
  Record<string, ProfileRow<DefenseQualityName>>
> = {
  STAUNCH: {
    "1-1": row("", "a"),
    "1-2": row("", "a"),
    "1-3": row("", "a"),
    "1-4": row("", "a"),
    "1-5": row("STIFF•", "c"),
    "1-6": row("STIFF•", "c"),
    "2-2": row("STIFF", "c"),
    "2-3": row("STIFF", "c"),
    "2-4": row("STIFF", "c"),
    "2-5": row("STIFF", "c"),
    "2-6": row("PUNISHING•", "b"),
    "3-3": row("PUNISHING•", "b"),
    "3-4": row("PUNISHING", "b"),
    "3-5": row("PUNISHING", "b"),
    "3-6": row("STIFF PUNISHING•"),
    "4-4": row("STIFF• PUNISHING•"),
    "4-5": row("STIFF• PUNISHING•"),
    "4-6": row("STIFF PUNISHING"),
    "5-5": row("STIFF PUNISHING•"),
    "5-6": row("STIFF PUNISHING"),
    "6-6": row("STIFF PUNISHING"),
  },
  STAUNCH_SEMI: {
    "1-1": row("MILD•", "a"),
    "1-2": row("", "a"),
    "1-3": row("", "a"),
    "1-4": row("", "a"),
    "1-5": row("", "a"),
    "1-6": row("", "a"),
    "2-2": row("", "a"),
    "2-3": row("", "a"),
    "2-4": row("", "a"),
    "2-5": row("STIFF•", "c"),
    "2-6": row("STIFF•", "c"),
    "3-3": row("STIFF•", "c"),
    "3-4": row("STIFF", "c"),
    "3-5": row("STIFF", "c"),
    "3-6": row("PUNISHING•", "b"),
    "4-4": row("STIFF PUNISHING•"),
    "4-5": row("PUNISHING", "b"),
    "4-6": row("STIFF• PUNISHING•"),
    "5-5": row("STIFF• PUNISHING"),
    "5-6": row("STIFF• PUNISHING•"),
    "6-6": row("STIFF PUNISHING"),
  },
  INEPT: {
    "1-1": row("", "d"),
    "1-2": row("", "d"),
    "1-3": row("SOFT", "f"),
    "1-4": row("SOFT", "f"),
    "1-5": row("SOFT", "f"),
    "1-6": row("SOFT", "f"),
    "2-2": row("SOFT", "f"),
    "2-3": row("SOFT•", "f"),
    "2-4": row("SOFT•", "f"),
    "2-5": row("MILD", "e"),
    "2-6": row("MILD•", "e"),
    "3-3": row("SOFT MILD•"),
    "3-4": row("SOFT• MILD•"),
    "3-5": row("SOFT• MILD•"),
    "3-6": row("SOFT• MILD"),
    "4-4": row("SOFT MILD•"),
    "4-5": row("SOFT MILD"),
    "4-6": row("SOFT MILD"),
    "5-5": row("SOFT MILD"),
    "5-6": row("SOFT MILD"),
    "6-6": row("SOFT MILD"),
  },
  INEPT_SEMI: {
    "1-1": row("", "d"),
    "1-2": row("", "d"),
    "1-3": row("", "d"),
    "1-4": row("", "d"),
    "1-5": row("", "d"),
    "1-6": row("", "d"),
    "2-2": row("", "d"),
    "2-3": row("", "d"),
    "2-4": row("SOFT•", "f"),
    "2-5": row("SOFT•", "f"),
    "2-6": row("SOFT•", "f"),
    "3-3": row("MILD•", "e"),
    "3-4": row("SOFT", "f"),
    "3-5": row("SOFT", "f"),
    "3-6": row("SOFT", "f"),
    "4-4": row("MILD", "e"),
    "4-5": row("SOFT• MILD•"),
    "4-6": row("SOFT MILD•"),
    "5-5": row("MILD", "e"),
    "5-6": row("SOFT• MILD"),
    "6-6": row("SOFT MILD"),
  },
};
