"use client";

import { useState, useTransition } from "react";
import { fillTeamsAction } from "./actions";

export function FillTeams({ leagueId }: { leagueId: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function fill() {
    startTransition(async () => {
      const result = await fillTeamsAction(leagueId);
      setError(result.success ? null : result.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={fill}
        disabled={pending}
        className="mt-3 rounded bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Filling in teams..." : "Fill in teams"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
