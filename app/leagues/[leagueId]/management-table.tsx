import type { LeagueDetail } from "@/lib/leagues";
import { basePoints } from "@/lib/reference/management-tables";
import type { Team } from "@/lib/teams";
import { LeagueGroups } from "./league-groups";

const COLUMNS = ["Team", "Ownership", "Front office", "Head coach", "Base FP"];

function ManagementTable({ caption, teams }: { caption: string; teams: Team[] }) {
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
          const ownership = [team.ownershipStyle, team.ownershipLoyalty].filter(Boolean);
          const graded = team.frontOfficeGrade !== null && team.headCoachGrade !== null;
          return (
            <tr key={team.id} className="border-b border-border">
              <th scope="row" className="py-1 pr-2 text-left font-normal">
                {team.city} {team.nickname}
              </th>
              <td className="py-1 pr-2">{ownership.length > 0 ? ownership.join(", ") : "None"}</td>
              <td className="py-1 pr-2">{team.frontOfficeGrade}</td>
              <td className="py-1 pr-2">{team.headCoachGrade}</td>
              <td className="py-1 pr-2">
                {graded ? basePoints(team.frontOfficeGrade!, team.headCoachGrade!) : ""}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function ManagementTables({ league, teams }: { league: LeagueDetail; teams: Team[] }) {
  return (
    <LeagueGroups league={league} teams={teams}>
      {(caption, members) => (
        <ManagementTable caption={`${caption} management`} teams={members} />
      )}
    </LeagueGroups>
  );
}
