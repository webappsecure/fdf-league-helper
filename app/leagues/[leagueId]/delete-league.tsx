"use client";

import { useActionState, useRef } from "react";
import { deleteLeagueAction } from "./actions";

export function DeleteLeague({ leagueId, name }: { leagueId: number; name: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(
    deleteLeagueAction.bind(null, leagueId),
    null,
  );

  return (
    <>
      {/* A native modal dialog moves focus in and returns it here on close. */}
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded border border-danger px-4 py-2 font-medium text-danger hover:bg-danger-surface"
      >
        Delete league
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="delete-league-title"
        className="m-auto max-w-md rounded border border-border bg-background p-6 text-foreground backdrop:bg-backdrop"
      >
        <h2 id="delete-league-title" className="text-lg font-semibold">
          Delete {name}?
        </h2>
        <p className="mt-2 text-muted">
          This permanently removes the league and everything in it. It cannot be undone.
        </p>
        {state?.error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {state.error}
          </p>
        )}
        <form action={formAction} className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            autoFocus
            onClick={() => dialogRef.current?.close()}
            className="rounded border border-border-strong px-4 py-2 font-medium hover:bg-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            // Disabling the pressed button would drop keyboard focus out of the
            // dialog, so it stays focusable and a press while it runs does not
            // submit the form again.
            aria-disabled={pending}
            onClick={(event) => {
              if (pending) event.preventDefault();
            }}
            className="rounded bg-danger-solid px-4 py-2 font-medium text-on-primary hover:bg-danger-hover aria-disabled:opacity-60"
          >
            {pending ? "Deleting..." : "Delete permanently"}
          </button>
        </form>
      </dialog>
    </>
  );
}
