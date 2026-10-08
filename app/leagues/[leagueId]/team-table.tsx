import type { LeagueDetail } from "@/lib/leagues";
import type { Team } from "@/lib/teams";
import { ActionButton } from "./action-button";
import { fillTeamsAction } from "./actions";
import { ColorsCell, TextCell } from "./identity-cell";
import { LeagueGroups } from "./league-groups";

function TeamTable({ caption, teams }: { caption: string; teams: Team[] }) {
  return (
    <table className="mt-2 w-full border-collapse text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-border-strong text-left">
          <th scope="col" className="py-1 pr-2 font-medium">
            City
          </th>
          <th scope="col" className="py-1 pr-2 font-medium">
            Nickname
          </th>
          <th scope="col" className="py-1 pr-2 font-medium">
            Head coach
          </th>
          <th scope="col" className="py-1 font-medium">
            Colors
          </th>
        </tr>
      </thead>
      <tbody>
        {teams.map((team) => {
          const name = `${team.city} ${team.nickname}`;
          return (
            <tr key={team.id} className="border-b border-border align-top">
              <td className="py-1 pr-2">
                <TextCell teamId={team.id} field="city" value={team.city} teamName={name} />
              </td>
              <td className="py-1 pr-2">
                <TextCell
                  teamId={team.id}
                  field="nickname"
                  value={team.nickname}
                  teamName={name}
                />
              </td>
              <td className="py-1 pr-2">
                <TextCell
                  teamId={team.id}
                  field="headCoachName"
                  value={team.headCoachName}
                  teamName={name}
                />
              </td>
              <td className="py-1">
                <ColorsCell
                  teamId={team.id}
                  primaryColor={team.primaryColor}
                  secondaryColor={team.secondaryColor}
                  teamName={name}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function TeamTables({ league, teams }: { league: LeagueDetail; teams: Team[] }) {
  if (teams.length === 0) {
    return (
      <div className="mt-1">
        <p className="text-muted">This league has no teams yet.</p>
        <ActionButton
          action={fillTeamsAction.bind(null, league.id)}
          label="Fill in teams"
          pendingLabel="Filling in teams..."
        />
      </div>
    );
  }

  const hasStructure = league.conferences.length > 0 || league.divisions.length > 0;
  return (
    <>
      {!hasStructure && (
        <p className="mt-1 text-muted">
          {league.teamCount} teams with no conferences or divisions.
        </p>
      )}
      <LeagueGroups league={league} teams={teams} showCounts>
        {(caption, members) => <TeamTable caption={`${caption} teams`} teams={members} />}
      </LeagueGroups>
    </>
  );
}
