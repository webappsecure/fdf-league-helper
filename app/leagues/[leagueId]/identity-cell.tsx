"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, useTransition } from "react";
import {
  IDENTITY_TEXT_MAX,
  type CellResult,
  type RerollField,
  type TextField,
} from "@/lib/identity";
import { rerollTeamFieldAction, updateTeamFieldAction } from "./actions";

const FIELD_LABELS: Record<TextField, string> = {
  city: "city",
  nickname: "nickname",
  headCoachName: "head coach name",
};

// Runs one save or re-roll at a time for a cell and keeps its error message.
function useCellAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<CellResult>) {
    startTransition(async () => {
      const result = await action();
      setError(result.success ? null : result.error);
    });
  }

  return { pending, error, setError, run };
}

// What is typed in the input. It follows the saved value whenever that changes,
// which is how a re-roll or a trimmed save shows up. While a typed save is in
// flight, `submitted` is the text that was sent: if the input has moved on from
// it by the time the save lands, the newer text is kept.
function useDraft(saved: string, submitted: string | null = null) {
  const [draft, setDraft] = useState(saved);
  const [lastSaved, setLastSaved] = useState(saved);
  if (saved !== lastSaved) {
    setLastSaved(saved);
    if (submitted === null || draft === submitted) setDraft(saved);
  }
  return [draft, setDraft] as const;
}

function RerollButton({
  teamId,
  field,
  label,
  pending,
  run,
}: {
  teamId: number;
  field: RerollField;
  label: string;
  pending: boolean;
  run: (action: () => Promise<CellResult>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title="Re-roll"
      disabled={pending}
      onClick={() => run(() => rerollTeamFieldAction(teamId, field))}
      className="shrink-0 rounded border border-border-strong p-1 hover:bg-hover disabled:opacity-60"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    </button>
  );
}

function CellError({ id, error }: { id: string; error: string | null }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-danger">
      {error}
    </p>
  );
}

export function TextCell({
  teamId,
  field,
  value,
  teamName,
}: {
  teamId: number;
  field: TextField;
  value: string;
  teamName: string;
}) {
  const errorId = useId();
  const { pending, error, setError, run } = useCellAction();
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [draft, setDraft] = useDraft(value, submitted);

  function save() {
    if (draft.trim() === value) {
      setDraft(value);
      setError(null);
      return;
    }
    // Enter followed by leaving the cell would otherwise send the same text twice.
    if (pending && draft === submitted) return;
    setSubmitted(draft);
    run(() => updateTeamFieldAction(teamId, field, draft));
  }

  // A re-roll replaces whatever is typed, so nothing typed is waiting on a save.
  function reroll(action: () => Promise<CellResult>) {
    setSubmitted(null);
    run(action);
  }

  return (
    <div aria-busy={pending}>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={draft}
          maxLength={IDENTITY_TEXT_MAX}
          aria-label={`${teamName} ${FIELD_LABELS[field]}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
          }}
          className="w-full min-w-0 rounded border border-border bg-background px-2 py-1 aria-invalid:border-danger"
        />
        <RerollButton
          teamId={teamId}
          field={field}
          label={`Re-roll ${FIELD_LABELS[field]} for ${teamName}`}
          pending={pending}
          run={reroll}
        />
      </div>
      <CellError id={errorId} error={error} />
    </div>
  );
}

function ColorInput({
  value,
  label,
  errorId,
  invalid,
  onCommit,
}: {
  value: string;
  label: string;
  errorId: string;
  invalid: boolean;
  onCommit: (color: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useDraft(value);
  const commit = useEffectEvent(onCommit);

  // React's onChange fires for every movement inside the color picker. The
  // native change event fires once, when a color is chosen.
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const handleChange = () => commit(input.value);
    input.addEventListener("change", handleChange);
    return () => input.removeEventListener("change", handleChange);
  }, []);

  return (
    <input
      ref={ref}
      type="color"
      value={draft}
      aria-label={label}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={invalid ? errorId : undefined}
      onChange={(event) => setDraft(event.target.value)}
      className="h-7 w-9 shrink-0 cursor-pointer rounded border border-border bg-background"
    />
  );
}

export function ColorsCell({
  teamId,
  primaryColor,
  secondaryColor,
  teamName,
}: {
  teamId: number;
  primaryColor: string;
  secondaryColor: string;
  teamName: string;
}) {
  const errorId = useId();
  const { pending, error, setError, run } = useCellAction();

  function commit(field: "primaryColor" | "secondaryColor", saved: string, color: string) {
    if (color === saved) {
      setError(null);
      return;
    }
    run(() => updateTeamFieldAction(teamId, field, color));
  }

  return (
    <div aria-busy={pending}>
      <div className="flex items-center gap-1">
        <ColorInput
          value={primaryColor}
          label={`${teamName} primary color`}
          errorId={errorId}
          invalid={error !== null}
          onCommit={(color) => commit("primaryColor", primaryColor, color)}
        />
        <ColorInput
          value={secondaryColor}
          label={`${teamName} secondary color`}
          errorId={errorId}
          invalid={error !== null}
          onCommit={(color) => commit("secondaryColor", secondaryColor, color)}
        />
        <RerollButton
          teamId={teamId}
          field="colors"
          label={`Re-roll colors for ${teamName}`}
          pending={pending}
          run={run}
        />
      </div>
      <CellError id={errorId} error={error} />
    </div>
  );
}
