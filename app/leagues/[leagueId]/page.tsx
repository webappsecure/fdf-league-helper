import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { LEAGUE_NAME_MAX, SEASON_LABEL_MAX } from "@/lib/league-setup";
import { getLeague, listAcceptedSeasons } from "@/lib/leagues";
import { OFFSEASON_STEPS, OFFSEASON_STEP_HEADINGS } from "@/lib/offseason";
import { getSeasonResults } from "@/lib/results";
import { getSeasonRun } from "@/lib/runs";
import { resolveView, type LeagueView } from "@/lib/summary";
import { listTeams } from "@/lib/teams";
import { AcceptLeague } from "./accept-league";
import { ActionButton } from "./action-button";
import { generateLeagueAction, rerollLeagueAction, updateLeagueTextAction } from "./actions";
import { DeleteLeague } from "./delete-league";
import { LeagueTextField } from "./league-text-field";
import { ManagementTables } from "./management-table";
import { ProfileTables } from "./profile-table";
import { RunLog } from "./run-log";
import { SpecialTeamsTables } from "./special-teams-table";
import { TeamSummaries } from "./team-summary";
import { TeamTables } from "./team-table";

function ViewToggle({ view }: { view: LeagueView }) {
  const links: { view: LeagueView; label: string }[] = [
    { view: "summary", label: "Summary" },
    { view: "detail", label: "Detailed" },
  ];
  return (
    <nav aria-label="Teams view" className="mt-6 flex gap-4">
      {links.map((link) => (
        <Link
          key={link.view}
          href={`?view=${link.view}`}
          aria-current={link.view === view ? "page" : undefined}
          className={
            link.view === view ? "font-semibold underline" : "text-link underline"
          }
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

async function LeagueDetails({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { leagueId } = await params;
  if (!/^\d+$/.test(leagueId)) notFound();
  const league = getLeague(getDb(), Number(leagueId));
  if (!league) notFound();

  const teams = listTeams(getDb(), league.id);
  const run = getSeasonRun(getDb(), league.id);
  const hasResults = getSeasonResults(getDb(), league.id).length > 0;
  const hasHistory = listAcceptedSeasons(getDb(), league.id).length > 1;
  const view = resolveView((await searchParams).view, league.status);

  return (
    <>
      <h1 className="text-2xl font-semibold">{league.name}</h1>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        <dt className="text-muted">League name</dt>
        <dd>
          <LeagueTextField
            action={updateLeagueTextAction.bind(null, league.id, "name")}
            value={league.name}
            label="League name"
            max={LEAGUE_NAME_MAX}
          />
        </dd>
        <dt className="text-muted">Season label</dt>
        <dd>
          <LeagueTextField
            action={updateLeagueTextAction.bind(null, league.id, "seasonLabel")}
            value={league.seasonLabel}
            label="Season label"
            max={SEASON_LABEL_MAX}
          />
        </dd>
        <dt className="text-muted">Teams</dt>
        <dd>{league.teamCount}</dd>
        <dt className="text-muted">Extra point kick</dt>
        <dd>{league.xpKickDistance}-yard line</dd>
      </dl>

      {league.status !== "setup" && <ViewToggle view={view} />}

      {view === "summary" ? (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Teams</h2>
          <TeamSummaries league={league} teams={teams} />
        </section>
      ) : (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Teams</h2>
          <TeamTables league={league} teams={teams} />
        </section>
      )}

      {league.status === "setup" && teams.length > 0 && (
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

      {league.status === "draft" && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Draft</h2>
          <p className="mt-1 text-muted">
            This league is a draft. Re-roll it as many times as you like, then accept it to
            make the season official.
          </p>
          <div className="flex flex-wrap items-start gap-3">
            <div>
              <ActionButton
                action={rerollLeagueAction.bind(null, league.id)}
                label="Re-roll league"
                pendingLabel="Re-rolling..."
              />
            </div>
            <div>
              <AcceptLeague leagueId={league.id} name={league.name} />
            </div>
          </div>
        </section>
      )}

      {league.status === "accepted" && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Accepted</h2>
          <p className="mt-1 text-muted">
            This season is official. Its results can no longer be re-rolled.
          </p>
          <p className="mt-3">
            <Link
              href={`/leagues/${league.id}/results`}
              className="font-medium text-link underline"
            >
              {hasResults ? "Edit end-of-season results" : "Enter end-of-season results"}
            </Link>
          </p>
          <p className="mt-2">
            <Link
              href={`/leagues/${league.id}/offseason`}
              className="font-medium text-link underline"
            >
              Plan expansion and contraction
            </Link>
          </p>
        </section>
      )}

      {league.status !== "setup" && (
        <p className="mt-6">
          <Link href={`/leagues/${league.id}/cards`} className="font-medium text-link underline">
            View team cards
          </Link>
        </p>
      )}

      {hasHistory && (
        <p className="mt-2">
          <Link href={`/leagues/${league.id}/seasons`} className="font-medium text-link underline">
            Season history
          </Link>
        </p>
      )}

      {run && view === "detail" && (
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
        </>
      )}

      <section className="mt-10 border-t border-border pt-6">
        <DeleteLeague leagueId={league.id} name={league.name} />
      </section>
    </>
  );
}

export default function LeaguePage({ params, searchParams }: PageProps<"/leagues/[leagueId]">) {
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/" className="text-link underline">
          All leagues
        </Link>
      </p>
      <Suspense fallback={<p className="text-muted">Loading league...</p>}>
        <LeagueDetails params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}
