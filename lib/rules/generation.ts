import type { Rng } from "@/lib/dice";
import {
  STEPS,
  STEP_HEADINGS,
  rollManagement,
  type Management,
  type ManagementInput,
} from "@/lib/rules/management";
import {
  OFFENSE_STEPS,
  OFFENSE_STEP_HEADINGS,
  draftOffense,
  type OffenseResult,
} from "@/lib/rules/offense";

// Every step of league generation, in the order it runs and is shown.
export const GENERATION_STEPS = [...STEPS, ...OFFENSE_STEPS] as const;
export type GenerationStep = (typeof GENERATION_STEPS)[number];

export const GENERATION_STEP_HEADINGS: Record<GenerationStep, string> = {
  ...STEP_HEADINGS,
  ...OFFENSE_STEP_HEADINGS,
};

export type GenerationLogEntry = { step: GenerationStep; franchiseId: number | null; message: string };

export type GeneratedTeam = Management & Omit<OffenseResult, "franchiseId">;

// CE "Create A New League" steps 3 to 11 from one random source: the
// management rolls, then the offense draft, which spends the Franchise Points
// the management rolls produced.
export function generateSeason(
  teams: ManagementInput[],
  rng: Rng,
): { teams: GeneratedTeam[]; log: GenerationLogEntry[] } {
  const management = rollManagement(teams, rng);
  const offense = draftOffense(
    management.teams.map((team, index) => ({
      franchiseId: team.franchiseId,
      teamName: teams[index].teamName,
      headCoachGrade: team.headCoachGrade,
      points: team.basePoints,
    })),
    rng,
  );

  return {
    teams: management.teams.map((team, index) => {
      const { offenseProfile, offenseQualities, pointsLeft } = offense.teams[index];
      return { ...team, offenseProfile, offenseQualities, pointsLeft };
    }),
    log: [...management.log, ...offense.log],
  };
}
