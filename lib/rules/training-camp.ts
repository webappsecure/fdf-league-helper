import type { Rng } from "@/lib/dice";
import {
  inDefensePairOrder,
  type DefenseProfile,
  type DefenseQuality,
} from "@/lib/reference/defense-tables";
import { basePoints, type Grade } from "@/lib/reference/management-tables";
import { inPairOrder, type OffenseProfile, type Quality } from "@/lib/reference/offense-tables";
import { draftRemainingDefenseQualities } from "@/lib/rules/defense";
import { openDraft, type DraftStep, type DraftTeam } from "@/lib/rules/draft";
import { draftEfficiency, draftRemainingQualities } from "@/lib/rules/offense";

// CE "Season Progression" training camp steps 1 to 6, with the log steps they
// write under.
export const CAMP_STEPS = [
  "camp-front-office",
  "camp-qv-cdv",
  "camp-points",
  "camp-offense-qualities",
  "camp-efficiency",
  "camp-defense-qualities",
] as const;
export type CampStep = (typeof CAMP_STEPS)[number];

export const CAMP_STEP_HEADINGS: Record<CampStep, string> = {
  "camp-front-office": "Training camp step 1: Front office grade",
  "camp-qv-cdv": "Training camp step 2: QV and CDV",
  "camp-points": "Training camp step 3: Franchise Points",
  "camp-offense-qualities": "Training camp step 4: Offense qualities",
  "camp-efficiency": "Training camp step 5: EFFICIENT and INEFFICIENT",
  "camp-defense-qualities": "Training camp step 6: Defense qualities",
};

export type CampLogEntry = { step: CampStep; franchiseId: number | null; message: string };

// The draft helpers log under the inaugural draft's step keys.
const CAMP_KEY: Partial<Record<DraftStep, CampStep>> = {
  "offense-qualities": "camp-offense-qualities",
  efficiency: "camp-efficiency",
  "defense-qualities": "camp-defense-qualities",
};

const GRADES: Grade[] = ["A", "B", "C", "D", "F"];

// PROLIFIC and STAUNCH are +1, DULL and INEPT are -1, FULL and SEMI alike.
function level(profile: OffenseProfile | DefenseProfile): number {
  if (profile.startsWith("PROLIFIC") || profile.startsWith("STAUNCH")) return 1;
  if (profile.startsWith("DULL") || profile.startsWith("INEPT")) return -1;
  return 0;
}

// Step 1: each side's change is new minus old, the two are added, and the
// total moves the grade toward A (positive) or F, stopping at either end.
export function adjustFrontOffice(
  grade: Grade,
  before: { offense: OffenseProfile; defense: DefenseProfile },
  after: { offense: OffenseProfile; defense: DefenseProfile },
): { change: number; grade: Grade } {
  const change =
    level(after.offense) - level(before.offense) + level(after.defense) - level(before.defense);
  const index = Math.min(GRADES.length - 1, Math.max(0, GRADES.indexOf(grade) - change));
  return { change, grade: GRADES[index] };
}

export type CampTeam = DraftTeam & {
  frontOfficeGrade: Grade;
  previousOffense: OffenseProfile;
  previousDefense: DefenseProfile;
  offenseProfile: OffenseProfile;
  defenseProfile: DefenseProfile;
  offenseQualities: Quality[];
  defenseQualities: DefenseQuality[];
};

export type CampResult = {
  franchiseId: number;
  frontOfficeGrade: Grade;
  offenseQualities: Quality[];
  defenseQualities: DefenseQuality[];
  pointsLeft: number;
};

// Steps 1 to 6 for the whole league. `points` is what the off-season left each
// team; the base Franchise Points for its new front office grade are added.
export function runTrainingCamp(
  teams: CampTeam[],
  rng: Rng,
): { results: CampResult[]; log: CampLogEntry[] } {
  const draft = openDraft(teams, rng);
  const log: CampLogEntry[] = [];
  const say = (step: CampStep, franchiseId: number | null, message: string) =>
    log.push({ step, franchiseId, message });

  const grades = teams.map((team, index) => {
    const card = draft.cards[index];
    card.offense = { profile: team.offenseProfile, qualities: [...team.offenseQualities] };
    card.defense = { profile: team.defenseProfile, qualities: [...team.defenseQualities] };
    const { change, grade } = adjustFrontOffice(
      team.frontOfficeGrade,
      { offense: team.previousOffense, defense: team.previousDefense },
      { offense: team.offenseProfile, defense: team.defenseProfile },
    );
    say(
      "camp-front-office",
      team.franchiseId,
      `${team.teamName}: offense ${team.previousOffense} to ${team.offenseProfile}, defense ` +
        `${team.previousDefense} to ${team.defenseProfile}. ` +
        `${change === 0 ? "No change" : `Net ${change > 0 ? "+" : ""}${change}`}, ` +
        `Front Office Grade ${team.frontOfficeGrade} to ${grade}.`,
    );
    return grade;
  });

  say("camp-qv-cdv", null, `${teams.length} teams: QV ${draft.qv}, CDV ${draft.cdv}.`);

  draft.cards.forEach((card, index) => {
    const added = basePoints(grades[index], card.headCoachGrade);
    card.points += added;
    say(
      "camp-points",
      card.franchiseId,
      `${card.teamName}: Front Office ${grades[index]} and Head Coach ${card.headCoachGrade}, ` +
        `${added} FP added, ${card.points} FP.`,
    );
  });

  draftRemainingQualities(draft);
  draftEfficiency(draft, ["D", "F"]);
  draftRemainingDefenseQualities(draft);

  for (const entry of draft.log) {
    const step = CAMP_KEY[entry.step];
    if (step) say(step, entry.franchiseId, entry.message);
  }

  return {
    results: draft.cards.map((card, index) => ({
      franchiseId: card.franchiseId,
      frontOfficeGrade: grades[index],
      offenseQualities: inPairOrder(card.offense.qualities),
      defenseQualities: inDefensePairOrder(card.defense.qualities),
      pointsLeft: card.points,
    })),
    log,
  };
}
