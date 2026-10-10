import type { LeagueDetail } from "@/lib/leagues";
import type { TeamResult } from "@/lib/results";
import type { Team } from "@/lib/teams";
import { LeagueGroups } from "../../league-groups";

// End-of-season records, one table per division. Playoff and champion status is
// written out, not only colored.
export function SeasonResults({
  league,
  teams,
  results,
}: {
  league: LeagueDetail;
  teams: Team[];
  results: TeamResult[];
}) {
  const byTeam = new Map(results.map((result) => [result.teamId, result]));
  return (
    <LeagueGroups league={league} teams={teams}>
      {(caption, members) => (
        <table aria-label={`${caption} results`} className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-1 pr-3 font-medium">
                Team
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                W
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                L
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                T
              </th>
              <th scope="col" className="py-1 font-medium">
                Postseason
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((team) => {
              const result = byTeam.get(team.id);
              return (
                <tr key={team.id} className="border-b border-border">
                  <th scope="row" className="py-1 pr-3 font-normal">
                    {team.city} {team.nickname}
                  </th>
                  <td className="py-1 pr-3">{result?.wins ?? "-"}</td>
                  <td className="py-1 pr-3">{result?.losses ?? "-"}</td>
                  <td className="py-1 pr-3">{result?.ties ?? "-"}</td>
                  <td className="py-1">
                    {result?.isChampion ? "Champion" : result?.madePlayoffs ? "Playoffs" : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </LeagueGroups>
  );
}
