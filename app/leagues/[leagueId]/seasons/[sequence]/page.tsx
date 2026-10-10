import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { getSeasonLeague } from "@/lib/leagues";
import { OFFSEASON_STEPS, OFFSEASON_STEP_HEADINGS } from "@/lib/offseason";
import { getResultsBySeason } from "@/lib/results";
import { getRunBySeason } from "@/lib/runs";
import { listSeasonTeams } from "@/lib/teams";
import { RunLog } from "../../run-log";
import { TeamSummaries } from "../../team-summary";
import { SeasonResults } from "./season-results";

async function SeasonDetails({
  params,
}: {
  params: Promise<{ leagueId: string; sequence: string }>;
}) {
  const { leagueId, sequence } = await params;
  if (!/^\d+$/.test(leagueId) || !/^\d+$/.test(sequence)) notFound();
  const season = getSeasonLeague(getDb(), Number(leagueId), Number(sequence));
  if (!season) notFound();

  const teams = listSeasonTeams(getDb(), season.seasonId);
  const results = getResultsBySeason(getDb(), season.seasonId);
  const run = getRunBySeason(getDb(), season.seasonId);
  const champion = teams.find((team) => results.some((r) => r.teamId === team.id && r.isChampion));

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/leagues/${season.id}/seasons`} className="text-link underline">
          Season history
        </Link>
      </p>
      <h1 className="text-2xl font-semibold">
        {season.name}, {season.seasonLabel}
      </h1>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        <dt className="text-muted">Teams</dt>
        <dd>{season.teamCount}</dd>
        <dt className="text-muted">Extra point kick</dt>
        <dd>{season.xpKickDistance}-yard line</dd>
        <dt className="text-muted">Champion</dt>
        <dd>{champion ? `${champion.city} ${champion.nickname}` : "Not entered"}</dd>
      </dl>
      <p className="mt-4">
        <Link
          href={`/leagues/${season.id}/seasons/${season.sequence}/cards`}
          className="font-medium text-link underline"
        >
          View team cards
        </Link>
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Results</h2>
        {results.length === 0 ? (
          <p className="mt-2 text-muted">No results were entered for this season.</p>
        ) : (
          <SeasonResults league={season} teams={teams} results={results} />
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Teams</h2>
        <TeamSummaries league={season} teams={teams} readOnly />
      </section>

      {run && (
        <section className="mt-8">
          {run.kind === "offseason" ? (
            <>
              <h2 className="text-lg font-semibold">Off-season log</h2>
              <RunLog
                entries={run.entries}
                steps={OFFSEASON_STEPS}
                headings={OFFSEASON_STEP_HEADINGS}
              />
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold">Generation log</h2>
              <RunLog entries={run.entries} />
            </>
          )}
        </section>
      )}
    </>
  );
}

export default function SeasonPage({
  params,
}: PageProps<"/leagues/[leagueId]/seasons/[sequence]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading season...</p>}>
      <SeasonDetails params={params} />
    </Suspense>
  );
}
