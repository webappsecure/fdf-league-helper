import type { LeagueDetail } from "@/lib/leagues";
import { resultLabel } from "@/lib/reference/special-teams-tables";
import type { Team } from "@/lib/teams";
import { LeagueGroups } from "./league-groups";

const COLUMNS = ["Team", "Kick return", "Punt return", "FG", "XP"];

function SpecialTeamsTable({ caption, teams }: { caption: string; teams: Team[] }) {
  return (
    <table className="mt-2 w-full border-collapse text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-border-strong text-left">
          {COLUMNS.map((column) => (
            <th key={column} scope="col" className="py-1 pr-2 font-medium">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {teams.map((team) => (
          <tr key={team.id} className="border-b border-border">
            <th scope="row" className="py-1 pr-2 text-left font-normal">
              {team.city} {team.nickname}
            </th>
            <td className="py-1 pr-2">{team.kickReturn ? resultLabel(team.kickReturn) : "None"}</td>
            <td className="py-1 pr-2">{team.puntReturn ? resultLabel(team.puntReturn) : "None"}</td>
            <td className="py-1 pr-2">{team.fgRange}</td>
            <td className="py-1 pr-2">{team.xpRange}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SpecialTeamsTables({ league, teams }: { league: LeagueDetail; teams: Team[] }) {
  return (
    <LeagueGroups league={league} teams={teams}>
      {(caption, members) => (
        <SpecialTeamsTable caption={`${caption} special teams`} teams={members} />
      )}
    </LeagueGroups>
  );
}
