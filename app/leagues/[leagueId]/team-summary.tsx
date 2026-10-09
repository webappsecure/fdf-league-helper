import Link from "next/link";
import type { CSSProperties } from "react";
import type { LeagueDetail } from "@/lib/leagues";
import { teamSummary, type TeamSummary } from "@/lib/summary";
import type { Team } from "@/lib/teams";
import { LeagueGroups } from "./league-groups";

const NOT_DRAFTED = "Not drafted";

function Swatch({ color, label }: { color: string; label: string }) {
  // Team colors are data, so they reach the styles as a custom property.
  const style = { "--swatch": color } as CSSProperties;
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden="true"
        style={style}
        className="size-4 rounded-sm border border-border-strong bg-(--swatch)"
      />
      <span className="sr-only">{label} </span>
      {color}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// One entry per line: the profile, then each quality.
function Lines({ lines }: { lines: string[] | null }) {
  if (lines === null) return NOT_DRAFTED;
  return (
    <>
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </>
  );
}

// Under a conference heading (h3) a panel title is an h4; with none it follows
// the "Teams" h2 directly.
function Panel({ summary, Heading }: { summary: TeamSummary; Heading: "h3" | "h4" }) {
  const graded = summary.frontOfficeGrade !== null && summary.headCoachGrade !== null;
  const special = summary.fgRange !== null;
  return (
    <li className="rounded border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <Heading className="font-semibold">{summary.name}</Heading>
        <Link
          href="?view=detail"
          aria-label={`Edit ${summary.name} in the detailed view`}
          className="text-sm text-link underline"
        >
          Edit
        </Link>
      </div>
      <dl className="mt-2 space-y-1 text-sm">
        <Row label="Head coach">{summary.coach}</Row>
        <Row label="Colors">
          <span className="flex flex-wrap gap-x-3">
            <Swatch color={summary.primaryColor} label="Primary color" />
            <Swatch color={summary.secondaryColor} label="Secondary color" />
          </span>
        </Row>
        {summary.offenseTag !== null && <Row label="Offense tag">{summary.offenseTag}</Row>}
        <Row label="Ownership">{summary.ownership}</Row>
        <Row label="Front office">{summary.frontOfficeGrade ?? NOT_DRAFTED}</Row>
        <Row label="Head coach grade">{summary.headCoachGrade ?? NOT_DRAFTED}</Row>
        <Row label="Base FP">{graded ? summary.baseFranchisePoints : NOT_DRAFTED}</Row>
        <Row label="Offense">
          <Lines lines={summary.offense} />
        </Row>
        <Row label="Defense">
          <Lines lines={summary.defense} />
        </Row>
        <Row label="Kick return">{special ? summary.kickReturn : NOT_DRAFTED}</Row>
        <Row label="Punt return">{special ? summary.puntReturn : NOT_DRAFTED}</Row>
        <Row label="FG range">{summary.fgRange ?? NOT_DRAFTED}</Row>
        <Row label="XP range">{summary.xpRange ?? NOT_DRAFTED}</Row>
      </dl>
    </li>
  );
}

export function TeamSummaries({ league, teams }: { league: LeagueDetail; teams: Team[] }) {
  const Heading = league.conferences.length > 0 ? "h4" : "h3";
  return (
    <LeagueGroups league={league} teams={teams}>
      {(caption, members) => (
        <ul
          aria-label={`${caption} team summaries`}
          className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {members.map((team) => (
            <Panel key={team.id} summary={teamSummary(team)} Heading={Heading} />
          ))}
        </ul>
      )}
    </LeagueGroups>
  );
}
