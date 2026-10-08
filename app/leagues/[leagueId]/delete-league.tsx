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
        className="rounded border border-red-700 px-4 py-2 font-medium text-red-700 hover:bg-red-50"
      >
        Delete league
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="delete-league-title"
        className="m-auto max-w-md rounded border border-zinc-300 p-6 backdrop:bg-black/40"
      >
        <h2 id="delete-league-title" className="text-lg font-semibold">
          Delete {name}?
        </h2>
        <p className="mt-2 text-zinc-700">
          This permanently removes the league and everything in it. It cannot be undone.
        </p>
        {state?.error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {state.error}
          </p>
        )}
        <form action={formAction} className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            autoFocus
            onClick={() => dialogRef.current?.close()}
            className="rounded border border-zinc-400 px-4 py-2 font-medium hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800 disabled:opacity-60"
          >
            {pending ? "Deleting..." : "Delete permanently"}
          </button>
        </form>
      </dialog>
    </>
  );
}
