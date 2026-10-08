"use client";

import { useState, useTransition } from "react";
import type { CellResult } from "@/lib/identity";

// A button that runs one Server Action for the league and shows why it failed.
// `action` arrives already bound to its league.
export function ActionButton({
  action,
  label,
  pendingLabel,
}: {
  action: () => Promise<CellResult>;
  label: string;
  pendingLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    startTransition(async () => {
      const result = await action();
      setError(result.success ? null : result.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="mt-3 rounded bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? pendingLabel : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
