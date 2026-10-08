import type { DivisionDetail, LeagueDetail } from "@/lib/leagues";
import type { Team } from "@/lib/teams";
import { FillTeams } from "./fill-teams";
import { ColorsCell, TextCell } from "./identity-cell";

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

function Division({ division, teams }: { division: DivisionDetail; teams: Team[] }) {
  const members = teams.filter((team) => team.divisionId === division.id);
  return (
    <div className="mt-4">
      <p className="flex justify-between">
        <span className="font-medium">{division.name}</span>
        <span className="text-muted">{division.teamCount} teams</span>
      </p>
      <TeamTable caption={`${division.name} teams`} teams={members} />
    </div>
  );
}

export function TeamTables({ league, teams }: { league: LeagueDetail; teams: Team[] }) {
  if (teams.length === 0) {
    return (
      <div className="mt-1">
        <p className="text-muted">This league has no teams yet.</p>
        <FillTeams leagueId={league.id} />
      </div>
    );
  }

  const hasStructure = league.conferences.length > 0 || league.divisions.length > 0;
  if (!hasStructure) {
    return (
      <>
        <p className="mt-1 text-muted">
          {league.teamCount} teams with no conferences or divisions.
        </p>
        <TeamTable caption={`${league.name} teams`} teams={teams} />
      </>
    );
  }

  return (
    <>
      {league.conferences.map((conference) => (
        <div key={conference.id} className="mt-6">
          <h3 className="text-base font-semibold">{conference.name}</h3>
          {conference.divisions.map((division) => (
            <Division key={division.id} division={division} teams={teams} />
          ))}
        </div>
      ))}
      {league.divisions.map((division) => (
        <Division key={division.id} division={division} teams={teams} />
      ))}
    </>
  );
}
