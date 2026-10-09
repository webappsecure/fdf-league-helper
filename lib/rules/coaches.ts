import { ascendingKey, rollD6, type Rng } from "@/lib/dice";
import { rollCoachName } from "@/lib/identity";
import {
  basePoints,
  type Grade,
  type OwnershipLoyalty,
  type OwnershipStyle,
} from "@/lib/reference/management-tables";
import { TABLE_B, TABLE_F } from "@/lib/reference/offseason-tables";
import { hireCoach } from "@/lib/rules/management";

export const COACH_STEPS = [
  "coach-grade",
  "carousel",
  "base-points",
  "bonus-points",
  "ownership-impact",
] as const;
export type CoachStep = (typeof COACH_STEPS)[number];

export const COACH_STEP_HEADINGS: Record<CoachStep, string> = {
  "coach-grade": "Step 2: Head coach grade",
  carousel: "Step 3: Coaching carousel",
  "base-points": "Step 4: Franchise Points",
  "bonus-points": "Step 5: High draft picks, bonus FP",
  "ownership-impact": "Step 6: Ownership impact",
};

export type PreviousRecord = {
  wins: number;
  losses: number;
  ties: number;
  madePlayoffs: boolean;
  isChampion: boolean;
};

export type CoachInput = {
  franchiseId: number;
  teamName: string;
  coachName: string;
  frontOfficeGrade: Grade;
  headCoachGrade: Grade;
  hotSeat: boolean;
  ownershipStyle: OwnershipStyle | null;
  ownershipLoyalty: OwnershipLoyalty | null;
  // Null for an expansion team, which has no previous season.
  previous: PreviousRecord | null;
};

export type CoachResult = {
  franchiseId: number;
  headCoachName: string;
  headCoachGrade: Grade;
  hotSeat: boolean;
  frontOfficeGrade: Grade;
  ownershipStyle: OwnershipStyle | null;
  ownershipLoyalty: OwnershipLoyalty | null;
  franchisePoints: number;
};

export type CoachLogEntry = { step: CoachStep; franchiseId: number; message: string };

const GRADES: Grade[] = ["A", "B", "C", "D", "F"];

function shift(grade: Grade, steps: number): Grade {
  const index = Math.min(4, Math.max(0, GRADES.indexOf(grade) + steps));
  return GRADES[index];
}

// Winning percentage with a tie as half a win.
function percentage(record: PreviousRecord): number {
  const games = record.wins + record.losses + record.ties;
  return games === 0 ? 0 : (record.wins + record.ties / 2) / games;
}

// Bonus FP by team index: +3 for the worst percentage (ties included), +2 for
// the rest of the bottom 15% of the ranked teams, rounded to the nearest team.
function bonusPoints(percentages: (number | null)[]): number[] {
  const ranked = percentages.filter((value): value is number => value !== null);
  const sorted = [...ranked].sort((a, b) => a - b);
  const bottom = Math.max(1, Math.round(ranked.length * 0.15));
  return percentages.map((value) => {
    if (value === null) return 0;
    if (value === sorted[0]) return 3;
    return value <= sorted[bottom - 1] ? 2 : 0;
  });
}

type Note = (step: CoachStep, team: CoachInput, message: string) => void;
type CoachState = { grade: Grade; hotSeat: boolean };

// Step 2: grade change and hot seat removal.
function gradeChanges(teams: CoachInput[], note: Note): CoachState[] {
  return teams.map((team) => {
    let grade = team.headCoachGrade;
    let hotSeat = team.hotSeat;
    const record = team.previous;
    if (!record) {
      note("coach-grade", team, `new team, ${grade}.`);
      return { grade, hotSeat };
    }
    let reason = "no change";
    if (record.isChampion) {
      grade = grade === "A" || grade === "B" ? "A" : shift(grade, -2);
      reason = "league champion, up two grades (max A)";
    } else if (record.madePlayoffs || record.wins > record.losses) {
      grade = GRADES.indexOf(grade) > 1 ? shift(grade, -1) : grade;
      reason = "winning record or playoffs, up one grade (max B)";
    } else if (record.losses > record.wins) {
      grade = shift(grade, 1);
      reason = "losing record, down one grade (min F)";
    }
    let seat = "";
    if (hotSeat && record.wins > record.losses) {
      hotSeat = false;
      seat = " Winning record, off the Hot Seat.";
    }
    note(
      "coach-grade",
      team,
      `${record.wins}-${record.losses}-${record.ties}, ${reason}. ` +
        `Head Coach Grade ${team.headCoachGrade} to ${grade}.${seat}`,
    );
    return { grade, hotSeat };
  });
}

// Step 3: the coaching carousel, with Table A replacements. Returns the new
// state and each team's head coach name.
function carousel(
  teams: CoachInput[],
  before: CoachState[],
  takenCoachNames: string[],
  rng: Rng,
  note: Note,
): { state: CoachState[]; coachNames: string[] } {
  const state = [...before];
  const names = [...takenCoachNames];
  const coachNames = teams.map((team) => team.coachName);
  teams.forEach((team, index) => {
    const current = state[index];
    const grade = current.grade;
    if (!current.hotSeat && grade !== "D" && grade !== "F") return;
    const roll = rollD6(rng);
    const row = TABLE_F[roll];
    if (current.hotSeat && row.fires) {
      const hired = hireCoach(rng, team.ownershipStyle, team.frontOfficeGrade);
      const name = rollCoachName(names, rng);
      names.push(name);
      note(
        "carousel",
        team,
        `Table F roll ${roll}. ${team.coachName} is on the Hot Seat and is fired. ` +
          `New head coach ${name}, roll ${hired.key}.${hired.asked} Head Coach Grade ${hired.grade}.`,
      );
      coachNames[index] = name;
      state[index] = { grade: hired.grade, hotSeat: false };
    } else if (!current.hotSeat && row.hotSeatGrades.includes(grade)) {
      state[index] = { grade, hotSeat: true };
      note("carousel", team, `Table F roll ${roll}. Grade ${grade}, now on the Hot Seat.`);
    } else {
      note(
        "carousel",
        team,
        `Table F roll ${roll}. ${current.hotSeat ? "Stays on the Hot Seat" : "No change"}.`,
      );
    }
  });
  return { state, coachNames };
}

// Step 4: base FP from the grades after the carousel.
function baseFranchisePoints(teams: CoachInput[], state: CoachState[], note: Note): number[] {
  return teams.map((team, index) => {
    const base = basePoints(team.frontOfficeGrade, state[index].grade);
    note(
      "base-points",
      team,
      `Front Office ${team.frontOfficeGrade} and Head Coach ${state[index].grade}, ${base} FP.`,
    );
    return base;
  });
}

// Step 5: bonus FP for the worst records.
function withBonusPoints(teams: CoachInput[], points: number[], note: Note): number[] {
  const bonus = bonusPoints(
    teams.map((team) => (team.previous ? percentage(team.previous) : null)),
  );
  return teams.map((team, index) => {
    if (!team.previous) return points[index];
    note(
      "bonus-points",
      team,
      bonus[index] > 0 ? `+${bonus[index]} FP for a bottom record.` : "No bonus.",
    );
    return points[index] + bonus[index];
  });
}

// Step 6: ownership impact. FP never go below 0.
function ownershipImpact(
  teams: CoachInput[],
  state: CoachState[],
  coachNames: string[],
  points: number[],
  rng: Rng,
  note: Note,
): CoachResult[] {
  return teams.map((team, index): CoachResult => {
    const style = team.ownershipStyle;
    let loyalty = team.ownershipLoyalty;
    let frontOffice = team.frontOfficeGrade;
    const first = rollD6(rng);
    const second = rollD6(rng);
    const key = ascendingKey(first, second);
    const impact = TABLE_B[key];
    const has = (quality: string) => style === quality || loyalty === quality;
    const applies =
      (!impact.requires || impact.requires.some(has)) && !(impact.ignoreIf && has(impact.ignoreIf));
    let fp = points[index];
    if (applies) {
      fp = Math.max(0, fp + (impact.franchisePoints ?? 0));
      if (impact.setLoyalty) loyalty = impact.setLoyalty;
      if (impact.setFrontOfficeGrade) frontOffice = impact.setFrontOfficeGrade;
    }
    note(
      "ownership-impact",
      team,
      `Roll ${key}. ${impact.text} ${applies ? `Now ${fp} FP.` : `No effect, ${fp} FP.`}`,
    );
    return {
      franchiseId: team.franchiseId,
      headCoachName: coachNames[index],
      headCoachGrade: state[index].grade,
      hotSeat: state[index].hotSeat,
      frontOfficeGrade: frontOffice,
      ownershipStyle: style,
      ownershipLoyalty: loyalty,
      franchisePoints: fp,
    };
  });
}

// CE "Season Progression" off-season steps 2 to 6. Each step finishes for the
// whole league before the next begins, in the order the teams are given.
// `takenCoachNames` are the coaches' names a replacement must not repeat.
export function runCoaches(
  teams: CoachInput[],
  takenCoachNames: string[],
  rng: Rng,
): { teams: CoachResult[]; log: CoachLogEntry[] } {
  const log: CoachLogEntry[] = [];
  const note: Note = (step, team, message) =>
    log.push({ step, franchiseId: team.franchiseId, message: `${team.teamName}: ${message}` });

  const graded = gradeChanges(teams, note);
  const { state, coachNames } = carousel(teams, graded, takenCoachNames, rng, note);
  const base = baseFranchisePoints(teams, state, note);
  const points = withBonusPoints(teams, base, note);
  return { teams: ownershipImpact(teams, state, coachNames, points, rng, note), log };
}
