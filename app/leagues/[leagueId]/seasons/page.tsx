import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { getLeague, listAcceptedSeasons } from "@/lib/leagues";

async function SeasonList({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  if (!/^\d+$/.test(leagueId)) notFound();
  const league = getLeague(getDb(), Number(leagueId));
  if (!league) notFound();
  const seasons = listAcceptedSeasons(getDb(), league.id);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/leagues/${league.id}`} className="text-link underline">
          {league.name}
        </Link>
      </p>
      <h1 className="text-2xl font-semibold">{league.name} season history</h1>
      {seasons.length === 0 ? (
        <p className="mt-4 text-muted">No season of this league has been accepted yet.</p>
      ) : (
        <ul aria-label="Seasons" className="mt-4 space-y-2">
          {seasons.map((season) => (
            <li key={season.sequence}>
              <Link
                href={`/leagues/${league.id}/seasons/${season.sequence}`}
                className="font-medium text-link underline"
              >
                {season.label}
              </Link>
              <span className="text-muted">
                {" "}
                (season {season.sequence}
                {season.isCurrent ? ", current" : ""})
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function SeasonsPage({ params }: PageProps<"/leagues/[leagueId]/seasons">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading seasons...</p>}>
      <SeasonList params={params} />
    </Suspense>
  );
}
