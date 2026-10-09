"use client";

import { useId } from "react";
import type { CellResult } from "@/lib/identity";
import { CellError, useCellAction } from "../identity-cell";

// A button for one change to the off-season plan. `action` arrives already
// bound to its team or league; the label names what it acts on.
export function PlanButton({
  action,
  label,
  pendingLabel,
}: {
  action: () => Promise<CellResult>;
  label: string;
  pendingLabel: string;
}) {
  const { pending, error, run } = useCellAction();
  const errorId = useId();

  return (
    <div>
      <button
        type="button"
        // Disabling the pressed button would drop keyboard focus to the page, so
        // it stays focusable and ignores presses while the action runs.
        aria-disabled={pending}
        aria-describedby={error ? errorId : undefined}
        onClick={() => {
          if (!pending) run(action);
        }}
        className="rounded border border-border-strong px-2 py-1 text-sm hover:bg-hover aria-disabled:opacity-60"
      >
        {pending ? pendingLabel : label}
      </button>
      <CellError id={errorId} error={error} />
    </div>
  );
}
