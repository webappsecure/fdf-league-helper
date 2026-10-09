"use client";

import { useId } from "react";
import type { CellResult } from "@/lib/identity";
import { CellError, useCellAction, useDraft } from "./identity-cell";

// A name edited in place and saved on blur or Enter. `action` arrives already
// bound to what it renames, and says why when it refuses.
export function LeagueTextField({
  action,
  value,
  label,
  max,
}: {
  action: (text: string) => Promise<CellResult>;
  value: string;
  label: string;
  max: number;
}) {
  const errorId = useId();
  const { pending, error, setError, run } = useCellAction();
  const [draft, setDraft] = useDraft(value);

  function save() {
    if (pending) return;
    if (draft.trim() === value) {
      setDraft(value);
      setError(null);
      return;
    }
    run(() => action(draft));
  }

  // Read only while saving, so the text on its way is the text on screen and
  // focus stays where it is.
  return (
    <div aria-busy={pending}>
      <input
        type="text"
        value={draft}
        readOnly={pending}
        maxLength={max}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
        }}
        className="w-full max-w-sm rounded border border-border bg-background px-2 py-1 aria-invalid:border-danger"
      />
      <CellError id={errorId} error={error} />
    </div>
  );
}
