import type { ReactNode } from "react";
import type { DivisionDetail, LeagueDetail } from "@/lib/leagues";
import type { Team } from "@/lib/teams";

type RenderTable = (caption: string, teams: Team[]) => ReactNode;

function Division({
  division,
  teams,
  showCounts,
  children,
}: {
  division: DivisionDetail;
  teams: Team[];
  showCounts: boolean;
  children: RenderTable;
}) {
  const members = teams.filter((team) => team.divisionId === division.id);
  return (
    <div className="mt-4">
      <p className="flex justify-between">
        <span className="font-medium">{division.name}</span>
        {showCounts && <span className="text-muted">{division.teamCount} teams</span>}
      </p>
      {children(division.name, members)}
    </div>
  );
}

// Lays a league's teams out under its conferences and divisions, or as one
// table when it has neither. `children` renders the table for one group.
export function LeagueGroups({
  league,
  teams,
  showCounts = false,
  children,
}: {
  league: LeagueDetail;
  teams: Team[];
  showCounts?: boolean;
  children: RenderTable;
}) {
  if (league.conferences.length === 0 && league.divisions.length === 0) {
    return <>{children(league.name, teams)}</>;
  }

  return (
    <>
      {league.conferences.map((conference) => (
        <div key={conference.id} className="mt-6">
          <h3 className="text-base font-semibold">{conference.name}</h3>
          {conference.divisions.map((division) => (
            <Division
              key={division.id}
              division={division}
              teams={teams}
              showCounts={showCounts}
            >
              {children}
            </Division>
          ))}
        </div>
      ))}
      {league.divisions.map((division) => (
        <Division key={division.id} division={division} teams={teams} showCounts={showCounts}>
          {children}
        </Division>
      ))}
    </>
  );
}
