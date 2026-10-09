"use client";

// Opens the browser print dialog. The print styles leave only the card sheets
// on the paper.
export function PrintCards() {
  return (
    <>
      <button
        type="button"
        onClick={() => window.print()}
        className="mt-4 rounded bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover"
      >
        Print cards
      </button>
      <p className="mt-2 text-sm text-muted">
        Prints six cards per page on letter paper in landscape.
      </p>
    </>
  );
}
