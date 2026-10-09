import { ascendingKey, rollD6, type Rng } from "@/lib/dice";
import {
  COACH_QUESTION_TEXT,
  TABLE_A,
  basePoints,
  frontOfficeGradeFor,
  ownershipLoyaltyFor,
  ownershipStyleFor,
  type CoachQuestion,
  type Grade,
  type OwnershipLoyalty,
  type OwnershipStyle,
} from "@/lib/reference/management-tables";

export const STEPS = ["ownership", "front-office", "head-coach", "franchise-points"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_HEADINGS: Record<Step, string> = {
  ownership: "Step 3: Ownership",
  "front-office": "Step 4: Front office grade",
  "head-coach": "Step 6: Head coach grade",
  "franchise-points": "Step 7: Franchise Points",
};

export type ManagementInput = { franchiseId: number; teamName: string; coachName: string };

export type Management = {
  franchiseId: number;
  ownershipStyle: OwnershipStyle | null;
  ownershipLoyalty: OwnershipLoyalty | null;
  frontOfficeGrade: Grade;
  headCoachGrade: Grade;
  basePoints: number;
};

export type LogEntry = { step: Step; franchiseId: number; message: string };

function holds(
  question: CoachQuestion,
  style: OwnershipStyle | null,
  frontOfficeGrade: Grade,
): boolean {
  switch (question) {
    case "SAVVY":
      return style === "SAVVY";
    case "MEDDLING":
      return style === "MEDDLING";
    case "FO_A":
      return frontOfficeGrade === "A";
    case "FO_B_OR_BETTER":
      return frontOfficeGrade === "A" || frontOfficeGrade === "B";
    case "FO_C_OR_LOWER":
      return frontOfficeGrade !== "A" && frontOfficeGrade !== "B";
    case "FO_D":
      return frontOfficeGrade === "D";
  }
}

// Table A: rolls the grade of a newly hired head coach. `asked` is the question
// the row put, with its answer, for the log.
export function hireCoach(
  rng: Rng,
  style: OwnershipStyle | null,
  frontOfficeGrade: Grade,
): { key: string; grade: Grade; asked: string } {
  const first = rollD6(rng);
  const second = rollD6(rng);
  const key = ascendingKey(first, second);
  const row = TABLE_A[key];
  let grade = row.yes;
  let asked = "";
  if ("question" in row) {
    const yes = holds(row.question, style, frontOfficeGrade);
    grade = yes ? row.yes : row.otherwise;
    asked = ` ${COACH_QUESTION_TEXT[row.question]} ${yes ? "Yes" : "No"}.`;
  }
  return { key, grade, asked };
}

// CE "Create A New League" steps 3, 4, 6 and 7. The whole league finishes one
// step before the next begins, in the order the teams are given, so a given
// random source always produces the same league.
export function rollManagement(
  teams: ManagementInput[],
  rng: Rng,
): { teams: Management[]; log: LogEntry[] } {
  const log: LogEntry[] = [];

  const ownership = teams.map((team) => {
    const styleRoll = rollD6(rng);
    const loyaltyRoll = rollD6(rng);
    const style = ownershipStyleFor(styleRoll);
    const loyalty = ownershipLoyaltyFor(loyaltyRoll);
    log.push({
      step: "ownership",
      franchiseId: team.franchiseId,
      message:
        `${team.teamName}: style roll ${styleRoll}, ${style ?? "no quality"}. ` +
        `Loyalty roll ${loyaltyRoll}, ${loyalty ?? "no quality"}.`,
    });
    return { style, loyalty };
  });

  const frontOffice = teams.map((team) => {
    const roll = rollD6(rng);
    const grade = frontOfficeGradeFor(roll);
    log.push({
      step: "front-office",
      franchiseId: team.franchiseId,
      message: `${team.teamName}: roll ${roll}, Front Office Grade ${grade}.`,
    });
    return grade;
  });

  const headCoach = teams.map((team, index) => {
    const { key, grade, asked } = hireCoach(rng, ownership[index].style, frontOffice[index]);
    log.push({
      step: "head-coach",
      franchiseId: team.franchiseId,
      message: `${team.teamName}: ${team.coachName}, roll ${key}.${asked} Head Coach Grade ${grade}.`,
    });
    return grade;
  });

  const results = teams.map((team, index) => {
    const points = basePoints(frontOffice[index], headCoach[index]);
    log.push({
      step: "franchise-points",
      franchiseId: team.franchiseId,
      message:
        `${team.teamName}: Front Office ${frontOffice[index]} and Head Coach ` +
        `${headCoach[index]}, ${points} FP.`,
    });
    return {
      franchiseId: team.franchiseId,
      ownershipStyle: ownership[index].style,
      ownershipLoyalty: ownership[index].loyalty,
      frontOfficeGrade: frontOffice[index],
      headCoachGrade: headCoach[index],
      basePoints: points,
    };
  });

  return { teams: results, log };
}
