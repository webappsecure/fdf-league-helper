import type { ReactNode } from "react";
import { GROUP_NAME_MAX, type GroupKind } from "@/lib/league-setup";
import type { DivisionDetail, LeagueDetail } from "@/lib/leagues";
import type { Team } from "@/lib/teams";
import { renameGroupAction } from "./actions";
import { LeagueTextField } from "./league-text-field";

type RenderTable = (caption: string, teams: Team[]) => ReactNode;

// A conference or division name: text, or an input when the page lets it be
// renamed. A division in a conference is labelled with the conference too,
// since two conferences often both have an East.
function GroupName({
  kind,
  id,
  name,
  conferenceName,
  editable,
}: {
  kind: GroupKind;
  id: number;
  name: string;
  conferenceName?: string;
  editable: boolean;
}) {
  if (!editable) return name;
  return (
    <LeagueTextField
      action={renameGroupAction.bind(null, kind, id)}
      value={name}
      label={`${conferenceName ? `${conferenceName} ` : ""}${name} ${kind} name`}
      max={GROUP_NAME_MAX}
    />
  );
}

function Division({
  division,
  conferenceName,
  teams,
  showCounts,
  editable,
  children,
}: {
  division: DivisionDetail;
  conferenceName?: string;
  teams: Team[];
  showCounts: boolean;
  editable: boolean;
  children: RenderTable;
}) {
  const members = teams.filter((team) => team.divisionId === division.id);
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium">
          <GroupName
            kind="division"
            id={division.id}
            name={division.name}
            conferenceName={conferenceName}
            editable={editable}
          />
        </span>
        {showCounts && <span className="text-muted">{division.teamCount} teams</span>}
      </div>
      {children(division.name, members)}
    </div>
  );
}

// Lays a league's teams out under its conferences and divisions, or as one
// table when it has neither. `children` renders the table for one group. With
// `editable`, the group names are inputs that rename them.
export function LeagueGroups({
  league,
  teams,
  showCounts = false,
  editable = false,
  children,
}: {
  league: LeagueDetail;
  teams: Team[];
  showCounts?: boolean;
  editable?: boolean;
  children: RenderTable;
}) {
  if (league.conferences.length === 0 && league.divisions.length === 0) {
    return <>{children(league.name, teams)}</>;
  }

  return (
    <>
      {league.conferences.map((conference) => (
        <div key={conference.id} className="mt-6">
          <h3 className="text-base font-semibold">
            <GroupName
              kind="conference"
              id={conference.id}
              name={conference.name}
              editable={editable}
            />
          </h3>
          {conference.divisions.map((division) => (
            <Division
              key={division.id}
              division={division}
              conferenceName={conference.name}
              teams={teams}
              showCounts={showCounts}
              editable={editable}
            >
              {children}
            </Division>
          ))}
        </div>
      ))}
      {league.divisions.map((division) => (
        <Division
          key={division.id}
          division={division}
          teams={teams}
          showCounts={showCounts}
          editable={editable}
        >
          {children}
        </Division>
      ))}
    </>
  );
}
