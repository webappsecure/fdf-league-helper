import type { LeagueDetail } from "@/lib/leagues";
import { DEFENSE_PROFILE_LABELS } from "@/lib/reference/defense-tables";
import { PROFILE_LABELS } from "@/lib/reference/offense-tables";
import { qualityLabel } from "@/lib/reference/profile-tables";
import type { Team } from "@/lib/teams";
import { LeagueGroups } from "./league-groups";

const COLUMNS = ["Team", "Profile", "Qualities"];

type Side = "offense" | "defense";

function ProfileTable({ caption, teams, side }: { caption: string; teams: Team[]; side: Side }) {
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
          const profile =
            side === "offense"
              ? team.offenseProfile && PROFILE_LABELS[team.offenseProfile]
              : team.defenseProfile && DEFENSE_PROFILE_LABELS[team.defenseProfile];
          const qualities =
            (side === "offense" ? team.offenseQualities : team.defenseQualities) ?? [];
          return (
            <tr key={team.id} className="border-b border-border">
              <th scope="row" className="py-1 pr-2 text-left font-normal">
                {team.city} {team.nickname}
              </th>
              <td className="py-1 pr-2">{profile}</td>
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

// The profile and qualities of every team on one side of the ball.
export function ProfileTables({
  league,
  teams,
  side,
}: {
  league: LeagueDetail;
  teams: Team[];
  side: Side;
}) {
  return (
    <LeagueGroups league={league} teams={teams}>
      {(caption, members) => (
        <ProfileTable caption={`${caption} ${side}`} teams={members} side={side} />
      )}
    </LeagueGroups>
  );
}
