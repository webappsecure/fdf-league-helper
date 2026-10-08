"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-zinc-600">
        The page could not be loaded. Your saved leagues have not been changed.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-4 rounded border border-zinc-400 px-4 py-2 font-medium hover:bg-zinc-100"
      >
        Try again
      </button>
    </div>
  );
}
