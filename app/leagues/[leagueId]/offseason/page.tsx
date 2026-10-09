import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { getLeague } from "@/lib/leagues";
import { getOffseasonDraft } from "@/lib/offseason";
import { getOffseasonPlan } from "@/lib/offseason-plan";
import { listTeams } from "@/lib/teams";
import { ActionButton } from "../action-button";
import { startOffseasonAction } from "../actions";
import { DraftView } from "./draft-view";
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

  const draft = getOffseasonDraft(getDb(), league.id);
  if (draft) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Off-season</h1>
        <p className="mt-1 text-muted">
          {league.name}, {league.seasonLabel}. {back}
        </p>
        <p className="mt-4 text-muted">
          The plan and the season results are locked while the off-season draft exists. Discard it
          to change them.
        </p>
        <DraftView leagueId={league.id} draft={draft} />
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

      <section aria-labelledby="start-heading" className="mt-8">
        <h2 id="start-heading" className="text-xl font-semibold">
          Start the off-season
        </h2>
        <p className="mt-1 text-muted">
          Adjusts the coaches, runs the coaching carousel and awards Franchise Points, and applies
          this plan. It needs the{" "}
          <Link href={`/leagues/${league.id}/results`} className="text-link underline">
            season results
          </Link>
          .
        </p>
        <ActionButton
          action={startOffseasonAction.bind(null, league.id)}
          label="Start off-season"
          pendingLabel="Starting..."
        />
      </section>
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
