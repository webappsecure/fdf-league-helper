"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import type { LeagueDetail } from "@/lib/leagues";
import type { ResultError, ResultField, TeamResult } from "@/lib/results";
import type { Team } from "@/lib/teams";
import { saveSeasonResultsAction } from "../actions";
import { LeagueGroups } from "../league-groups";

type Row = { wins: string; losses: string; ties: string; madePlayoffs: boolean };
type Field = "wins" | "losses" | "ties";

const FIELDS: { field: Field; label: string }[] = [
  { field: "wins", label: "Wins" },
  { field: "losses", label: "Losses" },
  { field: "ties", label: "Ties" },
];

function startingRows(teams: Team[], saved: TeamResult[]): Record<number, Row> {
  const byTeam = new Map(saved.map((result) => [result.teamId, result]));
  return Object.fromEntries(
    teams.map((team) => {
      const result = byTeam.get(team.id);
      const row: Row = result
        ? {
            wins: String(result.wins),
            losses: String(result.losses),
            ties: result.ties === 0 ? "" : String(result.ties),
            madePlayoffs: result.madePlayoffs,
          }
        : { wins: "", losses: "", ties: "", madePlayoffs: false };
      return [team.id, row];
    }),
  );
}

export function ResultsForm({
  league,
  teams,
  saved,
  maxGames,
}: {
  league: LeagueDetail;
  teams: Team[];
  saved: TeamResult[];
  // Passed down because lib/results also holds database code, which the browser
  // bundle cannot include.
  maxGames: number;
}) {
  const summaryId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(() => startingRows(teams, saved));
  const [champion, setChampion] = useState<number | null>(
    () => saved.find((result) => result.isChampion)?.teamId ?? null,
  );
  const [errors, setErrors] = useState<ResultError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  const teamName = new Map(teams.map((team) => [team.id, `${team.city} ${team.nickname}`]));
  const errorOf = (teamId: number | null, field: ResultField | null) =>
    errors.find((error) => error.teamId === teamId && error.field === field)?.message ?? null;

  // Drops the errors of the given fields of one team, or the league-wide ones.
  function clearError(teamId: number | null, fields: (ResultField | null)[]) {
    setErrors((current) =>
      current.filter((error) => error.teamId !== teamId || !fields.includes(error.field)),
    );
    setMessage(null);
  }

  function change(teamId: number, change: Partial<Row>) {
    setRows((current) => ({ ...current, [teamId]: { ...current[teamId], ...change } }));
    clearError(
      teamId,
      Object.keys(change).map((key) => (key === "madePlayoffs" ? "playoffs" : (key as Field))),
    );
  }

  function chooseChampion(teamId: number) {
    setChampion(teamId);
    change(teamId, { madePlayoffs: true });
    clearError(null, [null]);
  }

  function save() {
    if (saving) return;
    startTransition(async () => {
      const result = await saveSeasonResultsAction(league.id, {
        teams: teams.map((team) => ({ teamId: team.id, ...rows[team.id] })),
        championTeamId: champion,
      });
      if (result.success) {
        setErrors([]);
        setMessage("Results saved.");
        return;
      }
      setMessage(null);
      setErrors(
        result.errors ?? [
          { teamId: null, field: null, message: result.error ?? "Something went wrong." },
        ],
      );
      // The summary mounts with the errors, so focus waits for the next frame.
      requestAnimationFrame(() => summaryRef.current?.focus());
    });
  }

  function renderTable(caption: string, group: Team[]) {
    return (
      <table className="mt-2 w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border-strong text-left">
            <th scope="col" className="py-1 pr-2 font-medium">
              Team
            </th>
            {FIELDS.map(({ field, label }) => (
              <th key={field} scope="col" className="py-1 pr-2 font-medium">
                {label}
              </th>
            ))}
            <th scope="col" className="py-1 pr-2 font-medium">
              Made playoffs
            </th>
            <th scope="col" className="py-1 font-medium">
              Champion
            </th>
          </tr>
        </thead>
        <tbody>
          {group.map((team) => {
            const name = teamName.get(team.id) as string;
            const row = rows[team.id];
            const idOf = (field: ResultField) => `${summaryId}-${team.id}-${field}`;
            const teamErrors = errors.filter((error) => error.teamId === team.id);
            // Points an input at its own message only when it has one.
            const flag = (field: ResultField) =>
              errorOf(team.id, field)
                ? { "aria-invalid": true as const, "aria-describedby": idOf(field) }
                : {};
            return (
              <tr key={team.id} className="border-b border-border align-top">
                <th scope="row" className="py-1 pr-2 text-left font-normal">
                  {name}
                  {teamErrors.map((error) => (
                    <p
                      key={error.field}
                      id={idOf(error.field as ResultField)}
                      className="mt-1 text-xs text-danger"
                    >
                      {error.message}
                    </p>
                  ))}
                </th>
                {FIELDS.map(({ field, label }) => (
                  <td key={field} className="py-1 pr-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={row[field]}
                      maxLength={3}
                      aria-label={`${name} ${label.toLowerCase()}`}
                      {...flag(field)}
                      onChange={(event) => change(team.id, { [field]: event.target.value })}
                      className="w-16 rounded border border-border bg-background px-2 py-1 aria-invalid:border-danger"
                    />
                  </td>
                ))}
                <td className="py-1 pr-2">
                  <input
                    type="checkbox"
                    checked={row.madePlayoffs}
                    // The champion stays a playoff team until another is chosen.
                    disabled={champion === team.id}
                    aria-label={`${name} made playoffs`}
                    {...flag("playoffs")}
                    onChange={(event) => change(team.id, { madePlayoffs: event.target.checked })}
                    className="size-4"
                  />
                </td>
                <td className="py-1">
                  <input
                    type="radio"
                    name="champion"
                    checked={champion === team.id}
                    aria-label={`${name} league champion`}
                    onChange={() => chooseChampion(team.id)}
                    className="size-4"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  const leagueError = errorOf(null, null);
  const teamCount = new Set(
    errors.filter((error) => error.teamId !== null).map((error) => error.teamId),
  ).size;

  return (
    <form
      className="mt-6"
      aria-busy={saving}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <p className="text-muted">
        Enter every team&apos;s record (0 to {maxGames}; ties may stay blank), tick the
        playoff teams and choose the league champion.
      </p>

      {errors.length > 0 && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="mt-4 rounded border border-danger p-3 text-sm text-danger"
        >
          <p className="font-medium">
            {leagueError ??
              `${teamCount} ${teamCount === 1 ? "team needs" : "teams need"} attention.`}
          </p>
          {leagueError && teamCount > 0 && <p>Some teams also need attention.</p>}
        </div>
      )}

      <LeagueGroups league={league} teams={teams}>
        {renderTable}
      </LeagueGroups>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          // Stays focusable while saving, and save() ignores the press.
          aria-disabled={saving}
          className="rounded bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover aria-disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save results"}
        </button>
        <Link href={`/leagues/${league.id}`} className="text-link underline">
          Back to the league
        </Link>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </form>
  );
}
