import type { LeagueDetail } from "@/lib/leagues";
import { PROFILE_LABELS, qualityLabel } from "@/lib/reference/offense-tables";
import type { Team } from "@/lib/teams";
import { LeagueGroups } from "./league-groups";

const COLUMNS = ["Team", "Profile", "Qualities"];

function OffenseTable({ caption, teams }: { caption: string; teams: Team[] }) {
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
        {teams.map((team) => {
          const qualities = team.offenseQualities ?? [];
          return (
            <tr key={team.id} className="border-b border-border">
              <th scope="row" className="py-1 pr-2 text-left font-normal">
                {team.city} {team.nickname}
              </th>
              <td className="py-1 pr-2">
                {team.offenseProfile && PROFILE_LABELS[team.offenseProfile]}
              </td>
              <td className="py-1 pr-2">
                {qualities.length > 0 ? qualities.map(qualityLabel).join(", ") : "None"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function OffenseTables({ league, teams }: { league: LeagueDetail; teams: Team[] }) {
  return (
    <LeagueGroups league={league} teams={teams}>
      {(caption, members) => <OffenseTable caption={`${caption} offense`} teams={members} />}
    </LeagueGroups>
  );
}
