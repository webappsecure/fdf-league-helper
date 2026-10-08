import type { Rng } from "@/lib/dice";
import type { XpKickDistance } from "@/lib/league-setup";
import { defenseResults, runDefenseDraft, type DefenseResult } from "@/lib/rules/defense";
import {
  DRAFT_STEPS,
  DRAFT_STEP_HEADINGS,
  openDraft,
  type SpecialTeams,
} from "@/lib/rules/draft";
import {
  STEPS,
  STEP_HEADINGS,
  rollManagement,
  type Management,
  type ManagementInput,
} from "@/lib/rules/management";
import { draftResults, runOffenseDraft, type OffenseResult } from "@/lib/rules/offense";
import { rollSpecialTeams } from "@/lib/rules/special-teams";

// Every step of league generation, in the order it runs and is shown.
export const GENERATION_STEPS = [...STEPS, ...DRAFT_STEPS] as const;
export type GenerationStep = (typeof GENERATION_STEPS)[number];

export const GENERATION_STEP_HEADINGS: Record<GenerationStep, string> = {
  ...STEP_HEADINGS,
  ...DRAFT_STEP_HEADINGS,
};

export type GenerationLogEntry = {
  step: GenerationStep;
  franchiseId: number | null;
  message: string;
};

export type GeneratedTeam = Management &
  Pick<OffenseResult, "offenseProfile" | "offenseQualities"> &
  Omit<DefenseResult, "franchiseId"> &
  SpecialTeams;

// CE "Create A New League" steps 3 to 14 from one random source: the
// management rolls, then the inaugural draft, which spends the Franchise
// Points the management rolls produced. Points left at the end are lost.
export function generateSeason(
  teams: ManagementInput[],
  rng: Rng,
  xpKickDistance: XpKickDistance,
): { teams: GeneratedTeam[]; log: GenerationLogEntry[] } {
  const management = rollManagement(teams, rng);
  const draft = openDraft(
    management.teams.map((team, index) => ({
      franchiseId: team.franchiseId,
      teamName: teams[index].teamName,
      headCoachGrade: team.headCoachGrade,
      points: team.basePoints,
    })),
    rng,
  );
  runOffenseDraft(draft);
  runDefenseDraft(draft);
  rollSpecialTeams(draft, xpKickDistance);

  const offense = draftResults(draft);
  const defense = defenseResults(draft);
  return {
    teams: management.teams.map((team, index) => ({
      ...team,
      offenseProfile: offense[index].offenseProfile,
      offenseQualities: offense[index].offenseQualities,
      defenseProfile: defense[index].defenseProfile,
      defenseQualities: defense[index].defenseQualities,
      ...draft.cards[index].specialTeams!,
    })),
    log: [...management.log, ...draft.log],
  };
}
