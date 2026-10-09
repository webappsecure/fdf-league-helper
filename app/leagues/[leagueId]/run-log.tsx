import { GENERATION_STEPS, GENERATION_STEP_HEADINGS } from "@/lib/rules/generation";

// The steps run by one kind of run, in order, with the heading of each.
export function RunLog({
  entries,
  steps = GENERATION_STEPS,
  headings = GENERATION_STEP_HEADINGS,
}: {
  entries: { step: string; message: string }[];
  steps?: readonly string[];
  headings?: Record<string, string>;
}) {
  return (
    <div className="mt-2 space-y-2">
      {steps.map((step) => {
        const lines = entries.filter((entry) => entry.step === step);
        if (lines.length === 0) return null;
        return (
          <details key={step} className="rounded border border-border px-3 py-2">
            <summary className="cursor-pointer font-medium">{headings[step]}</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-6 text-sm">
              {lines.map((line, index) => (
                <li key={index}>{line.message}</li>
              ))}
            </ol>
          </details>
        );
      })}
    </div>
  );
}
