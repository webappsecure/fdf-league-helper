// CE v1.5 "Create A New League" steps 8 to 11: the QV and CDV table, the
// offense quality pairs and Table C (Appendix A, page 16).

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
export type Strength = "FULL" | "SEMI";
export type Quality = { quality: OffenseQuality; strength: Strength };

export function qualityLabel({ quality, strength }: Quality): string {
  return strength === "SEMI" ? `${quality}•` : quality;
}

export function pairIndex(quality: OffenseQuality): number {
  return OFFENSE_PAIRS.findIndex((pair) => (pair as readonly string[]).includes(quality));
}

export function inPairOrder(qualities: Quality[]): Quality[] {
  return [...qualities].sort((a, b) => pairIndex(a.quality) - pairIndex(b.quality));
}

// Step 8. League sizes outside 8 to 56 are not supported.
export function qvCdvFor(teamCount: number): { qv: number; cdv: number } {
  if (teamCount <= 18) return { qv: 2, cdv: 1 };
  if (teamCount <= 31) return { qv: 4, cdv: 2 };
  if (teamCount <= 43) return { qv: 6, cdv: 3 };
  return { qv: 8, cdv: 4 };
}

export type Footnote = "a" | "b" | "c" | "d" | "e" | "f";
export type ProfileRow = { qualities: Quality[]; footnote?: Footnote };

// Writes a row the way the rulebook prints it: qualities separated by spaces,
// a trailing bullet for SEMI.
function row(text: string, footnote?: Footnote): ProfileRow {
  const qualities = text
    .split(" ")
    .filter(Boolean)
    .map((word): Quality => {
      const semi = word.endsWith("•");
      return {
        quality: (semi ? word.slice(0, -1) : word) as OffenseQuality,
        strength: semi ? "SEMI" : "FULL",
      };
    });
  return footnote ? { qualities, footnote } : { qualities };
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
export const TABLE_C: Record<DraftProfile, Record<string, ProfileRow>> = {
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
