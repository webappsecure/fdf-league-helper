"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, useTransition } from "react";
import {
  IDENTITY_TEXT_MAX,
  OFFENSE_TAGS,
  type CellResult,
  type OffenseTag,
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
export function useCellAction() {
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
// which is how a re-roll shows up. While typed text is being saved, `submitted`
// is the text that was sent, and the input only takes the saved value when it
// is that same text coming back (trimmed). Anything typed since is kept.
export function useDraft(saved: string, submitted: string | null = null) {
  const [draft, setDraft] = useState(saved);
  const [lastSaved, setLastSaved] = useState(saved);
  if (saved !== lastSaved) {
    setLastSaved(saved);
    if (submitted === null || (draft === submitted && saved === submitted.trim())) {
      setDraft(saved);
    }
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
      // Disabling the pressed button would drop keyboard focus to the page, so
      // it stays focusable and ignores presses while the save runs.
      aria-disabled={pending}
      // When focus is in this button's own cell, keep it there. Otherwise the
      // press would blur the cell's text input, start a save of its typed text
      // and disable this button before the click lands. Focus in any other cell
      // moves as usual, so that cell saves what was typed in it.
      onMouseDown={(event) => {
        if (event.currentTarget.parentElement?.contains(document.activeElement)) {
          event.preventDefault();
        }
      }}
      onClick={() => {
        if (!pending) run(() => rerollTeamFieldAction(teamId, field));
      }}
      className="shrink-0 rounded border border-border-strong p-1 hover:bg-hover aria-disabled:opacity-60"
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

export function CellError({ id, error }: { id: string; error: string | null }) {
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
    if (pending && submitted !== null) {
      // The page still shows the old saved value, so compare with the text on
      // its way instead. The same text is not sent twice, and anything else,
      // including the old value typed back in, is saved in turn.
      if (draft.trim() === submitted.trim()) return;
    } else if (draft.trim() === value) {
      setDraft(value);
      setError(null);
      return;
    }
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

export function OffenseTagCell({
  teamId,
  value,
  teamName,
}: {
  teamId: number;
  value: OffenseTag | null;
  teamName: string;
}) {
  const errorId = useId();
  const { pending, error, setError, run } = useCellAction();
  const [chosen, setChosen] = useState("");
  const saved = value ?? "";

  function choose(tag: string) {
    if (pending) return;
    setChosen(tag);
    run(() => updateTeamFieldAction(teamId, "offenseTag", tag));
  }

  // A failed save leaves the saved value in place, so the select goes back to
  // it. Choosing that value again fires no change, so leaving the select is
  // what dismisses the message. While saving the select stays focusable, since
  // disabling it would drop keyboard focus to the page.
  return (
    <div aria-busy={pending}>
      <select
        value={pending ? chosen : saved}
        aria-disabled={pending}
        aria-label={`${teamName} offense tag`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => choose(event.target.value)}
        onBlur={() => setError(null)}
        className="w-full min-w-0 rounded border border-border bg-background px-2 py-1 aria-invalid:border-danger"
      >
        <option value="">None</option>
        {OFFENSE_TAGS.map((tag) => (
          <option key={tag} value={tag}>
            {tag}
          </option>
        ))}
      </select>
      <CellError id={errorId} error={error} />
    </div>
  );
}
