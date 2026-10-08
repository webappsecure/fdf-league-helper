// CE v1.5 "Create A New League" steps 3, 4, 6 and 7: the ownership tables, the
// front office grade table, Table A (Appendix A) and the Franchise Points grid.

import type { Die } from "@/lib/dice";

export type Grade = "A" | "B" | "C" | "D" | "F";
export type OwnershipStyle = "MEDDLING" | "SAVVY";
export type OwnershipLoyalty = "SELFISH" | "LOYAL";

// Step 3. A roll of 2 to 5 gives no quality.
export function ownershipStyleFor(roll: Die): OwnershipStyle | null {
  return roll === 1 ? "MEDDLING" : roll === 6 ? "SAVVY" : null;
}

export function ownershipLoyaltyFor(roll: Die): OwnershipLoyalty | null {
  return roll === 1 ? "SELFISH" : roll === 6 ? "LOYAL" : null;
}

// Step 4. F is not possible at league creation.
export function frontOfficeGradeFor(roll: Die): Grade {
  if (roll === 1) return "D";
  if (roll <= 3) return "C";
  if (roll <= 5) return "B";
  return "A";
}

export type CoachQuestion =
  | "SAVVY"
  | "MEDDLING"
  | "FO_A"
  | "FO_B_OR_BETTER"
  | "FO_C_OR_LOWER"
  | "FO_D";

export const COACH_QUESTION_TEXT: Record<CoachQuestion, string> = {
  SAVVY: "SAVVY ownership?",
  MEDDLING: "MEDDLING ownership?",
  FO_A: "Front Office Grade A?",
  FO_B_OR_BETTER: "Front Office Grade B or better?",
  FO_C_OR_LOWER: "Front Office Grade C or lower?",
  FO_D: "Front Office Grade D?",
};

// A row either hires one grade outright, or asks a question and hires `yes`
// when it holds and `otherwise` when it does not.
export type CoachRow =
  | { yes: Grade }
  | { question: CoachQuestion; yes: Grade; otherwise: Grade };

// Table A, keyed by 2d6 read in ascending order.
export const TABLE_A: Record<string, CoachRow> = {
  "1-1": { question: "SAVVY", yes: "B", otherwise: "D" },
  "1-2": { question: "FO_A", yes: "C", otherwise: "D" },
  "1-3": { question: "FO_B_OR_BETTER", yes: "C", otherwise: "D" },
  "1-4": { question: "SAVVY", yes: "A", otherwise: "C" },
  "1-5": { yes: "C" },
  "1-6": { question: "FO_C_OR_LOWER", yes: "D", otherwise: "C" },
  "2-2": { yes: "C" },
  "2-3": { question: "FO_A", yes: "B", otherwise: "C" },
  "2-4": { question: "FO_D", yes: "D", otherwise: "C" },
  "2-5": { question: "FO_B_OR_BETTER", yes: "B", otherwise: "C" },
  "2-6": { question: "MEDDLING", yes: "D", otherwise: "B" },
  "3-3": { yes: "B" },
  "3-4": { question: "FO_A", yes: "A", otherwise: "B" },
  "3-5": { question: "FO_D", yes: "C", otherwise: "B" },
  "3-6": { yes: "B" },
  "4-4": { question: "MEDDLING", yes: "C", otherwise: "A" },
  "4-5": { yes: "B" },
  "4-6": { question: "FO_C_OR_LOWER", yes: "C", otherwise: "B" },
  "5-5": { yes: "A" },
  "5-6": { question: "FO_D", yes: "B", otherwise: "A" },
  "6-6": { yes: "A" },
};

// Step 7. Outer key is the front office grade, inner key the head coach grade.
const BASE_POINTS: Record<Grade, Record<Grade, number>> = {
  A: { A: 4, B: 3, C: 2, D: 1, F: 0 },
  B: { A: 3, B: 2, C: 1, D: 0, F: 0 },
  C: { A: 2, B: 1, C: 0, D: 0, F: 0 },
  D: { A: 1, B: 0, C: 0, D: 0, F: 0 },
  F: { A: 0, B: 0, C: 0, D: 0, F: 0 },
};

export function basePoints(frontOfficeGrade: Grade, headCoachGrade: Grade): number {
  return BASE_POINTS[frontOfficeGrade][headCoachGrade];
}
