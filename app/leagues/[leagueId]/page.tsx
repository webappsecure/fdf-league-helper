import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { getLeague } from "@/lib/leagues";
import { getGenerationRun } from "@/lib/runs";
import { listTeams } from "@/lib/teams";
import { ActionButton } from "./action-button";
import { generateLeagueAction } from "./actions";
import { DeleteLeague } from "./delete-league";
import { ManagementTables } from "./management-table";
import { ProfileTables } from "./profile-table";
import { RunLog } from "./run-log";
import { SpecialTeamsTables } from "./special-teams-table";
import { TeamTables } from "./team-table";

async function LeagueDetails({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  if (!/^\d+$/.test(leagueId)) notFound();
  const league = getLeague(getDb(), Number(leagueId));
  if (!league) notFound();

  const teams = listTeams(getDb(), league.id);
  const run = getGenerationRun(getDb(), league.id);

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

      {!run && teams.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Generate league</h2>
          <p className="mt-1 text-muted">
            Rolls ownership, front office and head coach grades, and Franchise Points for
            every team, then drafts each team&apos;s offense, defense and special teams.
          </p>
          <ActionButton
            action={generateLeagueAction.bind(null, league.id)}
            label="Generate league"
            pendingLabel="Generating..."
          />
        </section>
      )}

      {run && (
        <>
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Management</h2>
            <ManagementTables league={league} teams={teams} />
          </section>
          {/* A league generated before the offense draft existed has none. */}
          {teams.some((team) => team.offenseProfile !== null) && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold">Offense</h2>
              <ProfileTables league={league} teams={teams} side="offense" />
            </section>
          )}
          {/* Nor does one generated before the rest of the draft existed. */}
          {teams.some((team) => team.defenseProfile !== null) && (
            <>
              <section className="mt-8">
                <h2 className="text-lg font-semibold">Defense</h2>
                <ProfileTables league={league} teams={teams} side="defense" />
              </section>
              <section className="mt-8">
                <h2 className="text-lg font-semibold">Special teams</h2>
                <SpecialTeamsTables league={league} teams={teams} />
              </section>
            </>
          )}
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Generation log</h2>
            <RunLog entries={run.entries} />
          </section>
        </>
      )}

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
