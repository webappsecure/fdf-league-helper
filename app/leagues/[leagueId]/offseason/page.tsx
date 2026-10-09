import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { getLeague } from "@/lib/leagues";
import { getOffseasonPlan } from "@/lib/offseason-plan";
import { listTeams } from "@/lib/teams";
import { PlanTables } from "./plan-table";

async function PlanDetails({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  if (!/^\d+$/.test(leagueId)) notFound();
  const league = getLeague(getDb(), Number(leagueId));
  if (!league) notFound();

  const back = (
    <Link href={`/leagues/${league.id}`} className="text-link underline">
      Back to the league
    </Link>
  );

  if (league.status !== "accepted") {
    return (
      <>
        <h1 className="text-2xl font-semibold">Expansion and contraction</h1>
        <p className="mt-6">Accept this league first. {back}</p>
      </>
    );
  }

  const teams = listTeams(getDb(), league.id);
  const plan = getOffseasonPlan(getDb(), league.id);
  const leaving = plan.removedTeamIds.length;

  return (
    <>
      <h1 className="text-2xl font-semibold">Expansion and contraction</h1>
      <p className="mt-1 text-muted">
        {league.name}, {league.seasonLabel}. {back}
      </p>
      <p className="mt-4 text-muted">
        Changes are saved as a plan for the next off-season. This season&apos;s teams and cards are
        not changed.
      </p>
      <p role="status" className="mt-4 font-medium">
        Planned teams: {plan.plannedTeamCount} ({teams.length} now, {plan.expansionTeams.length}{" "}
        new, {leaving} leaving)
      </p>
      <PlanTables league={league} teams={teams} plan={plan} />
    </>
  );
}

export default function OffseasonPage({ params }: PageProps<"/leagues/[leagueId]/offseason">) {
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/" className="text-link underline">
          All leagues
        </Link>
      </p>
      <Suspense fallback={<p className="text-muted">Loading plan...</p>}>
        <PlanDetails params={params} />
      </Suspense>
    </>
  );
}
