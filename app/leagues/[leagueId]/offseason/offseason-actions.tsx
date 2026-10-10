"use client";

import { useRef, useState, useTransition } from "react";
import { acceptOffseasonAction, discardOffseasonAction } from "../actions";

// Discards the off-season draft after confirming, which makes the plan editable again.
export function DiscardOffseason({ leagueId }: { leagueId: number }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    dialogRef.current?.showModal();
  }

  function discard() {
    if (pending) return;
    startTransition(async () => {
      const result = await discardOffseasonAction(leagueId);
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
        className="mt-3 rounded border border-danger px-4 py-2 font-medium text-danger hover:bg-danger-surface"
      >
        Discard off-season
      </button>

      <dialog
        aria-labelledby="discard-offseason-title"
        ref={dialogRef}
        className="m-auto max-w-md rounded border border-border bg-background p-6 text-foreground backdrop:bg-backdrop"
      >
        <h2 id="discard-offseason-title" className="text-lg font-semibold">
          Discard the off-season?
        </h2>
        <p className="mt-2 text-muted">
          This deletes the off-season draft and its log. The expansion, contraction and relocation
          plan stays and can be edited again.
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
            // Disabling the pressed button would drop keyboard focus out of the
            // dialog, so it stays focusable and ignores presses while it runs.
            aria-disabled={pending}
            onClick={discard}
            className="rounded bg-danger-solid px-4 py-2 font-medium text-on-primary hover:bg-danger-hover aria-disabled:opacity-60"
          >
            {pending ? "Discarding..." : "Discard off-season"}
          </button>
        </div>
      </dialog>
    </>
  );
}

// Accepts the off-season draft after confirming, which makes it the league's season.
export function AcceptOffseason({
  leagueId,
  seasonLabel,
}: {
  leagueId: number;
  seasonLabel: string;
}) {
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
      const result = await acceptOffseasonAction(leagueId);
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
        Accept off-season
      </button>

      <dialog
        aria-labelledby="accept-offseason-title"
        ref={dialogRef}
        className="m-auto max-w-md rounded border border-border bg-background p-6 text-foreground backdrop:bg-backdrop"
      >
        <h2 id="accept-offseason-title" className="text-lg font-semibold">
          Accept {seasonLabel}?
        </h2>
        <p className="mt-2 text-muted">
          This makes the off-season draft the league&apos;s season. Teams that left the league are
          retired, and the draft can no longer be re-rolled or discarded.
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
            // Disabling the pressed button would drop keyboard focus out of the
            // dialog, so it stays focusable and ignores presses while it runs.
            aria-disabled={pending}
            onClick={accept}
            className="rounded bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover aria-disabled:opacity-60"
          >
            {pending ? "Accepting..." : "Accept off-season"}
          </button>
        </div>
      </dialog>
    </>
  );
}
