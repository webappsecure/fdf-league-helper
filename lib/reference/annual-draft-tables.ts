// CE v1.5 Season Progression tables for the annual draft and free agency:
// Table J (page 20), Table L (page 22) and the season progression columns of
// Table G (page 19). Tables K and M (pages 21 and 23) are the same rows as
// Tables C and D, so the inaugural draft's TABLE_C and TABLE_D serve for them.

import { ASCENDING_KEYS } from "@/lib/dice";
import type { DefenseProfile } from "@/lib/reference/defense-tables";
import type { OffenseProfile } from "@/lib/reference/offense-tables";

// A Table J or L result. `special` marks a (*) or (**) footnote, which sends the
// team to a Table G column.
export type ProfileMove<Profile extends string> = { to: Profile; special?: "*" | "**" };

// Lays a column out as printed: one profile per key, 1-1 to 6-6, with the keys
// that carry a special result named after it.
function column<Profile extends string>(
  profiles: Profile[],
  special: Record<string, "*" | "**"> = {},
): Record<string, ProfileMove<Profile>> {
  if (profiles.length !== ASCENDING_KEYS.length) throw new Error("A column has 21 rows.");
  return Object.fromEntries(
    ASCENDING_KEYS.map((key, index) => [
      key,
      special[key] ? { to: profiles[index], special: special[key] } : { to: profiles[index] },
    ]),
  );
}

const P: OffenseProfile = "PROLIFIC";
const p: OffenseProfile = "PROLIFIC_SEMI";
const A: OffenseProfile = "AVERAGE";
const d: OffenseProfile = "DULL_SEMI";
const D: OffenseProfile = "DULL";

// Table J, one column per profile the team has now, keyed by 2d6 read in
// ascending order. Rows 1-1, 1-2 ... 1-6, 2-2 ... 6-6, as printed. The
// PROLIFIC• 5-5 row prints no dagger in the book; the overview treats it as
// carrying one, which changes nothing here because the draft cards start empty.
export const TABLE_J: Record<OffenseProfile, Record<string, ProfileMove<OffenseProfile>>> = {
  PROLIFIC: column([D, A, A, A, A, A, d, A, A, p, p, p, p, p, P, A, P, P, A, P, P], { "6-6": "*" }),
  PROLIFIC_SEMI: column([D, A, A, A, A, A, d, A, A, p, p, p, p, p, P, d, P, P, A, P, P]),
  AVERAGE: column([D, A, d, A, A, A, d, A, A, A, A, A, A, A, A, A, A, A, p, p, P]),
  DULL_SEMI: column([d, d, D, d, d, d, d, d, A, A, A, A, A, A, A, A, A, A, A, p, P]),
  DULL: column([d, D, D, d, d, d, A, d, d, d, d, A, d, A, A, A, A, A, p, A, P], { "1-3": "**" }),
};

const S: DefenseProfile = "STAUNCH";
const s: DefenseProfile = "STAUNCH_SEMI";
const N: DefenseProfile = "AVERAGE";
const i: DefenseProfile = "INEPT_SEMI";
const I: DefenseProfile = "INEPT";

// Table L, laid out like Table J. The `(**)` footnote is read as the INEPT
// DEFENSE column of Table G, as the overview corrects the book.
export const TABLE_L: Record<DefenseProfile, Record<string, ProfileMove<DefenseProfile>>> = {
  STAUNCH: column([I, N, N, N, N, N, i, N, N, s, s, s, s, s, S, N, S, S, N, S, S], { "6-6": "*" }),
  STAUNCH_SEMI: column([I, N, N, N, N, N, i, N, N, s, s, s, s, s, S, i, S, S, N, S, S]),
  AVERAGE: column([N, i, I, N, N, N, N, N, N, N, N, N, N, N, N, N, N, s, N, S, N]),
  INEPT_SEMI: column([i, i, I, i, i, i, i, i, N, N, N, N, N, N, N, N, N, N, N, s, S]),
  INEPT: column([i, I, I, i, i, i, N, i, i, i, i, N, i, N, N, N, N, N, s, N, S], { "1-3": "**" }),
};

export type SpecialColumn =
  "PROLIFIC_OFFENSE" | "DULL_OFFENSE" | "STAUNCH_DEFENSE" | "INEPT_DEFENSE";

const TD_1 = "Roll 1-2-3 is automatic TD PASS";
const TD_2 = "Rolls 1-2-3 & 1-2-5 are automatic TD PASS";
const TD_3 = "Rolls 1-2-3, 1-2-5, & 3-4-5 are automatic TD PASS";
const PUNT_2 = "Rolls 4-4-6 & 5-5-6 are automatic PUNT";
const PUNT_3 = "Rolls 3-6-6, 4-4-6, & 5-5-6 are automatic PUNT";

// Table G's season progression columns, the six results of a d6 in order.
export const TABLE_G_SEASON: Record<SpecialColumn, string[]> = {
  PROLIFIC_OFFENSE: [TD_1, TD_1, TD_1, TD_1, TD_2, TD_3],
  DULL_OFFENSE: [PUNT_3, PUNT_3, PUNT_2, PUNT_2, PUNT_2, PUNT_2],
  STAUNCH_DEFENSE: [PUNT_2, PUNT_2, PUNT_2, PUNT_2, PUNT_3, PUNT_3],
  INEPT_DEFENSE: [TD_3, TD_2, TD_1, TD_1, TD_1, TD_1],
};

// Worst to best, to tell whether a new profile is lower than the old one.
export const OFFENSE_RANK: OffenseProfile[] = [
  "DULL",
  "DULL_SEMI",
  "AVERAGE",
  "PROLIFIC_SEMI",
  "PROLIFIC",
];
export const DEFENSE_RANK: DefenseProfile[] = [
  "INEPT",
  "INEPT_SEMI",
  "AVERAGE",
  "STAUNCH_SEMI",
  "STAUNCH",
];
