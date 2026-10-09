import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { getLeague } from "@/lib/leagues";
import { getSeasonResults, MAX_GAMES } from "@/lib/results";
import { listTeams } from "@/lib/teams";
import { ResultsForm } from "./results-form";

async function ResultsDetails({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  if (!/^\d+$/.test(leagueId)) notFound();
  const league = getLeague(getDb(), Number(leagueId));
  if (!league) notFound();

  return (
    <>
      <h1 className="text-2xl font-semibold">End-of-season results</h1>
      <p className="mt-1 text-muted">
        {league.name}, {league.seasonLabel}
      </p>
      {league.status !== "accepted" ? (
        <p className="mt-6">
          Accept this league before entering results.{" "}
          <Link href={`/leagues/${league.id}`} className="text-link underline">
            Back to the league
          </Link>
        </p>
      ) : (
        <ResultsForm
          league={league}
          teams={listTeams(getDb(), league.id)}
          saved={getSeasonResults(getDb(), league.id)}
          maxGames={MAX_GAMES}
        />
      )}
    </>
  );
}

export default function ResultsPage({ params }: PageProps<"/leagues/[leagueId]/results">) {
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/" className="text-link underline">
          All leagues
        </Link>
      </p>
      <Suspense fallback={<p className="text-muted">Loading results...</p>}>
        <ResultsDetails params={params} />
      </Suspense>
    </>
  );
}
