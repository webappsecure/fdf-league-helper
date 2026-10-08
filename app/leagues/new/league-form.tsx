"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import {
  MAX_TEAMS,
  MIN_TEAMS,
  defaultXpKickDistance,
  type ActionFailure,
  type FieldError,
  type XpKickDistance,
} from "@/lib/league-setup";
import { createLeagueAction } from "./actions";
import {
  FieldMessage,
  INPUT_CLASS,
  LabeledInput,
  type ConferenceRow,
  type DivisionRow,
  type StructureKind,
} from "./form-fields";
import { StructureFields } from "./structure-fields";

function toCount(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function toDivisionPayload(rows: DivisionRow[]) {
  return rows.map((row) => ({ name: row.name, teamCount: toCount(row.teamCount) }));
}

// Errors the server reported against the structure. They are keyed by row
// position, so they stop being true once a row is added or removed.
function isStructureError(error: FieldError): boolean {
  return (
    error.field === "structure" ||
    error.field.startsWith("divisions.") ||
    error.field.startsWith("conferences.")
  );
}

function ErrorSummary({
  summaryRef,
  message,
  errors,
}: {
  summaryRef: RefObject<HTMLDivElement | null>;
  message: string | undefined;
  errors: FieldError[];
}) {
  return (
    <div
      ref={summaryRef}
      tabIndex={-1}
      role="alert"
      className="rounded border border-danger bg-danger-surface p-4 text-danger-text"
    >
      <p className="font-medium">
        {message ?? "The league was not created. Fix the following:"}
      </p>
      {errors.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm">
          {errors.map((error) => (
            <li key={error.field}>
              <a href={`#field-${error.field}`} className="underline">
                {error.message}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
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
  // The failed submit whose structure errors no longer match the rows on screen.
  const [staleStructure, setStaleStructure] = useState<ActionFailure | null>(null);

  // Follows the season label until the user picks a distance by hand.
  const xpKickDistance = chosenXp ?? defaultXpKickDistance(seasonLabel);

  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state) summaryRef.current?.focus();
  }, [state]);

  const reported = state?.fieldErrors ?? [];
  const errors =
    state !== null && staleStructure === state
      ? reported.filter((error) => !isStructureError(error))
      : reported;

  // Submitted by hand: a form `action` makes React reset the form afterwards,
  // which unchecks the controlled radios after a failed submit.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const structure =
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
          : { kind };
    const formData = new FormData();
    formData.set(
      "payload",
      JSON.stringify({
        name,
        seasonLabel,
        xpKickDistance,
        teamCount: toCount(teamCount),
        structure,
      }),
    );
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {state && (state.error !== undefined || errors.length > 0) && (
        <ErrorSummary summaryRef={summaryRef} message={state.error} errors={errors} />
      )}

      <div>
        <LabeledInput
          field="name"
          label="League name"
          errors={errors}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div>
        <LabeledInput
          field="seasonLabel"
          label="Season label"
          hint={'Printed on team cards, for example "Season 1" or "2016".'}
          errors={errors}
          type="text"
          value={seasonLabel}
          onChange={(event) => setSeasonLabel(event.target.value)}
        />
      </div>

      <fieldset id="field-xpKickDistance" tabIndex={-1}>
        <legend className="font-medium">Extra point kick distance</legend>
        <p className="text-sm text-muted">
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
        <FieldMessage field="xpKickDistance" errors={errors} />
      </fieldset>

      <div>
        <LabeledInput
          field="teamCount"
          label="Number of teams"
          hint={`From ${MIN_TEAMS} to ${MAX_TEAMS}.`}
          errors={errors}
          type="number"
          min={MIN_TEAMS}
          max={MAX_TEAMS}
          value={teamCount}
          onChange={(event) => setTeamCount(event.target.value)}
          className={`${INPUT_CLASS} max-w-32`}
        />
      </div>

      <StructureFields
        kind={kind}
        divisions={divisions}
        conferences={conferences}
        teamCount={teamCount}
        errors={errors}
        onKindChange={setKind}
        onDivisionsChange={setDivisions}
        onConferencesChange={setConferences}
        onRowCountChange={() => setStaleStructure(state)}
      />

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Creating league..." : "Create league"}
      </button>
    </form>
  );
}
