import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isCardTeam } from "@/lib/cards";
import { getDb } from "@/lib/db";
import { getLeague } from "@/lib/leagues";
import { listTeams } from "@/lib/teams";
import { LeagueGroups } from "../league-groups";
import { TeamCard } from "./team-card";

async function LeagueCards({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  if (!/^\d+$/.test(leagueId)) notFound();
  const league = getLeague(getDb(), Number(leagueId));
  if (!league) notFound();

  const teams = listTeams(getDb(), league.id).filter(isCardTeam);
  const complete = teams.length > 0 && teams.length === league.teamCount;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/leagues/${league.id}`} className="text-link underline">
          {league.name}
        </Link>
      </p>
      <h1 className="text-2xl font-semibold">{league.name} team cards</h1>

      {league.status === "setup" && (
        <p className="mt-4 text-muted">Generate this league to see its cards.</p>
      )}
      {league.status !== "setup" && !complete && (
        <p className="mt-4 text-muted">
          Re-roll this league to complete its draft, then view its cards.
        </p>
      )}
      {league.status === "draft" && complete && (
        <p className="mt-4 text-muted">This league is a draft. Its cards may change.</p>
      )}

      {league.status !== "setup" && complete && (
        <LeagueGroups league={league} teams={teams}>
          {(caption, members) => (
            <ul aria-label={`${caption} cards`} className="mt-3 grid gap-4 sm:grid-cols-2">
              {members.filter(isCardTeam).map((team) => (
                <li key={team.id} className="border border-border">
                  <TeamCard team={team} seasonLabel={league.seasonLabel} />
                </li>
              ))}
            </ul>
          )}
        </LeagueGroups>
      )}
    </>
  );
}

export default function CardsPage({ params }: PageProps<"/leagues/[leagueId]/cards">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading cards...</p>}>
      <LeagueCards params={params} />
    </Suspense>
  );
}
