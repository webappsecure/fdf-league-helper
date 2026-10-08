import { STEPS, STEP_HEADINGS } from "@/lib/rules/management";
import type { RunLogLine } from "@/lib/runs";

export function RunLog({ entries }: { entries: RunLogLine[] }) {
  return (
    <div className="mt-2 space-y-2">
      {STEPS.map((step) => {
        const lines = entries.filter((entry) => entry.step === step);
        if (lines.length === 0) return null;
        return (
          <details key={step} className="rounded border border-border px-3 py-2">
            <summary className="cursor-pointer font-medium">{STEP_HEADINGS[step]}</summary>
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
