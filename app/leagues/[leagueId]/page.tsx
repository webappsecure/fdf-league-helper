import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { getLeague } from "@/lib/leagues";
import { listTeams } from "@/lib/teams";
import { DeleteLeague } from "./delete-league";
import { TeamTables } from "./team-table";

async function LeagueDetails({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  if (!/^\d+$/.test(leagueId)) notFound();
  const league = getLeague(getDb(), Number(leagueId));
  if (!league) notFound();

  const teams = listTeams(getDb(), league.id);

  return (
    <>
      <h1 className="text-2xl font-semibold">{league.name}</h1>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        <dt className="text-muted">Season</dt>
        <dd>{league.seasonLabel}</dd>
        <dt className="text-muted">Teams</dt>
        <dd>{league.teamCount}</dd>
        <dt className="text-muted">Extra point kick</dt>
        <dd>{league.xpKickDistance}-yard line</dd>
      </dl>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Teams</h2>
        <TeamTables league={league} teams={teams} />
      </section>

      <section className="mt-10 border-t border-border pt-6">
        <DeleteLeague leagueId={league.id} name={league.name} />
      </section>
    </>
  );
}

export default function LeaguePage({ params }: PageProps<"/leagues/[leagueId]">) {
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/" className="text-link underline">
          All leagues
        </Link>
      </p>
      <Suspense fallback={<p className="text-muted">Loading league...</p>}>
        <LeagueDetails params={params} />
      </Suspense>
    </>
  );
}
