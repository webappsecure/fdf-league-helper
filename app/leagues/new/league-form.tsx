"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import {
  MAX_TEAMS,
  MIN_TEAMS,
  defaultXpKickDistance,
  type FieldError,
  type XpKickDistance,
} from "@/lib/league-setup";
import { createLeagueAction } from "./actions";

type DivisionRow = { key: number; name: string; teamCount: string };
type ConferenceRow = { key: number; name: string; divisions: DivisionRow[] };
type StructureKind = "none" | "divisions" | "conferences";

const INPUT_CLASS =
  "w-full rounded border border-zinc-400 px-3 py-2 aria-[invalid=true]:border-red-700";
const SECONDARY_BUTTON =
  "rounded border border-zinc-400 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100";

const STRUCTURE_OPTIONS: { kind: StructureKind; label: string }[] = [
  { kind: "none", label: "No divisions" },
  { kind: "divisions", label: "Divisions" },
  { kind: "conferences", label: "Conferences with divisions" },
];

function toCount(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function FieldMessage({ field, errors }: { field: string; errors: FieldError[] }) {
  const message = errors.find((error) => error.field === field)?.message;
  if (!message) return null;
  return (
    <p id={`error-${field}`} className="mt-1 text-sm text-red-700">
      {message}
    </p>
  );
}

export function LeagueForm() {
  const [state, formAction, pending] = useActionState(createLeagueAction, null);

  const [name, setName] = useState("");
  const [seasonLabel, setSeasonLabel] = useState("Season 1");
  const [chosenXp, setChosenXp] = useState<XpKickDistance | null>(null);
  const [teamCount, setTeamCount] = useState("");
  const [kind, setKind] = useState<StructureKind>("none");
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [conferences, setConferences] = useState<ConferenceRow[]>([]);

  const nextKey = useRef(0);
  const newDivision = (): DivisionRow => ({ key: nextKey.current++, name: "", teamCount: "" });

  // Follows the season label until the user picks a distance by hand.
  const xpKickDistance = chosenXp ?? defaultXpKickDistance(seasonLabel);

  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state) summaryRef.current?.focus();
  }, [state]);

  const fieldErrors = state?.fieldErrors ?? [];
  const errorFor = (field: string) =>
    fieldErrors.find((error) => error.field === field)?.message;

  function fieldProps(field: string) {
    const invalid = errorFor(field) !== undefined;
    return {
      id: `field-${field}`,
      "aria-invalid": invalid,
      "aria-describedby": invalid ? `error-${field}` : undefined,
    };
  }

  const toDivisionPayload = (rows: DivisionRow[]) =>
    rows.map((row) => ({ name: row.name, teamCount: toCount(row.teamCount) }));

  const payload = JSON.stringify({
    name,
    seasonLabel,
    xpKickDistance,
    teamCount: toCount(teamCount),
    structure:
      kind === "divisions"
        ? { kind, divisions: toDivisionPayload(divisions) }
        : kind === "conferences"
          ? {
              kind,
              conferences: conferences.map((conference) => ({
                name: conference.name,
                divisions: toDivisionPayload(conference.divisions),
              })),
            }
          : { kind },
  });

  // Submitted by hand: a form `action` makes React reset the form afterwards,
  // which unchecks the controlled radios after a failed submit.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData();
    formData.set("payload", payload);
    startTransition(() => formAction(formData));
  }

  function divisionRows(
    rows: DivisionRow[],
    prefix: string,
    update: (rows: DivisionRow[]) => void,
  ) {
    const change = (key: number, patch: Partial<DivisionRow>) =>
      update(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

    return (
      <div className="space-y-3">
        {rows.map((row, index) => {
          const nameField = `${prefix}.${index}.name`;
          const countField = `${prefix}.${index}.teamCount`;
          return (
            <div key={row.key} className="flex flex-wrap items-start gap-3">
              <div className="min-w-48 flex-1">
                <label htmlFor={`field-${nameField}`} className="block text-sm font-medium">
                  Division name
                </label>
                <input
                  {...fieldProps(nameField)}
                  type="text"
                  value={row.name}
                  onChange={(event) => change(row.key, { name: event.target.value })}
                  className={INPUT_CLASS}
                />
                <FieldMessage field={nameField} errors={fieldErrors} />
              </div>
              <div className="w-28">
                <label htmlFor={`field-${countField}`} className="block text-sm font-medium">
                  Teams
                </label>
                <input
                  {...fieldProps(countField)}
                  type="number"
                  min={1}
                  value={row.teamCount}
                  onChange={(event) => change(row.key, { teamCount: event.target.value })}
                  className={INPUT_CLASS}
                />
                <FieldMessage field={countField} errors={fieldErrors} />
              </div>
              <button
                type="button"
                onClick={() => update(rows.filter((other) => other.key !== row.key))}
                className={`${SECONDARY_BUTTON} mt-6`}
                aria-label={`Remove division ${row.name || index + 1}`}
              >
                Remove
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => update([...rows, newDivision()])}
          className={SECONDARY_BUTTON}
        >
          Add division
        </button>
      </div>
    );
  }

  const assigned = (kind === "divisions"
    ? divisions
    : conferences.flatMap((conference) => conference.divisions)
  ).reduce((sum, row) => sum + (Number(row.teamCount) || 0), 0);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">

      {state && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded border border-red-700 bg-red-50 p-4 text-red-900"
        >
          <p className="font-medium">
            {state.error ?? "The league was not created. Fix the following:"}
          </p>
          {fieldErrors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {fieldErrors.map((error) => (
                <li key={error.field}>
                  <a href={`#field-${error.field}`} className="underline">
                    {error.message}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <label htmlFor="field-name" className="block font-medium">
          League name
        </label>
        <input
          {...fieldProps("name")}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={INPUT_CLASS}
        />
        <FieldMessage field="name" errors={fieldErrors} />
      </div>

      <div>
        <label htmlFor="field-seasonLabel" className="block font-medium">
          Season label
        </label>
        <p className="text-sm text-zinc-600">
          Printed on team cards, for example &quot;Season 1&quot; or &quot;2016&quot;.
        </p>
        <input
          {...fieldProps("seasonLabel")}
          type="text"
          value={seasonLabel}
          onChange={(event) => setSeasonLabel(event.target.value)}
          className={INPUT_CLASS}
        />
        <FieldMessage field="seasonLabel" errors={fieldErrors} />
      </div>

      <fieldset id="field-xpKickDistance" tabIndex={-1}>
        <legend className="font-medium">Extra point kick distance</legend>
        <p className="text-sm text-zinc-600">
          Defaults to the 15-yard line when the season label is a year from 2015 on.
        </p>
        <div className="mt-2 flex gap-6">
          {([2, 15] as const).map((distance) => (
            <label key={distance} className="flex items-center gap-2">
              <input
                type="radio"
                name="xpKickDistanceChoice"
                checked={xpKickDistance === distance}
                onChange={() => setChosenXp(distance)}
              />
              {distance}-yard line
            </label>
          ))}
        </div>
        <FieldMessage field="xpKickDistance" errors={fieldErrors} />
      </fieldset>

      <div>
        <label htmlFor="field-teamCount" className="block font-medium">
          Number of teams
        </label>
        <p className="text-sm text-zinc-600">
          From {MIN_TEAMS} to {MAX_TEAMS}.
        </p>
        <input
          {...fieldProps("teamCount")}
          type="number"
          min={MIN_TEAMS}
          max={MAX_TEAMS}
          value={teamCount}
          onChange={(event) => setTeamCount(event.target.value)}
          className={`${INPUT_CLASS} max-w-32`}
        />
        <FieldMessage field="teamCount" errors={fieldErrors} />
      </div>

      <fieldset
        id="field-structure"
        tabIndex={-1}
        aria-describedby={errorFor("structure") ? "error-structure" : undefined}
      >
        <legend className="font-medium">Structure</legend>
        <div className="mt-2 flex flex-wrap gap-6">
          {STRUCTURE_OPTIONS.map((option) => (
            <label key={option.kind} className="flex items-center gap-2">
              <input
                type="radio"
                name="structureKind"
                checked={kind === option.kind}
                onChange={() => setKind(option.kind)}
              />
              {option.label}
            </label>
          ))}
        </div>

        {kind === "divisions" && (
          <div className="mt-4">{divisionRows(divisions, "divisions", setDivisions)}</div>
        )}

        {kind === "conferences" && (
          <div className="mt-4 space-y-4">
            {conferences.map((conference, index) => {
              const nameField = `conferences.${index}.name`;
              const divisionsField = `conferences.${index}.divisions`;
              const updateConference = (patch: Partial<ConferenceRow>) =>
                setConferences(
                  conferences.map((other) =>
                    other.key === conference.key ? { ...other, ...patch } : other,
                  ),
                );
              return (
                <div
                  key={conference.key}
                  id={`field-${divisionsField}`}
                  tabIndex={-1}
                  className="space-y-3 rounded border border-zinc-300 p-4"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-48 flex-1">
                      <label
                        htmlFor={`field-${nameField}`}
                        className="block text-sm font-medium"
                      >
                        Conference name
                      </label>
                      <input
                        {...fieldProps(nameField)}
                        type="text"
                        value={conference.name}
                        onChange={(event) => updateConference({ name: event.target.value })}
                        className={INPUT_CLASS}
                      />
                      <FieldMessage field={nameField} errors={fieldErrors} />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setConferences(
                          conferences.filter((other) => other.key !== conference.key),
                        )
                      }
                      className={`${SECONDARY_BUTTON} mt-6`}
                      aria-label={`Remove conference ${conference.name || index + 1}`}
                    >
                      Remove conference
                    </button>
                  </div>
                  <FieldMessage field={divisionsField} errors={fieldErrors} />
                  {divisionRows(conference.divisions, divisionsField, (rows) =>
                    updateConference({ divisions: rows }),
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={() =>
                setConferences([
                  ...conferences,
                  { key: nextKey.current++, name: "", divisions: [newDivision()] },
                ])
              }
              className={SECONDARY_BUTTON}
            >
              Add conference
            </button>
          </div>
        )}

        {kind !== "none" && (
          <p className="mt-3 text-sm text-zinc-600" aria-live="polite">
            {assigned} of {Number(teamCount) || 0} teams assigned to divisions.
          </p>
        )}
        <FieldMessage field="structure" errors={fieldErrors} />
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {pending ? "Creating league..." : "Create league"}
      </button>
    </form>
  );
}
