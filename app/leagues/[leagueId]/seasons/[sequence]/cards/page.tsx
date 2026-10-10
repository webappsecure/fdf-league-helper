import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { getSeasonLeague } from "@/lib/leagues";
import { listSeasonTeams } from "@/lib/teams";
import { SeasonCards } from "../../../cards/season-cards";

async function PastCards({ params }: { params: Promise<{ leagueId: string; sequence: string }> }) {
  const { leagueId, sequence } = await params;
  if (!/^\d+$/.test(leagueId) || !/^\d+$/.test(sequence)) notFound();
  const season = getSeasonLeague(getDb(), Number(leagueId), Number(sequence));
  if (!season) notFound();

  return (
    <SeasonCards
      league={season}
      teams={listSeasonTeams(getDb(), season.seasonId)}
      back={{
        href: `/leagues/${season.id}/seasons/${season.sequence}`,
        label: season.seasonLabel,
      }}
    />
  );
}

export default function PastCardsPage({
  params,
}: PageProps<"/leagues/[leagueId]/seasons/[sequence]/cards">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading cards...</p>}>
      <PastCards params={params} />
    </Suspense>
  );
}
