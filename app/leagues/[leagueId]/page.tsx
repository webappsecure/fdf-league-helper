import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { getLeague, type DivisionDetail } from "@/lib/leagues";
import { DeleteLeague } from "./delete-league";

function DivisionList({ divisions }: { divisions: DivisionDetail[] }) {
  return (
    <ul className="mt-1 space-y-1">
      {divisions.map((division) => (
        <li key={division.id} className="flex justify-between border-b border-zinc-200 py-1">
          <span>{division.name}</span>
          <span className="text-zinc-600">{division.teamCount} teams</span>
        </li>
      ))}
    </ul>
  );
}

async function LeagueDetails({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  if (!/^\d+$/.test(leagueId)) notFound();
  const league = getLeague(getDb(), Number(leagueId));
  if (!league) notFound();

  const hasStructure = league.conferences.length > 0 || league.divisions.length > 0;

  return (
    <>
      <h1 className="text-2xl font-semibold">{league.name}</h1>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        <dt className="text-zinc-600">Season</dt>
        <dd>{league.seasonLabel}</dd>
        <dt className="text-zinc-600">Teams</dt>
        <dd>{league.teamCount}</dd>
        <dt className="text-zinc-600">Extra point kick</dt>
        <dd>{league.xpKickDistance}-yard line</dd>
      </dl>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Structure</h2>
        {!hasStructure && (
          <p className="mt-1 text-zinc-600">
            {league.teamCount} teams with no conferences or divisions.
          </p>
        )}
        {league.conferences.map((conference) => (
          <div key={conference.id} className="mt-4">
            <h3 className="font-medium">{conference.name}</h3>
            <DivisionList divisions={conference.divisions} />
          </div>
        ))}
        {league.divisions.length > 0 && <DivisionList divisions={league.divisions} />}
      </section>

      <section className="mt-10 border-t border-zinc-200 pt-6">
        <DeleteLeague leagueId={league.id} name={league.name} />
      </section>
    </>
  );
}

export default function LeaguePage({ params }: PageProps<"/leagues/[leagueId]">) {
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/" className="text-blue-700 underline">
          All leagues
        </Link>
      </p>
      <Suspense fallback={<p className="text-zinc-600">Loading league...</p>}>
        <LeagueDetails params={params} />
      </Suspense>
    </>
  );
}
