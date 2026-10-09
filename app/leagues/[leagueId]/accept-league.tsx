"use client";

import { useRef, useState, useTransition } from "react";
import { acceptLeagueAction } from "./actions";

export function AcceptLeague({ leagueId, name }: { leagueId: number; name: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    dialogRef.current?.showModal();
  }

  function accept() {
    if (pending) return;
    startTransition(async () => {
      const result = await acceptLeagueAction(leagueId);
      if (result.success) {
        dialogRef.current?.close();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      {/* A native modal dialog moves focus in and returns it here on close. */}
      <button
        type="button"
        onClick={open}
        className="mt-3 rounded border border-border-strong px-4 py-2 font-medium hover:bg-hover"
      >
        Accept league
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="accept-league-title"
        className="m-auto max-w-md rounded border border-border bg-background p-6 text-foreground backdrop:bg-backdrop"
      >
        <h2 id="accept-league-title" className="text-lg font-semibold">
          Accept {name}?
        </h2>
        <p className="mt-2 text-muted">
          This makes the season official. The league can no longer be re-rolled.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            autoFocus
            onClick={() => dialogRef.current?.close()}
            className="rounded border border-border-strong px-4 py-2 font-medium hover:bg-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={accept}
            // Disabling the pressed button would drop keyboard focus out of the
            // dialog, so it stays focusable and ignores presses while it runs.
            aria-disabled={pending}
            className="rounded bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover aria-disabled:opacity-60"
          >
            {pending ? "Accepting..." : "Accept league"}
          </button>
        </div>
      </dialog>
    </>
  );
}
