// CE v1.5 Season Progression tables used by the off-season coach and Franchise
// Points steps: Table B (Appendix A, page 15) and Table F (page 19).

import type { Grade, OwnershipLoyalty, OwnershipStyle } from "@/lib/reference/management-tables";

export type OwnershipQuality = OwnershipStyle | OwnershipLoyalty;

export type OwnershipImpact = {
  text: string;
  // The row applies only to a team with at least one of these qualities.
  requires?: OwnershipQuality[];
  // The row is ignored for a team with this quality.
  ignoreIf?: OwnershipQuality;
  franchisePoints?: number;
  setLoyalty?: OwnershipLoyalty;
  setFrontOfficeGrade?: Grade;
};

// Table B, keyed by 2d6 read in ascending order.
export const TABLE_B: Record<string, OwnershipImpact> = {
  "1-1": {
    text: "Team signs overpriced, aging free-agent. FP reduced by 2.",
    ignoreIf: "SAVVY",
    franchisePoints: -2,
  },
  "1-2": {
    text: "Ownership refuses to increase budget for player signings. FP reduced by 2.",
    requires: ["MEDDLING", "SELFISH"],
    franchisePoints: -2,
  },
  "1-3": {
    text: "Ownership frustrates Front Office by re-ordering draft-board. FP reduced by 1.",
    requires: ["MEDDLING"],
    franchisePoints: -1,
  },
  "1-4": {
    text: "Ownership refuses to sign star free-agent who once insulted him in the media. FP reduced by 1.",
    requires: ["SELFISH"],
    franchisePoints: -1,
  },
  "1-5": {
    text: "Ownership brings in consultant to help with draft preparations. FP reduced by 1.",
    requires: ["MEDDLING"],
    franchisePoints: -1,
  },
  "1-6": {
    text: "Ownership interferes in off-season negotiations with star player. FP reduced by 1.",
    requires: ["MEDDLING"],
    franchisePoints: -1,
  },
  "2-2": {
    text: "Ownership growing more and more unhappy with city leaders. Ownership now SELFISH.",
    requires: ["MEDDLING"],
    setLoyalty: "SELFISH",
  },
  "2-3": {
    text: "Ownership refuses to meet the demands of star-holdout. FP reduced by 1.",
    requires: ["MEDDLING", "SELFISH"],
    franchisePoints: -1,
  },
  "2-4": {
    text: "Ownership invests in all-new training facilities. FP increased by 1.",
    franchisePoints: 1,
  },
  "2-5": {
    text: "Ownership forces GM to make an unbalanced trade for overrated veteran. FP reduced by 1.",
    requires: ["MEDDLING"],
    franchisePoints: -1,
  },
  "2-6": {
    text: "Ownership increases budget to keep talented coordinator on the coaching staff. FP increased by 1.",
    requires: ["SAVVY"],
    franchisePoints: 1,
  },
  "3-3": {
    text: "Ownership fires GM just days before the draft! Front Office Grade now D. FP reduced by 2.",
    requires: ["SELFISH"],
    franchisePoints: -2,
    setFrontOfficeGrade: "D",
  },
  "3-4": {
    text: "Ownership works with GM to pull off trade for an extra first round pick. FP increased by 1.",
    requires: ["SAVVY"],
    franchisePoints: 1,
  },
  "3-5": {
    text: "Ownership brings back star player & Ivy League Alumnus to run the Front Office. FP increased by 1.",
    requires: ["LOYAL"],
    franchisePoints: 1,
  },
  "3-6": {
    text: "Ownership funds state-of-the-art analytics department. FP increased by 1.",
    requires: ["SAVVY"],
    franchisePoints: 1,
  },
  "4-4": {
    text: "Ownership restructures star-QB contract, freeing up cap-room. FP increased by 2.",
    requires: ["SAVVY"],
    franchisePoints: 2,
  },
  "4-5": {
    text: "Ownership helps Front Office negotiate new deal with star-holdout. FP increased by 1.",
    requires: ["SAVVY"],
    franchisePoints: 1,
  },
  "4-6": {
    text: "Ownership announces training facility upgrades, FP increased by 1.",
    requires: ["SAVVY"],
    franchisePoints: 1,
  },
  "5-5": {
    text: "Ownership makes long-term commitment to city. Ownership now LOYAL.",
    requires: ["SAVVY"],
    setLoyalty: "LOYAL",
  },
  "5-6": {
    text: "Ownership agrees to expand budget for player signings. FP increased by 2.",
    requires: ["SAVVY", "LOYAL"],
    franchisePoints: 2,
  },
  "6-6": {
    text: "Team signs young superstar looking for a second chance. FP increased by 2.",
    ignoreIf: "SELFISH",
    franchisePoints: 2,
  },
};

// Table F, keyed by 1d6. A coach on the Hot Seat is fired when `fires` is set;
// otherwise, and for a coach not on the Hot Seat, a coach with one of `hotSeatGrades`
// goes on the Hot Seat.
export const TABLE_F: Record<number, { fires: boolean; hotSeatGrades: Grade[] }> = {
  1: { fires: true, hotSeatGrades: ["D", "F"] },
  2: { fires: true, hotSeatGrades: ["D", "F"] },
  3: { fires: true, hotSeatGrades: ["F"] },
  4: { fires: false, hotSeatGrades: ["D", "F"] },
  5: { fires: false, hotSeatGrades: ["D", "F"] },
  6: { fires: false, hotSeatGrades: ["F"] },
};
