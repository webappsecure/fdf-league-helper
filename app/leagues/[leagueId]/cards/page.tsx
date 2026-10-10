import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { getLeague } from "@/lib/leagues";
import { listTeams } from "@/lib/teams";
import { SeasonCards } from "./season-cards";

async function LeagueCards({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  if (!/^\d+$/.test(leagueId)) notFound();
  const league = getLeague(getDb(), Number(leagueId));
  if (!league) notFound();

  return (
    <SeasonCards
      league={league}
      teams={listTeams(getDb(), league.id)}
      back={{ href: `/leagues/${league.id}`, label: league.name }}
    />
  );
}

export default function CardsPage({ params }: PageProps<"/leagues/[leagueId]/cards">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading cards...</p>}>
      <LeagueCards params={params} />
    </Suspense>
  );
}
