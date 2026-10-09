import { DEFENSE_PROFILE_LABELS } from "@/lib/reference/defense-tables";
import { basePoints } from "@/lib/reference/management-tables";
import { PROFILE_LABELS } from "@/lib/reference/offense-tables";
import { qualityLabel, type Quality } from "@/lib/reference/profile-tables";
import { resultLabel } from "@/lib/reference/special-teams-tables";
import type { SeasonStatus } from "@/lib/leagues";
import type { Team } from "@/lib/teams";

export type LeagueView = "summary" | "detail";

// A draft opens on the detailed view, where it is re-rolled and accepted; an
// accepted season opens on the summary. A league that has not been generated
// has nothing to summarise.
export function resolveView(
  param: string | string[] | undefined,
  status: SeasonStatus,
): LeagueView {
  if (status === "setup") return "detail";
  if (param === "summary" || param === "detail") return param;
  return status === "accepted" ? "summary" : "detail";
}

// What one team's summary panel prints, as text. A null part has not been
// drafted yet.
export type TeamSummary = {
  name: string;
  coach: string;
  primaryColor: string;
  secondaryColor: string;
  offenseTag: string | null;
  ownership: string;
  frontOfficeGrade: string | null;
  headCoachGrade: string | null;
  baseFranchisePoints: string | null;
  // The profile first, then each quality, one entry per line.
  offense: string[] | null;
  defense: string[] | null;
  kickReturn: string | null;
  puntReturn: string | null;
  fgRange: string | null;
  xpRange: string | null;
};

function describe(profile: string | null, qualities: Quality[] | null): string[] | null {
  if (profile === null) return null;
  return [profile, ...(qualities ?? []).map(qualityLabel)];
}

export function teamSummary(team: Team): TeamSummary {
  const ownership = [team.ownershipStyle, team.ownershipLoyalty].filter(Boolean);
  const graded = team.frontOfficeGrade !== null && team.headCoachGrade !== null;
  // A generated team with no return quality has none; before generation the
  // special teams are not drafted at all.
  const drafted = team.fgRange !== null;
  return {
    name: `${team.city} ${team.nickname}`,
    coach: team.headCoachName,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
    offenseTag: team.offenseTag,
    ownership: ownership.length > 0 ? ownership.join(", ") : "None",
    frontOfficeGrade: team.frontOfficeGrade,
    headCoachGrade: team.headCoachGrade,
    baseFranchisePoints: graded
      ? String(basePoints(team.frontOfficeGrade!, team.headCoachGrade!))
      : null,
    offense: describe(
      team.offenseProfile && PROFILE_LABELS[team.offenseProfile],
      team.offenseQualities,
    ),
    defense: describe(
      team.defenseProfile && DEFENSE_PROFILE_LABELS[team.defenseProfile],
      team.defenseQualities,
    ),
    kickReturn: drafted ? (team.kickReturn ? resultLabel(team.kickReturn) : "None") : null,
    puntReturn: drafted ? (team.puntReturn ? resultLabel(team.puntReturn) : "None") : null,
    fgRange: team.fgRange,
    xpRange: team.xpRange,
  };
}
